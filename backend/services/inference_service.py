"""
CropShield — Inference Service (v4)
Generates TODAY's pest warning using:
  - Latest NASA POWER weather (≥31-day window for rolling features)
  - The shared feature pipeline ml/data/feature_engineering.py (same code as training)
  - XGBoost model trained on REAL NASA POWER data 2005–2018 with rule-derived
    weather-suitability labels (see ml/data/LABELING.md)
  - SHAP explanations

No silent zero-filling: if any model feature is missing the call logs an error
and falls back to the documented rule index, flagged by
model_version == RULES_FALLBACK_VERSION.

All functions are synchronous and thread-safe (callers may use asyncio.to_thread).
"""

import json
import logging
import threading
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import joblib

from backend.utils.config import settings

logger = logging.getLogger(__name__)

RULES_FALLBACK_VERSION = "rules-fallback-v2"

# Default risk boundaries on the 0-100 scale (score < low_max → Low,
# score < medium_max → Medium, else High). Equivalent to the historical
# 0.35 / 0.65 cut-offs on the 0-1 risk score.
DEFAULT_RISK_THRESHOLDS = {"low_max": 35.0, "medium_max": 65.0}


class FeatureMismatchError(RuntimeError):
    """Model expects features the live pipeline did not produce."""


def _current_thresholds() -> Dict[str, float]:
    """Admin-configured thresholds (backend.services.risk_thresholds) with safe defaults."""
    try:
        from backend.services.risk_thresholds import get_risk_thresholds
        t = get_risk_thresholds() or {}
        low, med = float(t["low_max"]), float(t["medium_max"])
        if low <= 1.0 and med <= 1.0:  # given as fractions
            low, med = low * 100.0, med * 100.0
        if 0.0 < low < med <= 100.0:
            return {"low_max": low, "medium_max": med}
        logger.error("Invalid risk thresholds %s — using defaults", t)
    except ImportError:
        pass
    except Exception as e:
        logger.warning("risk_thresholds unavailable (%s) — using defaults", e)
    return dict(DEFAULT_RISK_THRESHOLDS)


def score_to_risk_level(score: float) -> str:
    """score in [0, 1] → Low | Medium | High using the configured boundaries."""
    t = _current_thresholds()
    s = float(score) * 100.0
    if s >= t["medium_max"]:
        return "High"
    if s >= t["low_max"]:
        return "Medium"
    return "Low"


# ── Singleton model manager ───────────────────────────────────

class ModelManager:
    """Loads model, scaler, feature names and SHAP explainer once (thread-safe)."""

    _instance: Optional["ModelManager"] = None
    _new_lock = threading.Lock()

    def __new__(cls):
        with cls._new_lock:
            if cls._instance is None:
                inst = super().__new__(cls)
                inst._lock = threading.RLock()
                inst._model = None
                inst._scaler = None
                inst._features: List[str] = []
                inst._explainer = None
                inst._version = "unknown"
                cls._instance = inst
        return cls._instance

    def load(self):
        with self._lock:
            if self._model is not None:
                return
            mp = Path(settings.MODEL_PATH)
            sp = Path(settings.SCALER_PATH)
            fp = Path(settings.FEATURE_NAMES_PATH)
            for p in (mp, sp, fp):
                if not p.exists():
                    raise FileNotFoundError(
                        f"Model artifact not found at {p}. Run: python -m ml.training.train_model"
                    )
            model = joblib.load(mp)
            scaler = joblib.load(sp)
            with open(fp) as f:
                features = json.load(f)
            n_model = getattr(model, "n_features_in_", len(features))
            if n_model != len(features):
                raise FeatureMismatchError(
                    f"feature_names.json has {len(features)} names but model expects {n_model}"
                )
            version = "unknown"
            metrics_path = mp.parent / "metrics.json"
            if metrics_path.exists():
                with open(metrics_path) as f:
                    version = json.load(f).get("model_version", "unknown")
            import shap
            explainer = shap.TreeExplainer(model)
            self._scaler, self._features, self._version = scaler, features, version
            self._explainer = explainer
            self._model = model  # set last: signals "fully loaded"

    @property
    def model(self):
        if self._model is None:
            self.load()
        return self._model

    @property
    def scaler(self):
        if self._model is None:
            self.load()
        return self._scaler

    @property
    def features(self) -> List[str]:
        if self._model is None:
            self.load()
        return self._features

    @property
    def explainer(self):
        if self._model is None:
            self.load()
        return self._explainer

    @property
    def version(self) -> str:
        if self._model is None:
            self.load()
        return self._version

    def shap_values(self, X_scaled: np.ndarray):
        # TreeExplainer is not documented as thread-safe → serialise calls
        with self._lock:
            return self.explainer.shap_values(X_scaled)


