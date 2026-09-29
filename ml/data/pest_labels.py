"""
CropShield — Rule-derived pest weather-suitability labels
=========================================================

There is no public day-level ground-truth dataset of pest outbreaks for
Tamil Nadu. Training labels are therefore a **documented weather-suitability
index**, NOT observed outbreaks. See ``ml/data/LABELING.md`` for the
thresholds, their literature sources, and the limitations.

Single source of truth
----------------------
The per-pest thresholds are read from
``backend.services.pest_service.PEST_DATABASE`` — the same table the app's
rule-based pest detection (``pest_service.detect_pests``) uses — and the
scoring below reproduces the *weather* rules of ``detect_pests`` exactly
(rule weights 0.30 / 0.25 / 0.20 / 0.15). The soil-pH rule of
``detect_pests`` (+0.05) is deliberately excluded because it is not a
weather signal.

  pest score  = 0.30·[T in range] + 0.25·[RH in range]
              + 0.20·[7-day rain ≤ max]  + 0.20·[7-day rain ≥ min]
              + 0.15·[dry spell ≥ threshold]          (clipped to 1)
  crop index  = max over the crop's pests
  label       = Low (< 0.35) | Medium (< 0.65) | High (≥ 0.65)
                (same boundaries as detect_pests "Suspected"/"Confirmed")
"""

from typing import Dict, List, Tuple

import numpy as np
import pandas as pd

# Mirrors backend/services/pest_service.detect_pests rule weights.
RULE_WEIGHTS = {"temp": 0.30, "rh": 0.25, "rain": 0.20, "dry": 0.15}
LABEL_LOW_MAX = 0.35      # detect_pests: score >= 0.35 → "Suspected"
LABEL_MEDIUM_MAX = 0.65   # detect_pests: score >= 0.65 → "Confirmed"
LABEL_NAMES = ["Low", "Medium", "High"]

# Weather inputs used by the rules (produced by engineer_features)
RULE_INPUTS = ["t2m", "rh2m", "rain_rolling_7d", "consecutive_dry_days"]


def _pest_database() -> Dict[str, List[Dict]]:
    from backend.services.pest_service import PEST_DATABASE
    return PEST_DATABASE


def pests_for_crop(crop: str) -> List[Dict]:
    db = _pest_database()
    return db.get(crop.strip().title(), db.get(crop, []))


def pest_weather_score(fe: pd.DataFrame, pest: Dict) -> np.ndarray:
    """Vectorised weather-only score of pest_service.detect_pests for one pest."""
    t = fe["t2m"].to_numpy(dtype=float)
    rh = fe["rh2m"].to_numpy(dtype=float)
    r7 = fe["rain_rolling_7d"].to_numpy(dtype=float)
    dry = fe["consecutive_dry_days"].to_numpy(dtype=float)

    score = np.zeros(len(fe), dtype=float)
    score += RULE_WEIGHTS["temp"] * ((t >= pest["favorable_temp_min"]) & (t <= pest["favorable_temp_max"]))
    score += RULE_WEIGHTS["rh"] * ((rh >= pest.get("favorable_rh_min", 0)) & (rh <= pest.get("favorable_rh_max", 100)))
    if "favorable_rain_max_7d" in pest:
        score += RULE_WEIGHTS["rain"] * (r7 <= pest["favorable_rain_max_7d"])
    if "favorable_rain_min_7d" in pest:
        score += RULE_WEIGHTS["rain"] * (r7 >= pest["favorable_rain_min_7d"])
    thr = pest.get("dry_spell_days", 0)
    if thr > 0:
        score += RULE_WEIGHTS["dry"] * (dry >= thr)
    return np.clip(score, 0.0, 1.0)


def crop_risk_index(fe: pd.DataFrame, crop: str) -> Tuple[np.ndarray, np.ndarray]:
    """Return (index in [0,1], name of the pest giving the max) per row."""
    pests = pests_for_crop(crop)
    if not pests:
        raise ValueError(f"No pest rules for crop '{crop}' in pest_service.PEST_DATABASE")
    scores = np.vstack([pest_weather_score(fe, p) for p in pests])
    idx = scores.argmax(axis=0)
    names = np.array([p["pest_name"] for p in pests])[idx]
    return scores.max(axis=0), names


def index_to_label(index: np.ndarray) -> np.ndarray:
    """0 = Low, 1 = Medium, 2 = High."""
    index = np.asarray(index, dtype=float)
    return np.where(index >= LABEL_MEDIUM_MAX, 2, np.where(index >= LABEL_LOW_MAX, 1, 0)).astype(int)
