"""
CropShield — Feature Engineering Pipeline
Transforms raw NASA POWER historical data into ML-ready features
for current-day pest warning prediction.

Called by:
  - ml/training/train_model.py  (build training matrix)
  - backend/services/inference_service.py  (build live inference row)
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


# ── Pest-climate label derivation ────────────────────────────
# Crop-to-pest-risk rules based on Tamil Nadu entomology literature.
# Each rule maps climate conditions to a continuous risk [0, 1].
# These become training labels when applied to historical data.

def _compute_risk_score(row: pd.Series, crop: str, zone: str) -> float:
    """
    Derive a daily pest risk score from weather features.
    Encodes known pest-climate relationships for each crop.
    """
    t    = row.get("t2m", 30)
    rh   = row.get("rh2m", 60)
    r7   = row.get("rain_rolling_7d", 0)
    r14  = row.get("rain_rolling_14d", 0)
    dry  = row.get("consecutive_dry_days", 0)
    hi   = row.get("heat_index", t)
    month = int(row.get("month", 6))

    score = 0.0
    crop_l = crop.lower()

    # ── Cotton ────────────────────────────────────────────────
    if "cotton" in crop_l:
        # Bollworm: warm + moderate humidity
        if 28 <= t <= 38 and 50 <= rh <= 78 and r7 < 18:
            score += 0.38
        # Whitefly/Thrips: hot-dry spell
        if t > 32 and rh < 58 and dry >= 6:
            score += 0.40
        # Aphid: warm-wet
        if rh > 75 and r7 > 20:
            score += 0.22

    # ── Rice ─────────────────────────────────────────────────
    elif "rice" in crop_l:
        # BPH + Blast: humid + warm + wet
        if rh > 80 and 24 <= t <= 32 and r7 > 28:
            score += 0.55
        # Leaf Folder
        if rh > 70 and 26 <= t <= 34:
            score += 0.25
        # Sheath blight favoured by extended rain
        if r14 > 60 and rh > 85:
            score += 0.18

    # ── Sorghum ───────────────────────────────────────────────
    elif "sorghum" in crop_l:
        # Stem Borer
        if 25 <= t <= 35 and rh > 50:
            score += 0.40
        # Shoot Fly
        if rh > 65 and r7 > 15:
            score += 0.28

    # ── Millets ───────────────────────────────────────────────
    elif "millet" in crop_l:
        if t > 28 and rh > 52:
            score += 0.35
        if dry >= 3 and t > 30:
            score += 0.20

    # ── Sugarcane ─────────────────────────────────────────────
    elif "sugarcane" in crop_l:
        if t > 28 and rh < 72 and dry >= 4:
            score += 0.42
        if t > 30:
            score += 0.12

    # ── Pulses ────────────────────────────────────────────────
    elif "pulse" in crop_l:
        if t > 26 and rh < 70 and r7 < 15:
            score += 0.40
        if t > 30 and rh < 55:
            score += 0.20

    # ── Seasonal factor (NE monsoon Oct-Dec highest risk in TN)
    if month in [10, 11, 12]:
        score *= 1.12
    elif month in [3, 4, 5]:
        if "cotton" in crop_l or "pulse" in crop_l:
            score *= 1.08

    # ── Zone factor
    zone_mod = {"Dryland": 1.05, "Irrigated": 1.08, "Delta": 1.14,
                "Semi-arid": 0.96, "Humid": 1.04}
    score *= zone_mod.get(zone, 1.0)

    return float(np.clip(score, 0.0, 1.0))


def _score_to_label(score: float) -> int:
    """0=Low, 1=Medium, 2=High"""
    if score >= 0.60:
        return 2
    if score >= 0.30:
        return 1
    return 0


# ── Core feature engineering ──────────────────────────────────

def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Given a DataFrame with raw daily NASA POWER columns
    (t2m, t2m_max, t2m_min, rh2m, ws2m, prectotcorr,
     allsky_sfc_sw_dwn, et0, date),
    compute all ML features in-place.

    Works on both:
    - Multi-year historical DataFrames (sorted by [location, date])
    - Single-row live inference (uses scalar fallback for rolling)
    """
    df = df.copy()
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").reset_index(drop=True)

    # ── Calendar features ─────────────────────────────────────
    df["month"]     = df["date"].dt.month
    df["day_of_year"] = df["date"].dt.dayofyear
    # Sine/cosine encoding to capture cyclicality
    df["month_sin"] = np.sin(2 * np.pi * df["month"] / 12)
    df["month_cos"] = np.cos(2 * np.pi * df["month"] / 12)
    df["doy_sin"]   = np.sin(2 * np.pi * df["day_of_year"] / 365)
    df["doy_cos"]   = np.cos(2 * np.pi * df["day_of_year"] / 365)

    # ── Derived daily features ────────────────────────────────
    df["temp_range"] = df["t2m_max"] - df["t2m_min"]
    df["heat_index"] = df.apply(
        lambda r: _heat_index(r["t2m"], r["rh2m"]), axis=1
    )
    df["vpd"] = _vpd_series(df["t2m"], df["rh2m"])  # Vapour pressure deficit

    # ── Rolling means: temperature ────────────────────────────
    for w, sfx in [(3, "3d"), (7, "7d"), (14, "14d"), (30, "30d")]:
        df[f"t2m_rolling_{sfx}"]  = df["t2m"].rolling(w, min_periods=1).mean()
        df[f"rh2m_rolling_{sfx}"] = df["rh2m"].rolling(w, min_periods=1).mean()

    # ── Rolling sums: rainfall ────────────────────────────────
    for w, sfx in [(3, "3d"), (7, "7d"), (14, "14d"), (30, "30d")]:
        df[f"rain_rolling_{sfx}"] = df["prectotcorr"].rolling(w, min_periods=1).sum()

    # ── Cumulative monthly rainfall ───────────────────────────
    df["rain_monthly_cumul"] = df.groupby(
        [df["date"].dt.year, df["date"].dt.month]
    )["prectotcorr"].cumsum()

    # ── Lag features (yesterday, 3 days ago, 7 days ago) ─────
    for lag in [1, 3, 7]:
        df[f"t2m_lag{lag}"]  = df["t2m"].shift(lag)
        df[f"rh2m_lag{lag}"] = df["rh2m"].shift(lag)
        df[f"rain_lag{lag}"] = df["prectotcorr"].shift(lag)

    # ── Humidity trend (7d slope) ─────────────────────────────
    df["rh_trend_7d"] = (
        df["rh2m"].rolling(7, min_periods=3)
        .apply(lambda x: np.polyfit(range(len(x)), x, 1)[0], raw=True)
    )

    # ── Temperature trend (7d slope) ─────────────────────────
    df["temp_trend_7d"] = (
        df["t2m"].rolling(7, min_periods=3)
        .apply(lambda x: np.polyfit(range(len(x)), x, 1)[0], raw=True)
    )

    # ── Consecutive dry days ──────────────────────────────────
    dry_flag = (df["prectotcorr"] < 1.0).astype(int)
    consec = []
    count = 0
    for v in dry_flag:
        count = count + 1 if v else 0
        consec.append(count)
    df["consecutive_dry_days"] = consec

    # ── Consecutive wet days ──────────────────────────────────
    wet_flag = (df["prectotcorr"] >= 1.0).astype(int)
    consec_wet = []
    count = 0
    for v in wet_flag:
        count = count + 1 if v else 0
        consec_wet.append(count)
    df["consecutive_wet_days"] = consec_wet

    # ── Fill NaN from lags at start of series ─────────────────
    lag_cols = [c for c in df.columns if "lag" in c or "trend" in c]
    df[lag_cols] = df[lag_cols].fillna(method="bfill").fillna(0)

    return df


