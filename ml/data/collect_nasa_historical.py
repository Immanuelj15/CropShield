"""
CropShield — NASA POWER Historical Data Collector
Fetches daily weather data from 1980-01-01 to 2025-12-31
for Tamil Nadu locations used in model training.

Usage:
    python -m ml.data.collect_nasa_historical
        --lat 9.1728 --lon 77.8710
        --start 1980-01-01 --end 2025-12-31

NASA POWER API limit: 366 days per call → we chunk by year.
"""

import asyncio
import argparse
import os
import sys
import time
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import List, Dict, Optional, Tuple
import httpx
import pandas as pd
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

# ── NASA POWER variables needed ──────────────────────────────
NASA_PARAMS = [
    "T2M",
    "T2M_MAX",
    "T2M_MIN",
    "RH2M",
    "WS2M",
    "PRECTOTCORR",
    "ALLSKY_SFC_SW_DWN",
]
PARAMS_STR = ",".join(NASA_PARAMS)
NASA_BASE = "https://power.larc.nasa.gov/api/temporal/daily/point"

# ── Training locations across Tamil Nadu zones ────────────────
# These cover all 5 climate zones for a representative dataset.
TRAINING_LOCATIONS: List[Dict] = [
    {"name": "Kovilpatti",  "lat": 9.1728,  "lon": 77.8710, "zone": "Dryland"},
    {"name": "Tirunelveli", "lat": 8.7139,  "lon": 77.7567, "zone": "Dryland"},
    {"name": "Thanjavur",   "lat": 10.7870, "lon": 79.1378, "zone": "Delta"},
    {"name": "Nagapattinam","lat": 10.7672, "lon": 79.8449, "zone": "Delta"},
    {"name": "Trichy",      "lat": 10.7905, "lon": 78.7047, "zone": "Irrigated"},
    {"name": "Madurai",     "lat": 9.9252,  "lon": 78.1198, "zone": "Irrigated"},
    {"name": "Vellore",     "lat": 12.9165, "lon": 79.1325, "zone": "Semi-arid"},
    {"name": "Krishnagiri", "lat": 12.5266, "lon": 78.2138, "zone": "Semi-arid"},
    {"name": "Coimbatore",  "lat": 11.0168, "lon": 76.9558, "zone": "Humid"},
    {"name": "Nilgiris",    "lat": 11.4916, "lon": 76.7337, "zone": "Humid"},
]


def _compute_et0(row: pd.Series) -> float:
    """Hargreaves ET₀ (mm/day)."""
    t_max = row.get("t2m_max", 35)
    t_min = row.get("t2m_min", 22)
    t_mean = (t_max + t_min) / 2
    ra = row.get("allsky_sfc_sw_dwn", 15)
    et0 = 0.0023 * (t_mean + 17.8) * max(0, t_max - t_min) ** 0.5 * ra * 0.408
    return round(max(0.0, float(et0)), 3)


async def fetch_year(
    client: httpx.AsyncClient,
    lat: float,
    lon: float,
    year: int,
    retries: int = 3,
) -> Optional[pd.DataFrame]:
    """
    Fetch one year of daily data from NASA POWER.
    Returns a DataFrame or None on failure.
    """
    start_str = f"{year}0101"
    end_str = f"{year}1231"
    url = (
        f"{NASA_BASE}"
        f"?parameters={PARAMS_STR}"
        f"&community=AG"
        f"&longitude={lon}"
        f"&latitude={lat}"
        f"&start={start_str}"
        f"&end={end_str}"
        f"&format=JSON"
    )

    for attempt in range(retries):
        try:
            resp = await client.get(url, timeout=60)
            resp.raise_for_status()
            data = resp.json()

            props = data.get("properties", {}).get("parameter", {})
            if not props:
                return None

            records = {}
            for var_name, daily_values in props.items():
                for date_str, val in daily_values.items():
                    dt = datetime.strptime(date_str, "%Y%m%d").date()
                    if dt not in records:
                        records[dt] = {"date": dt}
                    records[dt][var_name] = val if val != -999.0 else np.nan

            if not records:
                return None

            df = pd.DataFrame(list(records.values()))
            df.sort_values("date", inplace=True)
            df.reset_index(drop=True, inplace=True)
            return df

        except (httpx.HTTPStatusError, httpx.RequestError) as e:
            if attempt < retries - 1:
                wait = 2 ** (attempt + 1)
                print(f"    Retry {attempt+1}/{retries} for {year} after {wait}s ({e})")
                await asyncio.sleep(wait)
            else:
                print(f"    ❌ Failed year {year}: {e}")
                return None


def clean_and_rename(df: pd.DataFrame) -> pd.DataFrame:
    """Rename NASA vars to lowercase, fill gaps, compute ET₀."""
    rename = {
        "T2M": "t2m",
        "T2M_MAX": "t2m_max",
        "T2M_MIN": "t2m_min",
        "RH2M": "rh2m",
        "WS2M": "ws2m",
        "PRECTOTCORR": "prectotcorr",
        "ALLSKY_SFC_SW_DWN": "allsky_sfc_sw_dwn",
    }
    df = df.rename(columns={k: v for k, v in rename.items() if k in df.columns})

    # Forward-fill then backward-fill missing values (gaps in NASA data)
    numeric_cols = [c for c in df.columns if c != "date"]
    df[numeric_cols] = df[numeric_cols].fillna(method="ffill").fillna(method="bfill")

    # Clamp to physically reasonable bounds
    if "t2m" in df.columns:
        df["t2m"] = df["t2m"].clip(10, 50)
    if "rh2m" in df.columns:
        df["rh2m"] = df["rh2m"].clip(5, 100)
    if "prectotcorr" in df.columns:
        df["prectotcorr"] = df["prectotcorr"].clip(0, 300)

    # Compute ET₀
    df["et0"] = df.apply(_compute_et0, axis=1)
    return df


