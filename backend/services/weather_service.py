"""
CropShield — NASA POWER Weather Service (v2)
For LIVE inference: fetches the latest 35 days of daily data
so rolling/lag features can be computed with full fidelity.

For HISTORICAL training: see ml/data/collect_nasa_historical.py
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, Optional
import httpx
import numpy as np
import pandas as pd

from backend.utils.config import settings
from backend.utils.serialization import sanitize_for_json

NASA_PARAMS = [
    "T2M", "T2M_MAX", "T2M_MIN", "RH2M",
    "WS2M", "PRECTOTCORR", "ALLSKY_SFC_SW_DWN",
]
PARAMS_STR = ",".join(NASA_PARAMS)

logger = logging.getLogger("cropshield.weather")

# Values of df.attrs["source"] / get_today_weather_dict()["weather_source"]
SOURCE_NASA = "NASA_POWER"
SOURCE_SYNTHETIC = "synthetic"


def get_weather_source(df: Optional[pd.DataFrame]) -> str:
    """Returns "NASA_POWER" or "synthetic" for a DataFrame produced by fetch_latest_weather()."""
    if df is None:
        return SOURCE_SYNTHETIC
    return str(getattr(df, "attrs", {}).get("source", SOURCE_NASA))


def is_synthetic_weather(df: Optional[pd.DataFrame]) -> bool:
    return get_weather_source(df) == SOURCE_SYNTHETIC


class SyntheticWeatherError(RuntimeError):
    """Raised by callers that must not proceed on synthetic fallback weather (e.g. daily ingestion)."""


def _compute_et0(row) -> float:
    tmax = row.get("t2m_max", 35) if isinstance(row, dict) else getattr(row, "t2m_max", 35)
    tmin = row.get("t2m_min", 22) if isinstance(row, dict) else getattr(row, "t2m_min", 22)
    rad  = row.get("allsky_sfc_sw_dwn", 15) if isinstance(row, dict) else getattr(row, "allsky_sfc_sw_dwn", 15)
    tmean = (tmax + tmin) / 2
    et0 = 0.0023 * (tmean + 17.8) * max(0, tmax - tmin) ** 0.5 * rad * 0.408
    return round(max(0.0, float(et0)), 3)


async def fetch_latest_weather(
    latitude: float,
    longitude: float,
    days_back: int = 35,
) -> pd.DataFrame:
    """
    Fetch the most recent `days_back` days from NASA POWER.
    Returns a date-sorted DataFrame ready for feature engineering.

    On any NASA POWER failure a deterministic synthetic climatology is returned instead;
    the origin is always recorded in df.attrs["source"] ("NASA_POWER" | "synthetic") and
    df.attrs["fallback_reason"] — use get_weather_source()/is_synthetic_weather().

    We fetch 35 days so that 30-day rolling features are valid on the
    final (today's) row.
    """
    end_dt   = datetime.utcnow() - timedelta(days=1)  # NASA lags ~1 day
    start_dt = end_dt - timedelta(days=days_back)

    url = (
        f"{settings.NASA_POWER_BASE_URL}"
        f"?parameters={PARAMS_STR}"
        f"&community=AG"
        f"&longitude={longitude}"
        f"&latitude={latitude}"
        f"&start={start_dt.strftime('%Y%m%d')}"
        f"&end={end_dt.strftime('%Y%m%d')}"
        f"&format=JSON"
    )

    source = SOURCE_NASA
    fallback_reason = None
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()

        props = data.get("properties", {}).get("parameter", {})
        if not props:
            raise ValueError("Empty NASA POWER response")

        records: Dict[str, dict] = {}
        for var_name, daily in props.items():
            for date_str, val in daily.items():
                dt = datetime.strptime(date_str, "%Y%m%d")
                if date_str not in records:
                    records[date_str] = {"date": dt}
                records[date_str][var_name] = val if val != -999.0 else np.nan

        df = pd.DataFrame(list(records.values()))
        df.sort_values("date", inplace=True)
        df.reset_index(drop=True, inplace=True)

    except Exception as e:
        # Graceful fallback with realistic Tamil Nadu climate — explicitly tagged as synthetic
        logger.warning("NASA POWER fetch failed for (%s, %s): %s. Using synthetic climatology.", latitude, longitude, e)
        df = _fallback_weather(latitude, longitude, start_dt, end_dt)
        source = SOURCE_SYNTHETIC
        fallback_reason = str(e)[:300]

    df = _clean(df)
    df.attrs["source"] = source
    df.attrs["fallback_reason"] = fallback_reason
    return df


def _clean(df: pd.DataFrame) -> pd.DataFrame:
    rename = {
        "T2M": "t2m", "T2M_MAX": "t2m_max", "T2M_MIN": "t2m_min",
        "RH2M": "rh2m", "WS2M": "ws2m", "PRECTOTCORR": "prectotcorr",
        "ALLSKY_SFC_SW_DWN": "allsky_sfc_sw_dwn",
    }
    df = df.rename(columns={k: v for k, v in rename.items() if k in df.columns})
    numeric = [c for c in df.columns if c != "date"]
    df[numeric] = df[numeric].ffill().bfill()
    if "t2m" in df.columns:     df["t2m"]         = df["t2m"].clip(10, 50)
    if "rh2m" in df.columns:    df["rh2m"]        = df["rh2m"].clip(5, 100)
    if "prectotcorr" in df.columns: df["prectotcorr"] = df["prectotcorr"].clip(0, 300)
    df["et0"] = df.apply(lambda r: _compute_et0(r), axis=1)
    return df


def get_today_weather_dict(df: pd.DataFrame) -> Dict:
    """Return the most recent row as a flat dict for API responses (includes "weather_source")."""
    row = df.sort_values("date").iloc[-1]
    out = sanitize_for_json(row.to_dict())
    out["weather_source"] = get_weather_source(df)
    return out


def _fallback_weather(lat, lon, start_dt, end_dt) -> pd.DataFrame:
    """
    Tamil Nadu climatological normals when NASA POWER is unreachable.
    Uses a local Generator seeded per (location, day) so the global numpy RNG is never touched,
    different locations get different values, and the same (location, day) is reproducible.
    """
    lat_key = int(round(float(lat) * 1e4)) & 0xFFFFFFFF
    lon_key = int(round(float(lon) * 1e4)) & 0xFFFFFFFF
    seasonal = {
        1:(26,60,1), 2:(27,58,1), 3:(30,52,2), 4:(33,48,3),
        5:(35,46,4), 6:(32,72,7), 7:(30,78,9), 8:(30,80,9),
        9:(29,78,8), 10:(28,82,11), 11:(27,80,10), 12:(26,70,4),
    }
    days = (end_dt - start_dt).days + 1
    rows = []
    for i in range(days):
        d = start_dt + timedelta(days=i)
        tb, rb, pb = seasonal[d.month]
        rng = np.random.default_rng([lat_key, lon_key, d.toordinal()])
        t   = float(np.clip(rng.normal(tb, 2.5), 18, 45))
        rh  = float(np.clip(rng.normal(rb, 8), 20, 100))
        r   = float(np.clip(rng.exponential(pb), 0, 80))
        tmax= t + float(rng.uniform(3, 6))
        tmin= t - float(rng.uniform(3, 6))
        rad = float(np.clip(rng.normal(16, 2.5), 8, 24))
        ws  = float(np.clip(rng.exponential(2), 0.5, 7))
        rows.append({
            "date": d, "t2m": round(t,2), "t2m_max": round(tmax,2),
            "t2m_min": round(tmin,2), "rh2m": round(rh,2),
            "ws2m": round(ws,2), "prectotcorr": round(r,2),
            "allsky_sfc_sw_dwn": round(rad,2),
        })
    return pd.DataFrame(rows)