def build_training_matrix(
    historical_df: pd.DataFrame,
    crops: Optional[List[str]] = None,
) -> pd.DataFrame:
    """
    From raw multi-location historical weather data,
    build the full ML training matrix with:
    - engineered features per location
    - soil profile merged in
    - crop / zone one-hot columns
    - pest risk label (0/1/2)

    One row = one location-crop-day combination.
    Rows with insufficient lag data (first 30 days per location) dropped.
    """
    if crops is None:
        crops = ["Cotton", "Sorghum", "Millets", "Rice", "Sugarcane", "Pulses"]

    from backend.services.soil_service import get_soil_profile

    all_frames = []
    locations = historical_df["location"].unique() if "location" in historical_df.columns else ["default"]

    for loc in locations:
        if "location" in historical_df.columns:
            loc_df = historical_df[historical_df["location"] == loc].copy()
            zone = loc_df["zone"].iloc[0] if "zone" in loc_df.columns else "Dryland"
        else:
            loc_df = historical_df.copy()
            zone = "Dryland"

        # Engineer features for this location's time series
        loc_fe = engineer_features(loc_df)

        # Drop first 30 rows (insufficient rolling history)
        loc_fe = loc_fe.iloc[30:].copy()

        for crop in crops:
            crop_df = loc_fe.copy()

            # Soil features for this zone
            soil = get_soil_profile(zone)
            crop_df["soil_ph"]            = soil["ph"]
            crop_df["soil_ec"]            = soil["ec"]
            crop_df["soil_oc"]            = soil["organic_carbon"]
            crop_df["soil_nitrogen"]      = soil["nitrogen"]
            crop_df["soil_phosphorus"]    = soil["phosphorus"]
            crop_df["soil_potassium"]     = soil["potassium"]
            crop_df["soil_clay_pct"]      = soil["clay_pct"]
            crop_df["soil_sand_pct"]      = soil["sand_pct"]
            crop_df["soil_bulk_density"]  = soil["bulk_density"]

            # Crop one-hot
            for c in crops:
                crop_df[f"crop_{c.lower()}"] = int(c == crop)

            # Zone one-hot
            for z in ["Dryland", "Irrigated", "Delta", "Semi-arid", "Humid"]:
                crop_df[f"zone_{z.lower().replace('-','_')}"] = int(z == zone)

            # Pest risk label
            crop_df["risk_score"] = crop_df.apply(
                lambda r: _compute_risk_score(r, crop, zone), axis=1
            )
            crop_df["risk_label"] = crop_df["risk_score"].apply(_score_to_label)

            # Keep minimal metadata for audit
            crop_df["location"] = loc
            crop_df["zone_name"] = zone
            crop_df["crop_name"] = crop

            all_frames.append(crop_df)

    combined = pd.concat(all_frames, ignore_index=True)
    print(
        f"Training matrix: {len(combined):,} rows × "
        f"{combined.shape[1]} cols from {len(locations)} locations, "
        f"{len(crops)} crops"
    )
    return combined


