"""
CropShield — Feature Engineering Pipeline (single source for train + live)
=========================================================================

ONE pipeline is used by both training and live inference, so feature names
match by construction:

    raw NASA POWER daily frame (UPPER or lower-case names)
      → clean_weather()          rename, gap-fill, physical clipping
      → engineer_features()      calendar, rolling, lag, trend, spell features
      → add_crop_one_hot()       int 0/1 crop columns
      = build_feature_frame(weather_df, crop)

  * Training  (ml/training/train_model.py) calls build_feature_frame on the full
    multi-year series of each location and keeps rows ≥ MIN_HISTORY_DAYS.
  * Inference (backend/services/inference_service.py) calls
    build_live_feature_row → build_feature_frame on the ~36-day live window and
    takes the last row.

Every feature only looks back ≤ 30 days (rolling windows ≤ 30, lags ≤ 7,
spell counters capped at SPELL_CAP=30), so the last row of a ≥31-day live
window is numerically identical to the same day computed on the full series.

The model's input columns are MODEL_FEATURES (exported to feature_names.json
at training time). Soil / climate-zone values are carried in the live row for
display only — they are NOT model inputs because the training labels do not
depend on them (see ml/data/LABELING.md).

Units (NASA POWER community=AG): °C, %, m/s, mm/day, MJ/m²/day.
"""

from typing import Dict, List, Optional

import numpy as np
import pandas as pd

# ── Constants ─────────────────────────────────────────────────

CROPS: List[str] = ["Cotton", "Sorghum", "Millets", "Rice", "Sugarcane", "Pulses"]
CROP_ALIASES = {"paddy": "Rice", "millet": "Millets", "pulse": "Pulses"}
ZONES: List[str] = ["Dryland", "Irrigated", "Delta", "Semi-arid", "Humid"]

MIN_HISTORY_DAYS = 31   # rows needed so every rolling/lag/spell feature is complete
SPELL_CAP = 30          # dry/wet spell counters are capped (live window is ~36 days)
DRY_DAY_MM = 1.0        # IMD convention: a "rainy day" has ≥ 2.5 mm; CropShield uses 1 mm (WMO "wet day")

NASA_RENAME = {
    "T2M": "t2m", "T2M_MAX": "t2m_max", "T2M_MIN": "t2m_min",
    "RH2M": "rh2m", "WS2M": "ws2m", "PRECTOTCORR": "prectotcorr",
    "ALLSKY_SFC_SW_DWN": "allsky_sfc_sw_dwn", "TOA_SW_DWN": "toa_sw_dwn",
}
RAW_WEATHER_COLS = ["t2m", "t2m_max", "t2m_min", "rh2m", "ws2m", "prectotcorr", "allsky_sfc_sw_dwn"]

_WEATHER_FEATURES: List[str] = (
    RAW_WEATHER_COLS
    + ["temp_range", "heat_index", "vpd",
       "month_sin", "month_cos", "doy_sin", "doy_cos"]
    + [f"t2m_rolling_{w}d" for w in (3, 7, 14, 30)]
    + [f"rh2m_rolling_{w}d" for w in (3, 7, 14, 30)]
    + [f"rain_rolling_{w}d" for w in (3, 7, 14, 30)]
    + ["rain_monthly_cumul"]
    + [f"{v}_lag{l}" for l in (1, 3, 7) for v in ("t2m", "rh2m", "rain")]
    + ["rh_trend_7d", "temp_trend_7d", "consecutive_dry_days", "consecutive_wet_days"]
)
CROP_FEATURES: List[str] = [f"crop_{c.lower()}" for c in CROPS]
MODEL_FEATURES: List[str] = _WEATHER_FEATURES + CROP_FEATURES


class FeatureError(ValueError):
    """Raised when inputs cannot produce a complete, valid feature row."""