model_manager = ModelManager()


# ── Model input (shared by predict_today and the calibration step) ──

def build_model_input(
    weather_series: pd.DataFrame,
    soil: Dict,
    crop: str,
    climate_zone: str,
) -> Tuple[pd.DataFrame, np.ndarray]:
    """
    Return (X_df with exactly the training feature columns, X_scaled).
    Raises FeatureMismatchError if any trained feature is missing — never zero-fills.
    """
    from ml.data.feature_engineering import build_live_feature_row

    mgr = model_manager
    row = build_live_feature_row(weather_series, soil, crop, climate_zone)
    missing = [c for c in mgr.features if c not in row.columns]
    if missing:
        logger.error("Live features missing %d trained columns: %s", len(missing), missing)
        raise FeatureMismatchError(f"live feature row is missing trained features: {missing}")
    X_df = row[mgr.features].astype(np.float64)
    if not np.isfinite(X_df.to_numpy()).all():
        bad = X_df.columns[~np.isfinite(X_df.to_numpy()).all(axis=0)].tolist()
        raise FeatureMismatchError(f"non-finite live feature values: {bad}")
    X_scaled = mgr.scaler.transform(X_df.to_numpy(dtype=np.float32))
    return X_df, X_scaled


def predict_proba_today(
    weather_series: pd.DataFrame,
    soil: Dict,
    crop: str,
    climate_zone: str,
) -> Tuple[np.ndarray, np.ndarray]:
    """Return (raw class probabilities [Low, Medium, High], X_scaled) — for calibration."""
    _, X_scaled = build_model_input(weather_series, soil, crop, climate_zone)
    return model_manager.model.predict_proba(X_scaled)[0], X_scaled


def _proba_to_score(prob: np.ndarray) -> float:
    if len(prob) == 3:
        return float(np.clip(prob[1] * 0.5 + prob[2] * 1.0, 0.0, 1.0))
    return float(np.clip(prob[-1], 0.0, 1.0))


# ── Main inference entry point ────────────────────────────────

def predict_today(
    weather_series: pd.DataFrame,
    soil: Dict,
    crop: str,
    climate_zone: str,
) -> Tuple[float, str, List[Dict], str]:
    """
    Generate today's pest warning from the latest weather time series.

    Returns:
        risk_score    float  0.0–1.0   (P(Medium)·0.5 + P(High))
        risk_level    str    Low | Medium | High
        top_features  list   SHAP-ranked feature explanations
        model_version str    model version, or RULES_FALLBACK_VERSION when the
                             model could not be used (flagged fallback)
    """
    try:
        mgr = model_manager
        X_df, X_scaled = build_model_input(weather_series, soil, crop, climate_zone)
        prob = mgr.model.predict_proba(X_scaled)[0]
        risk_score = _proba_to_score(prob)
        risk_level = score_to_risk_level(risk_score)

        sv = mgr.shap_values(X_scaled)
        if isinstance(sv, list):
            sv_arr = sv[2][0] if len(sv) >= 3 else sv[-1][0]
        else:
            sv = np.asarray(sv)
            if sv.ndim == 3:
                sv_arr = sv[0, :, 2] if sv.shape[-1] >= 3 else sv[0, :, -1]
            elif sv.ndim == 2:
                sv_arr = sv[0]
            else:
                sv_arr = sv.flatten()

        feat_data = sorted(
            zip(mgr.features, X_df.iloc[0].values, sv_arr),
            key=lambda x: abs(float(x[2])), reverse=True,
        )
        top_features = [
            {
                "feature": f,
                "value": round(float(v), 4),
                "shap_value": round(float(s), 4),
                "impact": "positive" if s > 0 else "negative",
            }
            for f, v, s in feat_data[:12]
        ]
        return risk_score, risk_level, top_features, mgr.version

    except FileNotFoundError as e:
        logger.error("Pest model unavailable (%s) — using rule fallback", e)
    except Exception as e:
        logger.error("XGBoost inference failed (%s: %s) — using rule fallback", type(e).__name__, e)
    return _rule_fallback(weather_series, soil, crop, climate_zone)