def get_feature_columns(df: pd.DataFrame) -> List[str]:
    """Return the model feature columns (exclude meta, label, dates)."""
    exclude = {
        "date", "location", "zone", "zone_name", "crop_name",
        "risk_score", "risk_label",
        "month", "day_of_year",  # kept as month_sin/cos instead
    }
    return [c for c in df.columns if c not in exclude
            and df[c].dtype in [np.float64, np.float32, np.int64, np.int32, int, float]]


# ── Live inference feature builder ───────────────────────────

def build_live_feature_row(
    weather_series: pd.DataFrame,
    soil: Dict,
    crop: str,
    climate_zone: str,
) -> pd.DataFrame:
    """
    Build a single-row feature DataFrame for today's inference.

    `weather_series` must contain at least 30 days of history
    ending on (or near) today, so rolling/lag features are valid.
    """
    crops = ["Cotton", "Sorghum", "Millets", "Rice", "Sugarcane", "Pulses"]
    zones = ["Dryland", "Irrigated", "Delta", "Semi-arid", "Humid"]

    # Engineer on the full series, take last row (= today)
    fe_df = engineer_features(weather_series)
    row = fe_df.iloc[-1].to_dict()

    # Crop one-hot
    for c in crops:
        row[f"crop_{c.lower()}"] = int(c.lower() == crop.lower())

    # Zone one-hot
    for z in zones:
        row[f"zone_{z.lower().replace('-','_')}"] = int(z.lower() == climate_zone.lower())

    # Soil
    row["soil_ph"]           = soil.get("ph", 7.0)
    row["soil_ec"]           = soil.get("ec", 0.2)
    row["soil_oc"]           = soil.get("organic_carbon", 0.5)
    row["soil_nitrogen"]     = soil.get("nitrogen", 200)
    row["soil_phosphorus"]   = soil.get("phosphorus", 20)
    row["soil_potassium"]    = soil.get("potassium", 180)
    row["soil_clay_pct"]     = soil.get("clay_pct", 25)
    row["soil_sand_pct"]     = soil.get("sand_pct", 50)
    row["soil_bulk_density"] = soil.get("bulk_density", 1.5)

    return pd.DataFrame([row])


# ── Helper functions ──────────────────────────────────────────

def _heat_index(temp_c: float, rh: float) -> float:
    t = temp_c * 9 / 5 + 32
    hi = (
        -42.379 + 2.04901523 * t + 10.14333127 * rh
        - 0.22475541 * t * rh - 6.83783e-3 * t**2
        - 5.481717e-2 * rh**2 + 1.22874e-3 * t**2 * rh
        + 8.5282e-4 * t * rh**2 - 1.99e-6 * t**2 * rh**2
    )
    return round((hi - 32) * 5 / 9, 2)


def _vpd_series(temp: pd.Series, rh: pd.Series) -> pd.Series:
    """Vapour pressure deficit (kPa) — plant stress indicator."""
    es = 0.6108 * np.exp(17.27 * temp / (temp + 237.3))
    ea = es * rh / 100
    return (es - ea).round(3)