def normalize_crop(crop: str) -> str:
    c = (crop or "").strip()
    c = CROP_ALIASES.get(c.lower(), c)
    for known in CROPS:
        if known.lower() == c.lower():
            return known
    raise FeatureError(f"Unsupported crop '{crop}'. Supported: {', '.join(CROPS)}")


# ── Cleaning (shared) ─────────────────────────────────────────

def clean_weather(df: pd.DataFrame) -> pd.DataFrame:
    """
    Rename NASA POWER variables to lower case, sort by date, gap-fill and clip.
    Idempotent: safe to call on data already cleaned by weather_service._clean
    (same fill + clip rules as backend/services/weather_service.py).
    NASA fill value -999 is converted to NaN before gap filling.
    """
    df = df.rename(columns={k: v for k, v in NASA_RENAME.items() if k in df.columns}).copy()
    if "date" not in df.columns:
        raise FeatureError("weather frame has no 'date' column")
    missing = [c for c in RAW_WEATHER_COLS if c not in df.columns]
    if missing:
        raise FeatureError(f"weather frame is missing NASA POWER columns: {missing}")

    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").drop_duplicates("date", keep="last").reset_index(drop=True)

    num = [c for c in NASA_RENAME.values() if c in df.columns]
    df[num] = df[num].apply(pd.to_numeric, errors="coerce")
    df[num] = df[num].mask(df[num] <= -999.0)
    df[num] = df[num].ffill().bfill()
    if df[RAW_WEATHER_COLS].isna().any().any():
        bad = df[RAW_WEATHER_COLS].columns[df[RAW_WEATHER_COLS].isna().any()].tolist()
        raise FeatureError(f"weather columns entirely missing: {bad}")

    df["t2m"] = df["t2m"].clip(10, 50)
    df["rh2m"] = df["rh2m"].clip(5, 100)
    df["prectotcorr"] = df["prectotcorr"].clip(0, 300)
    return df


# ── Feature engineering (shared) ──────────────────────────────

def _run_length(flag: np.ndarray, cap: int = SPELL_CAP) -> np.ndarray:
    out = np.zeros(len(flag), dtype=np.int64)
    c = 0
    for i, v in enumerate(flag):
        c = min(c + 1, cap) if v else 0
        out[i] = c
    return out