async def collect_location(
    location: Dict,
    start_year: int,
    end_year: int,
    out_dir: Path,
    force: bool = False,
) -> Optional[Path]:
    """
    Download full historical data for one location.
    Saves to Parquet for efficient storage and fast loading.
    """
    name = location["name"]
    lat = location["lat"]
    lon = location["lon"]
    zone = location["zone"]
    out_file = out_dir / f"{name.lower().replace(' ', '_')}.parquet"

    if out_file.exists() and not force:
        print(f"  ✓ {name}: already exists, skipping (use --force to re-download)")
        return out_file

    print(f"\n  Downloading {name} ({lat}, {lon}) — {start_year} to {end_year}")
    all_frames = []
    years = list(range(start_year, end_year + 1))

    async with httpx.AsyncClient() as client:
        for i, year in enumerate(years):
            df_year = await fetch_year(client, lat, lon, year)
            if df_year is not None:
                df_year["location"] = name
                df_year["latitude"] = lat
                df_year["longitude"] = lon
                df_year["zone"] = zone
                all_frames.append(df_year)
                print(f"    ✓ {year} ({len(df_year)} days)", end="\r")
            # Gentle rate limiting — NASA POWER allows ~30 req/min
            if (i + 1) % 10 == 0:
                await asyncio.sleep(1)

    if not all_frames:
        print(f"  ❌ No data collected for {name}")
        return None

    df_all = pd.concat(all_frames, ignore_index=True)
    df_all = clean_and_rename(df_all)
    df_all.sort_values("date", inplace=True)
    df_all.reset_index(drop=True, inplace=True)

    df_all.to_parquet(out_file, index=False)
    print(f"  ✅ {name}: {len(df_all)} days saved → {out_file.name}")
    return out_file


async def collect_all(
    start_year: int = 1980,
    end_year: int = 2025,
    out_dir: Optional[Path] = None,
    locations: Optional[List[Dict]] = None,
    force: bool = False,
) -> Path:
    """
    Download historical NASA POWER data for all training locations.
    Returns path to the combined Parquet file.
    """
    if out_dir is None:
        out_dir = ROOT / "ml" / "data" / "nasa_historical"
    out_dir.mkdir(parents=True, exist_ok=True)

    if locations is None:
        locations = TRAINING_LOCATIONS

    print(f"\n{'='*60}")
    print(f"  NASA POWER Historical Collector")
    print(f"  Period : {start_year}-01-01 → {end_year}-12-31")
    print(f"  Sites  : {len(locations)} Tamil Nadu locations")
    print(f"  Output : {out_dir}")
    print(f"{'='*60}")

    tasks = [
        collect_location(loc, start_year, end_year, out_dir, force=force)
        for loc in locations
    ]
    # Run sequentially to respect API rate limits
    results = []
    for task in tasks:
        result = await task
        results.append(result)
        await asyncio.sleep(0.5)

    # Combine all into one master parquet
    master_file = out_dir / "all_locations.parquet"
    individual = [r for r in results if r is not None and r.name != "all_locations.parquet"]
    if individual:
        frames = [pd.read_parquet(f) for f in individual]
        combined = pd.concat(frames, ignore_index=True)
        combined.sort_values(["location", "date"], inplace=True)
        combined.reset_index(drop=True, inplace=True)
        combined.to_parquet(master_file, index=False)
        print(f"\n✅ Combined dataset: {len(combined):,} records → {master_file}")
    return master_file


def load_historical_data(out_dir: Optional[Path] = None) -> pd.DataFrame:
    """Load the combined historical dataset from disk."""
    if out_dir is None:
        out_dir = ROOT / "ml" / "data" / "nasa_historical"
    master = out_dir / "all_locations.parquet"
    if not master.exists():
        raise FileNotFoundError(
            f"Historical data not found at {master}.\n"
            "Run: python -m ml.data.collect_nasa_historical"
        )
    return pd.read_parquet(master)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Collect NASA POWER historical data")
    parser.add_argument("--start", type=int, default=1980)
    parser.add_argument("--end",   type=int, default=2025)
    parser.add_argument("--force", action="store_true", help="Re-download even if cached")
    parser.add_argument("--single-lat",  type=float, help="Single location latitude")
    parser.add_argument("--single-lon",  type=float, help="Single location longitude")
    parser.add_argument("--single-name", type=str,   default="custom")
    parser.add_argument("--single-zone", type=str,   default="Dryland")
    args = parser.parse_args()

    if args.single_lat and args.single_lon:
        locs = [{"name": args.single_name, "lat": args.single_lat,
                 "lon": args.single_lon, "zone": args.single_zone}]
    else:
        locs = TRAINING_LOCATIONS

    asyncio.run(collect_all(
        start_year=args.start,
        end_year=args.end,
        locations=locs,
        force=args.force,
    ))