def predict_pest_risk(
    weather_df: pd.DataFrame,
    crop: str,
    climate_zone: str,
    soil: Optional[Dict] = None,
) -> Dict:
    """
    Dict-returning wrapper used by geospatial_service. Keys: risk_score,
    risk_level, top_features, model_version, is_fallback,
    feature_engineered_row, today_weather_raw, detected_pests.
    """
    from backend.services import pest_service, soil_service
    from ml.data.feature_engineering import engineer_features

    soil = soil or soil_service.get_soil_profile(climate_zone)
    score, level, top, version = predict_today(weather_df, soil, crop, climate_zone)
    fe_row: Dict = {}
    try:
        fe_row = engineer_features(weather_df).iloc[-1].to_dict()
    except Exception as e:
        logger.warning("feature row for display failed: %s", e)
    raw_today = weather_df.sort_values("date").iloc[-1].to_dict() if len(weather_df) else {}
    detected = pest_service.detect_pests(crop=crop, weather_features=fe_row, soil_features=soil) if fe_row else []
    return {
        "risk_score": score,
        "risk_level": level,
        "top_features": top,
        "model_version": version,
        "is_fallback": version == RULES_FALLBACK_VERSION,
        "feature_engineered_row": fe_row,
        "today_weather_raw": raw_today,
        "detected_pests": detected,
    }


def _rule_fallback(
    weather_series: pd.DataFrame,
    soil: Dict,
    crop: str,
    climate_zone: str,
) -> Tuple[float, str, List[Dict], str]:
    """
    Documented rule index (the same function that produced the training labels,
    ml/data/pest_labels.py). Returned version RULES_FALLBACK_VERSION flags it.
    """
    try:
        from ml.data.feature_engineering import engineer_features
        from ml.data.pest_labels import crop_risk_index, pests_for_crop, pest_weather_score

        fe = engineer_features(weather_series).iloc[[-1]].reset_index(drop=True)
        idx, pest = crop_risk_index(fe, crop)
        score = float(idx[0])
        feats = [
            {"feature": "rule_index", "value": round(score, 4), "shap_value": 0.0,
             "impact": "positive" if score >= 0.35 else "negative", "dominant_pest": str(pest[0])},
        ]
        for p in pests_for_crop(crop):
            feats.append({"feature": f"rule:{p['pest_name']}",
                          "value": round(float(pest_weather_score(fe, p)[0]), 4),
                          "shap_value": 0.0, "impact": "positive"})
        return score, score_to_risk_level(score), feats, RULES_FALLBACK_VERSION
    except Exception as e:
        logger.error("Rule fallback failed (%s) — returning score 0 flagged as fallback", e)
        return 0.0, "Low", [], RULES_FALLBACK_VERSION


def _friendly(feat: str) -> str:
    m = {
        "t2m": "Temperature", "rh2m": "Humidity", "rain_rolling_7d": "7-day Rainfall",
        "rain_rolling_14d": "14-day Rainfall", "t2m_rolling_7d": "7-day Avg Temp",
        "rh2m_rolling_7d": "7-day Avg Humidity", "consecutive_dry_days": "Dry Spell",
        "heat_index": "Heat Index", "temp_range": "Temp Range", "vpd": "Vapour Pressure Deficit",
        "rh_trend_7d": "Humidity Trend", "temp_trend_7d": "Temp Trend",
        "rain_rolling_30d": "30-day Rainfall", "month_sin": "Season (sin)",
        "doy_sin": "Season (sin)", "doy_cos": "Season (cos)", "crop_": "Crop type",
        "soil_oc": "Soil Org. Carbon", "soil_ph": "Soil pH",
    }
    for k, v in m.items():
        if k in feat:
            return v
    return feat.replace("_", " ").title()


def build_shap_interpretation(top_features: List[Dict]) -> str:
    """Human-readable explanation from SHAP values."""
    pos = [f for f in top_features if f["shap_value"] > 0.01]
    neg = [f for f in top_features if f["shap_value"] < -0.01]
    parts = []
    if pos:
        parts.append(f"Risk driven by: {', '.join(_friendly(f['feature']) for f in pos[:3])}.")
    if neg:
        parts.append(f"Mitigated by: {', '.join(_friendly(f['feature']) for f in neg[:2])}.")
    return " ".join(parts) or "Risk reflects current weather suitability for the crop's key pests."
