"""
CropShield — Inference Service (v2)
Generates TODAY's pest warning using:
  - Latest NASA POWER weather (35-day window for rolling features)
  - Feature engineering pipeline from ml/data/feature_engineering.py
  - Trained XGBoost model (NASA POWER 1980–2025)
  - SHAP explanations
"""

import json
import warnings
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import joblib
import shap

from backend.utils.config import settings

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[3]


def score_to_risk_level(score: float) -> str:
    if score >= 0.65:
        return "High"
    if score >= 0.35:
        return "Medium"
    return "Low"


# ── Singleton model manager ───────────────────────────────────

class ModelManager:
    _instance: Optional["ModelManager"] = None
    _model     = None
    _scaler    = None
    _features: List[str] = []
    _explainer = None
    _version: str = "unknown"

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def load(self):
        mp = Path(settings.MODEL_PATH)
        sp = Path(settings.SCALER_PATH)
        fp = Path(settings.FEATURE_NAMES_PATH)

        if not mp.exists():
            raise FileNotFoundError(
                f"Model not found at {mp}. "
                "Run: python -m ml.training.train_model"
            )
        self._model   = joblib.load(mp)
        self._scaler  = joblib.load(sp)
        with open(fp) as f:
            self._features = json.load(f)

        metrics_path = mp.parent / "metrics.json"
        if metrics_path.exists():
            with open(metrics_path) as f:
                self._version = json.load(f).get("model_version", "2.0.0")

        self._explainer = shap.TreeExplainer(self._model)

    @property
    def model(self):
        if self._model is None: self.load()
        return self._model

    @property
    def scaler(self):
        if self._scaler is None: self.load()
        return self._scaler

    @property
    def features(self) -> List[str]:
        if not self._features: self.load()
        return self._features

    @property
    def explainer(self):
        if self._explainer is None: self.load()
        return self._explainer

    @property
    def version(self) -> str:
        if self._model is None: self.load()
        return self._version


model_manager = ModelManager()


# ── Main inference entry point ────────────────────────────────

def predict_today(
    weather_series: pd.DataFrame,
    soil: Dict,
    crop: str,
    climate_zone: str,
) -> Tuple[float, str, List[Dict], str]:
    """
    Generate today's pest warning from the latest weather time series.

    Args:
        weather_series: DataFrame with 35 days of raw NASA POWER data
        soil:           Research-based soil profile dict
        crop:           Crop name string
        climate_zone:   Tamil Nadu zone name

    Returns:
        risk_score    float  0.0–1.0
        risk_level    str    Low | Medium | High
        top_features  list   SHAP-ranked feature explanations
        model_version str
    """
    try:
        mgr = model_manager
        from ml.data.feature_engineering import build_live_feature_row

        X_df = build_live_feature_row(weather_series, soil, crop, climate_zone)

        # Align to training columns
        for col in mgr.features:
            if col not in X_df.columns:
                X_df[col] = 0.0
        X_df = X_df[mgr.features]

        X_scaled = mgr.scaler.transform(X_df.values.astype(np.float32))

        # Predict
        prob = mgr.model.predict_proba(X_scaled)[0]
        # risk_score = weighted combination of medium+high probabilities
        if len(prob) == 3:
            risk_score = float(prob[1] * 0.5 + prob[2] * 1.0)
        else:
            risk_score = float(prob[-1])
        risk_score = float(np.clip(risk_score, 0.0, 1.0))
        risk_level = score_to_risk_level(risk_score)

        # SHAP
        sv = mgr.explainer.shap_values(X_scaled)
        sv_arr = sv[2][0] if isinstance(sv, list) and len(sv) == 3 else (
            sv[-1][0] if isinstance(sv, list) else sv[0]
        )

        feat_data = list(zip(mgr.features, X_df.iloc[0].values, sv_arr))
        feat_data.sort(key=lambda x: abs(x[2]), reverse=True)

        top_features = [
            {
                "feature":    f,
                "value":      round(float(v), 4),
                "shap_value": round(float(s), 4),
                "impact":     "positive" if s > 0 else "negative",
            }
            for f, v, s in feat_data[:12]
        ]

        return risk_score, risk_level, top_features, mgr.version

    except FileNotFoundError:
        return _rule_fallback(weather_series, soil, crop, climate_zone)
    except Exception as e:
        warnings.warn(f"XGBoost inference failed ({e}), falling back to rules")
        return _rule_fallback(weather_series, soil, crop, climate_zone)


def _rule_fallback(
    weather_series: pd.DataFrame,
    soil: Dict,
    crop: str,
    climate_zone: str,
) -> Tuple[float, str, List[Dict], str]:
    """Heuristic fallback when model artifacts are missing."""
    from ml.data.feature_engineering import engineer_features

    fe = engineer_features(weather_series)
    row = fe.iloc[-1]

    t   = row.get("t2m", 30)
    rh  = row.get("rh2m", 60)
    r7  = row.get("rain_rolling_7d", 0)
    dry = row.get("consecutive_dry_days", 0)

    score = 0.0
    feats = []
    if t > 32:
        score += 0.20
        feats.append({"feature":"t2m","value":t,"shap_value":0.20,"impact":"positive"})
    if rh > 75:
        score += 0.20
        feats.append({"feature":"rh2m","value":rh,"shap_value":0.20,"impact":"positive"})
    if r7 > 30:
        score += 0.15
        feats.append({"feature":"rain_rolling_7d","value":r7,"shap_value":0.15,"impact":"positive"})
    if dry > 5:
        score += 0.15
        feats.append({"feature":"consecutive_dry_days","value":dry,"shap_value":0.15,"impact":"positive"})

    mods = {"Cotton":1.1,"Rice":1.15,"Sorghum":1.0,"Millets":0.95,"Sugarcane":1.05,"Pulses":1.0}
    score = min(1.0, score * mods.get(crop, 1.0))
    return score, score_to_risk_level(score), feats, "rules-fallback-v1"


def _friendly(feat: str) -> str:
    m = {
        "t2m":"Temperature","rh2m":"Humidity","rain_rolling_7d":"7-day Rainfall",
        "rain_rolling_14d":"14-day Rainfall","t2m_rolling_7d":"7-day Avg Temp",
        "rh2m_rolling_7d":"7-day Avg Humidity","consecutive_dry_days":"Dry Spell",
        "heat_index":"Heat Index","temp_range":"Temp Range","vpd":"Vapour Pressure Deficit",
        "rh_trend_7d":"Humidity Trend","temp_trend_7d":"Temp Trend",
        "rain_rolling_30d":"30-day Rainfall","month_sin":"Season (sin)",
        "soil_oc":"Soil Org. Carbon","soil_ph":"Soil pH",
    }
    for k, v in m.items():
        if k in feat: return v
    return feat.replace("_"," ").title()


def build_shap_interpretation(top_features: List[Dict]) -> str:
    """Human-readable explanation from SHAP values."""
    pos = [f for f in top_features if f["shap_value"] > 0.01]
    neg = [f for f in top_features if f["shap_value"] < -0.01]
    parts = []
    if pos:
        drivers = ", ".join(_friendly(f["feature"]) for f in pos[:3])
        parts.append(f"Risk driven by: {drivers}.")
    if neg:
        mitigators = ", ".join(_friendly(f["feature"]) for f in neg[:2])
        parts.append(f"Mitigated by: {mitigators}.")
    return " ".join(parts) or "Risk reflects combined climate and soil conditions."