def _rolling_slope(s: pd.Series, window: int = 7) -> pd.Series:
    return s.rolling(window, min_periods=3).apply(
        lambda x: np.polyfit(np.arange(len(x)), x, 1)[0], raw=True
    )


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute all weather/calendar features for a single location's daily series.
    Returns a new frame (input columns preserved). The last row = most recent day.
    """
    df = clean_weather(df)

    # Calendar (cyclical)
    df["month"] = df["date"].dt.month
    df["day_of_year"] = df["date"].dt.dayofyear
    df["month_sin"] = np.sin(2 * np.pi * df["month"] / 12)
    df["month_cos"] = np.cos(2 * np.pi * df["month"] / 12)
    df["doy_sin"] = np.sin(2 * np.pi * df["day_of_year"] / 365.25)
    df["doy_cos"] = np.cos(2 * np.pi * df["day_of_year"] / 365.25)

    # Daily derived
    df["temp_range"] = df["t2m_max"] - df["t2m_min"]
    df["heat_index"] = heat_index_c(df["t2m"], df["rh2m"])
    df["vpd"] = _vpd_series(df["t2m"], df["rh2m"])
    df["et0"] = hargreaves_et0(df)  # informational; not a model input

    # Rolling means / sums
    for w in (3, 7, 14, 30):
        df[f"t2m_rolling_{w}d"] = df["t2m"].rolling(w, min_periods=1).mean()
        df[f"rh2m_rolling_{w}d"] = df["rh2m"].rolling(w, min_periods=1).mean()
        df[f"rain_rolling_{w}d"] = df["prectotcorr"].rolling(w, min_periods=1).sum()

    df["rain_monthly_cumul"] = df.groupby(
        [df["date"].dt.year, df["date"].dt.month]
    )["prectotcorr"].cumsum()

    # Lags
    for lag in (1, 3, 7):
        df[f"t2m_lag{lag}"] = df["t2m"].shift(lag)
        df[f"rh2m_lag{lag}"] = df["rh2m"].shift(lag)
        df[f"rain_lag{lag}"] = df["prectotcorr"].shift(lag)

    # 7-day linear trends (units per day)
    df["rh_trend_7d"] = _rolling_slope(df["rh2m"])
    df["temp_trend_7d"] = _rolling_slope(df["t2m"])

    # Spell counters (capped so a ~36-day live window reproduces training values)
    rain = df["prectotcorr"].to_numpy()
    df["consecutive_dry_days"] = _run_length(rain < DRY_DAY_MM)
    df["consecutive_wet_days"] = _run_length(rain >= DRY_DAY_MM)

    # Early rows of a series have no lag/trend history; back-fill so the frame is
    # NaN-free (these rows are < MIN_HISTORY_DAYS and are never used as model rows).
    lag_cols = [c for c in df.columns if "_lag" in c or "_trend_" in c]
    df[lag_cols] = df[lag_cols].bfill().fillna(0.0)
    return df


def add_crop_one_hot(df: pd.DataFrame, crop: str) -> pd.DataFrame:
    crop = normalize_crop(crop)
    for c in CROPS:
        df[f"crop_{c.lower()}"] = np.int64(1 if c == crop else 0)
    return df


def build_feature_frame(weather_df: pd.DataFrame, crop: str) -> pd.DataFrame:
    """The one shared pipeline: clean → engineer → crop one-hot (int)."""
    fe = engineer_features(weather_df)
    return add_crop_one_hot(fe, crop)


def validate_model_frame(X: pd.DataFrame, feature_names: List[str]) -> pd.DataFrame:
    """Return X[feature_names]; raise FeatureError if any column is missing or non-finite."""
    missing = [c for c in feature_names if c not in X.columns]
    if missing:
        raise FeatureError(f"missing model features: {missing}")
    X = X[feature_names].astype(np.float64)
    bad = X.columns[~np.isfinite(X.to_numpy()).all(axis=0)].tolist()
    if bad:
        raise FeatureError(f"non-finite values in model features: {bad}")
    return X


# ── Training matrix ───────────────────────────────────────────

def build_training_matrix(
    raw_df: pd.DataFrame,
    crops: Optional[List[str]] = None,
) -> pd.DataFrame:
    """
    raw_df: NASA POWER daily data for several locations (column 'location').
    One output row = location × crop × day, with MODEL_FEATURES, the rule
    index 'risk_score', 'risk_label' (0/1/2), 'dominant_pest' and metadata.
    The first MIN_HISTORY_DAYS-1 days of each location are dropped.
    """
    from ml.data.pest_labels import crop_risk_index, index_to_label

    crops = [normalize_crop(c) for c in (crops or CROPS)]
    frames = []
    for loc, loc_df in raw_df.groupby("location", sort=True):
        fe = engineer_features(loc_df).iloc[MIN_HISTORY_DAYS - 1:].reset_index(drop=True)
        for crop in crops:
            f = add_crop_one_hot(fe.copy(), crop)
            idx, pest = crop_risk_index(f, crop)
            f["risk_score"] = idx
            f["risk_label"] = index_to_label(idx)
            f["dominant_pest"] = pest
            f["location"] = loc
            f["crop_name"] = crop
            frames.append(f)
    out = pd.concat(frames, ignore_index=True)
    print(f"Training matrix: {len(out):,} rows from {out['location'].nunique()} locations x {len(crops)} crops")
    return out


def get_feature_columns(df: Optional[pd.DataFrame] = None) -> List[str]:
    """Model input columns (fixed, ordered). If df is given, verify presence."""
    if df is not None:
        validate_model_frame(df.head(1), MODEL_FEATURES)
    return list(MODEL_FEATURES)


# ── Live inference feature builder ────────────────────────────

def build_live_feature_row(
    weather_series: pd.DataFrame,
    soil: Dict,
    crop: str,
    climate_zone: str,
) -> pd.DataFrame:
    """
    Single-row frame for the most recent day in `weather_series`
    (needs ≥ MIN_HISTORY_DAYS daily rows). Contains every MODEL_FEATURES
    column plus informational soil / zone columns (not model inputs).
    Raises FeatureError on insufficient history, unknown crop or bad data.
    """
    if weather_series is None or len(weather_series) < MIN_HISTORY_DAYS:
        n = 0 if weather_series is None else len(weather_series)
        raise FeatureError(f"need >= {MIN_HISTORY_DAYS} days of weather history, got {n}")
    fe = build_feature_frame(weather_series, crop)
    row = fe.iloc[[-1]].reset_index(drop=True)

    soil = soil or {}
    row["soil_ph"] = soil.get("ph")
    row["soil_oc"] = soil.get("organic_carbon")
    row["climate_zone"] = climate_zone
    validate_model_frame(row, MODEL_FEATURES)
    return row


# ── Helper functions ──────────────────────────────────────────

def heat_index_c(temp_c: pd.Series, rh: pd.Series) -> pd.Series:
    """
    NWS heat index (°C). Steadman simple formula below 80 °F, otherwise the
    Rothfusz regression with the NWS low/high-humidity adjustments.
    Source: https://www.wpc.ncep.noaa.gov/html/heatindex_equation.shtml
    """
    t = np.asarray(temp_c, dtype=float) * 9 / 5 + 32
    r = np.asarray(rh, dtype=float)
    simple = 0.5 * (t + 61.0 + (t - 68.0) * 1.2 + r * 0.094)
    hi = (-42.379 + 2.04901523 * t + 10.14333127 * r - 0.22475541 * t * r
          - 6.83783e-3 * t ** 2 - 5.481717e-2 * r ** 2 + 1.22874e-3 * t ** 2 * r
          + 8.5282e-4 * t * r ** 2 - 1.99e-6 * t ** 2 * r ** 2)
    low_rh = (r < 13) & (t >= 80) & (t <= 112)
    hi = np.where(low_rh, hi - ((13 - r) / 4) * np.sqrt(np.clip(17 - np.abs(t - 95), 0, None) / 17), hi)
    high_rh = (r > 85) & (t >= 80) & (t <= 87)
    hi = np.where(high_rh, hi + ((r - 85) / 10) * ((87 - t) / 5), hi)
    avg = (simple + t) / 2
    out_f = np.where(avg < 80, simple, hi)
    return pd.Series(np.round((out_f - 32) * 5 / 9, 2), index=getattr(temp_c, "index", None))


def _vpd_series(temp: pd.Series, rh: pd.Series) -> pd.Series:
    """Vapour pressure deficit (kPa), FAO-56 eq. 11 (Tetens) with daily mean T."""
    es = 0.6108 * np.exp(17.27 * temp / (temp + 237.3))
    return (es * (1 - rh / 100)).round(3)


def hargreaves_et0(df: pd.DataFrame) -> pd.Series:
    """
    Hargreaves ET0 (mm/day), FAO-56 eq. 52: 0.0023 (Tmean+17.8) (Tmax-Tmin)^0.5 · 0.408·Ra.
    Ra = extraterrestrial radiation = NASA POWER TOA_SW_DWN (MJ/m²/day) when
    present; otherwise falls back to surface ALLSKY_SFC_SW_DWN (underestimates).
    """
    tmax, tmin = df["t2m_max"], df["t2m_min"]
    ra = df["toa_sw_dwn"] if "toa_sw_dwn" in df.columns else df["allsky_sfc_sw_dwn"]
    et0 = 0.0023 * ((tmax + tmin) / 2 + 17.8) * np.sqrt((tmax - tmin).clip(lower=0)) * 0.408 * ra
    return et0.clip(lower=0).round(3)
