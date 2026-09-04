"""
CropShield — SHAP Explainer Module
Generates per-prediction SHAP explanations and waterfall plots.
"""

import json
from pathlib import Path
from typing import Dict, List, Any, Optional

import numpy as np
import pandas as pd
import joblib
import shap
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[2]
SAVE_DIR = ROOT / "ml" / "training" / "saved_models"
PLOT_DIR = ROOT / "ml" / "xai" / "plots"
PLOT_DIR.mkdir(parents=True, exist_ok=True)


def load_artifacts():
    model = joblib.load(SAVE_DIR / "pest_risk_model.joblib")
    scaler = joblib.load(SAVE_DIR / "scaler.joblib")
    with open(SAVE_DIR / "feature_names.json") as f:
        feature_names = json.load(f)
    return model, scaler, feature_names


def explain_prediction(
    feature_dict: Dict[str, float],
    prediction_id: int = 0,
    save_plot: bool = True,
) -> Dict[str, Any]:
    """
    Generate SHAP explanation for a single prediction.

    Args:
        feature_dict: Feature name → value mapping
        prediction_id: For plot filename
        save_plot: Whether to save waterfall plot

    Returns:
        Dictionary with shap_values, base_value, top_features
    """
    model, scaler, feature_names = load_artifacts()

    # Build feature vector
    X = pd.DataFrame([{f: feature_dict.get(f, 0.0) for f in feature_names}])
    X_scaled = scaler.transform(X.values)

    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(X_scaled)

    # High risk class (class 2) SHAP values
    if isinstance(shap_values, list):
        sv = shap_values[2][0]
        base_val = explainer.expected_value[2]
    else:
        sv = shap_values[0]
        base_val = explainer.expected_value

    # Sort by absolute SHAP value
    feat_sv = sorted(
        zip(feature_names, X.iloc[0].values, sv),
        key=lambda x: abs(x[2]),
        reverse=True,
    )

    top_features = [
        {
            "feature": f,
            "value": round(float(v), 4),
            "shap_value": round(float(s), 4),
            "impact": "increases risk" if s > 0 else "decreases risk",
            "abs_impact": round(abs(float(s)), 4),
        }
        for f, v, s in feat_sv[:12]
    ]

    # Waterfall plot
    if save_plot:
        try:
            fig, ax = plt.subplots(figsize=(10, 6))
            top_n = feat_sv[:10]
            names = [f for f, _, _ in top_n]
            values = [s for _, _, s in top_n]
            colors = ["#d73027" if v > 0 else "#4575b4" for v in values]

            bars = ax.barh(names[::-1], values[::-1], color=colors[::-1], height=0.6)
            ax.axvline(0, color="black", linewidth=0.8)
            ax.set_xlabel("SHAP Value (impact on risk score)")
            ax.set_title(f"Pest Risk Explanation — Prediction #{prediction_id}")

            for bar, val in zip(bars, values[::-1]):
                ax.text(
                    bar.get_width() + 0.002 if val >= 0 else bar.get_width() - 0.002,
                    bar.get_y() + bar.get_height() / 2,
                    f"{val:+.3f}",
                    va="center",
                    ha="left" if val >= 0 else "right",
                    fontsize=9,
                )

            plt.tight_layout()
            plot_path = PLOT_DIR / f"shap_pred_{prediction_id}.png"
            plt.savefig(plot_path, dpi=130, bbox_inches="tight")
            plt.close()
        except Exception:
            pass

    return {
        "base_value": round(float(base_val), 4),
        "prediction_shap_sum": round(float(sv.sum()), 4),
        "top_features": top_features,
        "interpretation": _interpret_shap(top_features),
    }


def _interpret_shap(top_features: List[Dict]) -> str:
    """Generate human-readable interpretation of SHAP values."""
    pos = [f for f in top_features if f["shap_value"] > 0.01]
    neg = [f for f in top_features if f["shap_value"] < -0.01]

    parts = []
    if pos:
        drivers = ", ".join([_friendly_name(f["feature"]) for f in pos[:3]])
        parts.append(f"Risk is elevated mainly due to: {drivers}.")
    if neg:
        mitigators = ", ".join([_friendly_name(f["feature"]) for f in neg[:2]])
        parts.append(f"Risk is reduced by: {mitigators}.")

    return " ".join(parts) if parts else "Prediction driven by combination of climate and soil factors."


def _friendly_name(feature: str) -> str:
    """Convert feature name to human-readable label."""
    mapping = {
        "t2m": "mean temperature",
        "rh2m": "relative humidity",
        "rain_rolling_7d": "7-day rainfall",
        "rain_rolling_14d": "14-day rainfall",
        "t2m_rolling_7d": "7-day avg temperature",
        "rh2m_rolling_7d": "7-day avg humidity",
        "consecutive_dry_days": "dry spell duration",
        "heat_index": "heat index",
        "temp_range": "diurnal temperature range",
        "soil_oc": "soil organic carbon",
        "soil_ph": "soil pH",
        "soil_clay_pct": "clay content",
        "et0": "evapotranspiration",
    }
    for key, label in mapping.items():
        if key in feature:
            return label
    return feature.replace("_", " ")
