"""
CropShield — NASA POWER Historical Data Collector
==================================================

Downloads REAL daily point data from the NASA POWER Daily API for the
10 Tamil Nadu training locations and stores the untouched values as
``ml/data/nasa_power_raw/<location>.csv`` (one file per location).

Official documentation
  * Daily API:   https://power.larc.nasa.gov/docs/services/api/temporal/daily/
  * Parameters:  https://power.larc.nasa.gov/parameters/  (units are also
                 returned in every response under ``parameters``)

Facts verified against the API response header (API v2.10.0):
  * community=AG  → ALLSKY_SFC_SW_DWN / TOA_SW_DWN in **MJ/m^2/day**
    (community=RE/SB return kW-hr/m^2/day — do NOT mix communities).
    The live service (backend/services/weather_service.py) also uses AG,
    so training and inference units are identical.
  * T2M/T2M_MAX/T2M_MIN °C, RH2M %, WS2M m/s, PRECTOTCORR mm/day.
  * ``header.fill_value`` = -999.0 → stored here as empty (NaN).
  * ``header.time_standard`` = LST (local solar time days).

Raw files are NOT gap-filled or clipped; cleaning happens in
``ml.data.feature_engineering.clean_weather`` which is the same function
used for live inference.

Usage (from repo root):
    python -m ml.data.collect_nasa_historical --start 2005 --end 2024
    python -m ml.data.collect_nasa_historical --only Thanjavur --force
"""

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

import httpx
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

NASA_BASE = "https://power.larc.nasa.gov/api/temporal/daily/point"
COMMUNITY = "AG"
NASA_FILL_VALUE = -999.0

# TOA_SW_DWN (top-of-atmosphere irradiance) is the extraterrestrial
# radiation Ra required by the Hargreaves ET0 equation (FAO-56 eq. 52).
NASA_PARAMS = [
    "T2M", "T2M_MAX", "T2M_MIN", "RH2M", "WS2M",
    "PRECTOTCORR", "ALLSKY_SFC_SW_DWN", "TOA_SW_DWN",
]
PARAMS_STR = ",".join(NASA_PARAMS)

RAW_DIR = ROOT / "ml" / "data" / "nasa_power_raw"

# ── Training locations (district headquarters, WGS84) ────────
# Coordinates are the district-HQ town centres (verified against
# OpenStreetMap / Survey of India gazetteer values, rounded to 4 dp).
# "zone" is the CropShield climate-zone label used by the app UI.
TRAINING_LOCATIONS: List[Dict] = [
    {"name": "Kovilpatti",   "lat": 9.1728,  "lon": 77.8710, "zone": "Dryland"},
    {"name": "Tirunelveli",  "lat": 8.7139,  "lon": 77.7567, "zone": "Dryland"},
    {"name": "Thanjavur",    "lat": 10.7870, "lon": 79.1378, "zone": "Delta"},
    {"name": "Nagapattinam", "lat": 10.7672, "lon": 79.8449, "zone": "Delta"},
    {"name": "Trichy",       "lat": 10.7905, "lon": 78.7047, "zone": "Irrigated"},
    {"name": "Madurai",      "lat": 9.9252,  "lon": 78.1198, "zone": "Irrigated"},
    {"name": "Vellore",      "lat": 12.9165, "lon": 79.1325, "zone": "Semi-arid"},
    {"name": "Krishnagiri",  "lat": 12.5266, "lon": 78.2138, "zone": "Semi-arid"},
    {"name": "Coimbatore",   "lat": 11.0168, "lon": 76.9558, "zone": "Humid"},
    {"name": "Nilgiris",     "lat": 11.4102, "lon": 76.6950, "zone": "Humid"},  # Udhagamandalam (Ooty)
]


def _slug(name: str) -> str:
    return name.lower().replace(" ", "_")


def fetch_year(
    client: httpx.Client,
    lat: float,
    lon: float,
    year: int,
    retries: int = 4,
) -> Optional[Dict]:
    """Fetch one calendar year of daily data. Returns the parsed JSON or None."""
    params = {
        "parameters": PARAMS_STR,
        "community": COMMUNITY,
        "longitude": lon,
        "latitude": lat,
        "start": f"{year}0101",
        "end": f"{year}1231",
        "format": "JSON",
    }
    for attempt in range(retries):
        try:
            resp = client.get(NASA_BASE, params=params, timeout=90)
            resp.raise_for_status()
            data = resp.json()
            if not data.get("properties", {}).get("parameter"):
                raise ValueError("empty 'properties.parameter' in response")
            return data
        except (httpx.HTTPError, ValueError) as e:
            wait = 5 * (attempt + 1)
            print(f"    retry {attempt + 1}/{retries} for {year} in {wait}s ({e})", flush=True)
            time.sleep(wait)
    print(f"    FAILED year {year}", flush=True)
    return None


