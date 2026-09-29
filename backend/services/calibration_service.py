"""
AgriGuard — Model Confidence Calibration Service
================================================
Post-hoc Platt scaling (one-vs-rest sigmoid on the base model's class
log-odds, then renormalised) fitted on a calibration split the base model
never saw (years 2019–2021, see ml/training/train_model.py).

The fitted parameters are stored as plain JSON (calibration_params.json) so
they do not depend on scikit-learn pickle compatibility. Every result
reports the method that was ACTUALLY used:
  * "platt"             — fitted Platt calibrator applied
  * "analytic-fallback" — no calibrator available / it failed; a fixed
                          sigmoid of the raw risk score is used (uncalibrated)
"""

import json
import logging
import threading
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[2]
SAVED_MODELS_DIR = ROOT / "saved_models"
ML_SAVED_MODELS_DIR = ROOT / "ml" / "training" / "saved_models"

PLATT_VERSION = "2.0.0-platt"
FALLBACK_VERSION = "0.0.0-analytic-fallback"
_EPS = 1e-6


# ── Calibrator ────────────────────────────────────────────────

class PlattCalibratedModel:
    """Base classifier + per-class Platt parameters; exposes predict_proba/classes_."""

    def __init__(self, base_model: Any, params: Dict[str, Any]):
        self.base_model = base_model
        self.params = params
        self.classes_ = np.array(params["classes"])

    def calibrate_probs(self, raw: np.ndarray) -> np.ndarray:
        raw = np.clip(np.asarray(raw, dtype=float), _EPS, 1 - _EPS)
        logit = np.log(raw / (1 - raw))
        a = np.asarray(self.params["a"], dtype=float)
        b = np.asarray(self.params["b"], dtype=float)
        p = 1.0 / (1.0 + np.exp(-(a * logit + b)))
        return p / p.sum(axis=1, keepdims=True)

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        return self.calibrate_probs(self.base_model.predict_proba(X))

    def predict(self, X: np.ndarray) -> np.ndarray:
        return self.classes_[self.predict_proba(X).argmax(axis=1)]


def fit_platt_calibrator(
    base_model: Any,
    X_calib: np.ndarray,
    y_calib: np.ndarray,
    out_dir: Optional[Path] = None,
) -> PlattCalibratedModel:
    """Fit one-vs-rest Platt scaling on a held-out calibration split and save it."""
    from sklearn.linear_model import LogisticRegression

    raw = np.clip(base_model.predict_proba(X_calib), _EPS, 1 - _EPS)
    classes = list(range(raw.shape[1]))
    a, b = [], []
    for k in classes:
        z = np.log(raw[:, k] / (1 - raw[:, k])).reshape(-1, 1)
        yk = (np.asarray(y_calib) == k).astype(int)
        if yk.min() == yk.max():  # degenerate class in calibration split → identity
            a.append(1.0); b.append(0.0)
            continue
        lr = LogisticRegression(C=1e6, max_iter=1000).fit(z, yk)
        a.append(float(lr.coef_[0, 0])); b.append(float(lr.intercept_[0]))

    params = {"method": "platt", "version": PLATT_VERSION, "classes": classes,
              "a": a, "b": b, "n_calibration": int(len(y_calib))}
    calibrated = PlattCalibratedModel(base_model, params)

    for d in {Path(out_dir or ML_SAVED_MODELS_DIR), ML_SAVED_MODELS_DIR}:
        d.mkdir(parents=True, exist_ok=True)
        with open(d / "calibration_params.json", "w") as f:
            json.dump(params, f, indent=2)
    _reset_cache()
    return calibrated


def train_calibrator(base_model, X_train, y_train, X_calib, y_calib, method="sigmoid", out_dir=None):
    """Legacy entry point: fits Platt scaling on (X_calib, y_calib) only; X_train is unused."""
    if method != "sigmoid":
        raise ValueError("only method='sigmoid' (Platt) is supported")
    return fit_platt_calibrator(base_model, X_calib, y_calib, out_dir=out_dir)


# ── Evaluation ────────────────────────────────────────────────