def _json_to_frame(data: Dict) -> pd.DataFrame:
    fill = data.get("header", {}).get("fill_value", NASA_FILL_VALUE)
    props = data["properties"]["parameter"]
    records: Dict[str, Dict] = {}
    for var, daily in props.items():
        for date_str, val in daily.items():
            rec = records.setdefault(date_str, {"date": datetime.strptime(date_str, "%Y%m%d").date()})
            rec[var] = np.nan if (val is None or float(val) == float(fill)) else float(val)
    return pd.DataFrame(list(records.values())).sort_values("date").reset_index(drop=True)


def collect_location(
    location: Dict,
    start_year: int,
    end_year: int,
    out_dir: Path = RAW_DIR,
    force: bool = False,
    pause_s: float = 1.0,
) -> Optional[Path]:
    """Download [start_year, end_year] for one location into <out_dir>/<slug>.csv."""
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / f"{_slug(location['name'])}.csv"
    if out_file.exists() and not force:
        print(f"  {location['name']}: exists, skipping (use --force)")
        return out_file

    print(f"  {location['name']} ({location['lat']}, {location['lon']}) {start_year}-{end_year}", flush=True)
    frames, meta = [], {}
    with httpx.Client(headers={"User-Agent": "CropShield-research/1.0"}) as client:
        for year in range(start_year, end_year + 1):
            data = fetch_year(client, location["lat"], location["lon"], year)
            if data is not None:
                frames.append(_json_to_frame(data))
                if not meta:
                    meta = {
                        "api": data.get("header", {}).get("api"),
                        "sources": data.get("header", {}).get("sources"),
                        "fill_value": data.get("header", {}).get("fill_value"),
                        "time_standard": data.get("header", {}).get("time_standard"),
                        "units": {k: v.get("units") for k, v in data.get("parameters", {}).items()},
                        "grid_point": data.get("geometry", {}).get("coordinates"),
                    }
            time.sleep(pause_s)  # polite rate

    if not frames:
        print(f"  {location['name']}: no data collected")
        return None

    df = pd.concat(frames, ignore_index=True)
    df.insert(1, "location", location["name"])
    df.insert(2, "latitude", location["lat"])
    df.insert(3, "longitude", location["lon"])
    df.insert(4, "zone", location["zone"])
    df.to_csv(out_file, index=False)

    meta.update({
        "location": location, "community": COMMUNITY, "parameters": NASA_PARAMS,
        "start_year": start_year, "end_year": end_year, "rows": int(len(df)),
        "missing_values": {c: int(df[c].isna().sum()) for c in NASA_PARAMS if c in df.columns},
        "downloaded_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "endpoint": NASA_BASE,
    })
    with open(out_dir / f"{_slug(location['name'])}.meta.json", "w") as f:
        json.dump(meta, f, indent=2)
    print(f"  {location['name']}: {len(df)} days -> {out_file.name}", flush=True)
    return out_file


def load_raw_data(raw_dir: Path = RAW_DIR) -> pd.DataFrame:
    """Load all raw per-location CSVs (uncleaned, NASA variable names)."""
    files = sorted(raw_dir.glob("*.csv"))
    if not files:
        raise FileNotFoundError(
            f"No NASA POWER raw data in {raw_dir}. Run: python -m ml.data.collect_nasa_historical"
        )
    df = pd.concat([pd.read_csv(f, parse_dates=["date"]) for f in files], ignore_index=True)
    return df.sort_values(["location", "date"]).reset_index(drop=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Collect NASA POWER daily data (community=AG)")
    parser.add_argument("--start", type=int, default=2005)
    parser.add_argument("--end", type=int, default=2024)
    parser.add_argument("--force", action="store_true", help="Re-download even if the CSV exists")
    parser.add_argument("--only", type=str, default=None, help="Collect a single named location")
    args = parser.parse_args()

    locs = [l for l in TRAINING_LOCATIONS if args.only is None or l["name"].lower() == args.only.lower()]
    print(f"NASA POWER {NASA_BASE} community={COMMUNITY} {args.start}-{args.end}, {len(locs)} locations")
    for loc in locs:
        collect_location(loc, args.start, args.end, force=args.force)