def _reliability(target_probs: np.ndarray, y_bin: np.ndarray, n_bins: int = 10):
    bins = np.linspace(0.0, 1.0, n_bins + 1)
    pred, act, counts = [], [], []
    ece = 0.0
    n = len(target_probs)
    for i in range(n_bins):
        lo, hi = bins[i], bins[i + 1]
        m = (target_probs >= lo) & ((target_probs < hi) if i < n_bins - 1 else (target_probs <= hi))
        c = int(m.sum())
        if c == 0:
            continue  # empty bins are omitted, never invented
        mp, ma = float(target_probs[m].mean()), float(y_bin[m].mean())
        pred.append(round(mp, 4)); act.append(round(ma, 4)); counts.append(c)
        ece += (c / n) * abs(ma - mp)
    return pred, act, counts, float(ece)


def evaluate_calibration(
    calibrated_model: Any,
    X_test: np.ndarray,
    y_test: np.ndarray,
    target_class: Any = 2,
    out_dir: Optional[Path] = None,
    raw_probs: Optional[np.ndarray] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """ECE / Brier for the target class on an unseen test split; writes calibration_report.json."""
    from sklearn.metrics import brier_score_loss

    probs = calibrated_model.predict_proba(X_test)
    classes = list(calibrated_model.classes_)
    t_idx = classes.index(target_class) if target_class in classes else len(classes) - 1
    y_bin = (np.asarray(y_test) == classes[t_idx]).astype(int)

    pred, act, counts, ece = _reliability(probs[:, t_idx], y_bin)
    brier = float(brier_score_loss(y_bin, probs[:, t_idx]))
    method = getattr(calibrated_model, "params", {}).get("method", "platt")

    report = {
        "model_calibration_version": PLATT_VERSION if method == "platt" else FALLBACK_VERSION,
        "calibration_method": method,
        "method": "sigmoid (Platt scaling, one-vs-rest, renormalised)" if method == "platt" else method,
        "target_class": "High" if t_idx == 2 else str(classes[t_idx]),
        "n_test_samples": int(len(y_test)),
        "reliability_diagram": {
            "mean_predicted_confidence": pred,
            "fraction_actually_correct": act,
            "bin_counts": counts,
        },
        "expected_calibration_error": round(ece, 4),
        "brier_score": round(brier, 4),
        "confidence_bands": {"High": ">= 0.80", "Moderate": "0.55 - 0.79", "Low": "< 0.55"},
    }
    if raw_probs is not None:
        _, _, _, ece_raw = _reliability(raw_probs[:, t_idx], y_bin)
        report["ece_raw"] = round(ece_raw, 4)
        report["brier_raw"] = round(float(brier_score_loss(y_bin, raw_probs[:, t_idx])), 4)
    if extra:
        report.update(extra)
    report["explanation"] = (
        f"Platt scaling fitted on a held-out calibration split; on the unseen test split the "
        f"High-class ECE is {ece * 100:.2f}% and Brier score {brier:.4f}"
        + (f" (uncalibrated: ECE {report['ece_raw'] * 100:.2f}%, Brier {report['brier_raw']:.4f})."
           if "ece_raw" in report else ".")
        + " Labels are rule-derived weather-suitability classes, not observed outbreaks."
    )

    for d in {Path(out_dir or ML_SAVED_MODELS_DIR), ML_SAVED_MODELS_DIR, SAVED_MODELS_DIR}:
        d.mkdir(parents=True, exist_ok=True)
        with open(d / "calibration_report.json", "w") as f:
            json.dump(report, f, indent=2)
    return report


def plot_reliability_diagram(report: Dict[str, Any], save_path: Optional[str] = None) -> str:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    mean_pred = report["reliability_diagram"]["mean_predicted_confidence"]
    frac = report["reliability_diagram"]["fraction_actually_correct"]
    ece = report.get("expected_calibration_error", 0.0)
    plt.figure(figsize=(6, 6))
    plt.plot([0, 1], [0, 1], "k--", linewidth=1.5, label="Perfect calibration")
    plt.plot(mean_pred, frac, "s-", color="#059669", linewidth=2, markersize=6,
             label=f"{report.get('calibration_method', 'platt')} (ECE {ece:.4f})")
    plt.xlim(0, 1); plt.ylim(0, 1)
    plt.xlabel("Mean predicted probability"); plt.ylabel("Observed frequency")
    plt.title(f"Reliability — {report.get('target_class', 'High')} class (test split)")
    plt.legend(loc="lower right"); plt.grid(True, linestyle=":", alpha=0.6); plt.tight_layout()

    out_file = Path(save_path) if save_path else ML_SAVED_MODELS_DIR / "reliability_diagram.png"
    out_file.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(out_file, dpi=150, bbox_inches="tight")
    plt.close()
    import shutil
    for mirror in (ML_SAVED_MODELS_DIR / "reliability_diagram.png", SAVED_MODELS_DIR / "reliability_diagram.png"):
        if mirror.resolve() != out_file.resolve():
            try:
                mirror.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(out_file, mirror)
            except Exception:
                pass
    return str(out_file)


# ── Runtime ───────────────────────────────────────────────────

_CACHED_CALIBRATOR: Optional[PlattCalibratedModel] = None
_LOAD_ATTEMPTED = False
_LOCK = threading.Lock()


def _reset_cache():
    global _CACHED_CALIBRATOR, _LOAD_ATTEMPTED
    with _LOCK:
        _CACHED_CALIBRATOR, _LOAD_ATTEMPTED = None, False


def load_calibrated_model() -> Optional[PlattCalibratedModel]:
    """Platt calibrator built from calibration_params.json + the live base model (thread-safe, cached)."""
    global _CACHED_CALIBRATOR, _LOAD_ATTEMPTED
    if _LOAD_ATTEMPTED:
        return _CACHED_CALIBRATOR
    with _LOCK:
        if _LOAD_ATTEMPTED:
            return _CACHED_CALIBRATOR
        _LOAD_ATTEMPTED = True
        p = ML_SAVED_MODELS_DIR / "calibration_params.json"
        if not p.exists():
            logger.warning("No calibration_params.json at %s — calibration uses analytic fallback", p)
            return None
        try:
            with open(p) as f:
                params = json.load(f)
            from backend.services.inference_service import model_manager
            _CACHED_CALIBRATOR = PlattCalibratedModel(model_manager.model, params)
        except Exception as e:
            logger.error("Failed to load Platt calibrator: %s", e)
            _CACHED_CALIBRATOR = None
        return _CACHED_CALIBRATOR


def get_calibration_report() -> Dict[str, Any]:
    """Return the calibration_report.json written by training, or an explicit 'not available' report."""
    for p in (ML_SAVED_MODELS_DIR / "calibration_report.json", SAVED_MODELS_DIR / "calibration_report.json"):
        if p.exists():
            try:
                with open(p) as f:
                    return json.load(f)
            except Exception:
                pass
    return {
        "model_calibration_version": FALLBACK_VERSION,
        "calibration_method": "analytic-fallback",
        "available": False,
        "reliability_diagram": {"mean_predicted_confidence": [], "fraction_actually_correct": []},
        "expected_calibration_error": None,
        "brier_score": None,
        "explanation": "No calibration report found. Run: python -m ml.training.train_model",
    }


def derive_confidence_band(confidence: float) -> str:
    if confidence >= 0.80:
        return "High"
    if confidence >= 0.55:
        return "Moderate"
    return "Low"


def calibrate_prediction(
    X_scaled: Optional[np.ndarray],
    raw_score: float,
    risk_level: str = "High",
    raw_probs: Optional[np.ndarray] = None,
) -> Dict[str, Any]:
    """
    Calibrated probability of the reported risk_level class. The returned
    'calibration_method' / 'model_calibration_version' state what was used.
    """
    raw_conf = float(np.max(raw_probs)) if raw_probs is not None and len(raw_probs) else float(raw_score)
    target = {"High": 2, "Medium": 1}.get(risk_level, 0)

    method = "analytic-fallback"
    calibrated_conf = None
    calibrator = load_calibrated_model() if (X_scaled is not None or raw_probs is not None) else None
    if calibrator is not None:
        try:
            if raw_probs is not None:
                probs = calibrator.calibrate_probs(np.asarray(raw_probs).reshape(1, -1))[0]
            else:
                probs = calibrator.predict_proba(X_scaled)[0]
            calibrated_conf = float(probs[list(calibrator.classes_).index(target)])
            method = "platt"
        except Exception as e:
            logger.warning("Platt calibration failed, using analytic fallback: %s", e)
    if calibrated_conf is None:
        # Uncalibrated fixed mapping of the raw score — reported as such.
        calibrated_conf = float(1.0 / (1.0 + np.exp(-3.5 * (raw_score - 0.45))))

    calibrated_conf = float(np.clip(calibrated_conf, 0.0, 1.0))
    return {
        "raw_confidence": round(raw_conf, 4),
        "calibrated_confidence": round(calibrated_conf, 4),
        "confidence_band": derive_confidence_band(calibrated_conf),
        "model_calibration_version": PLATT_VERSION if method == "platt" else FALLBACK_VERSION,
        "calibration_method": method,
    }
