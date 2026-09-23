"""
fetch_soilgrids.py
---------------------
Pulls REAL soil property data from ISRIC SoilGrids v2.0 REST API for your
farm locations. Free, no API key. Run on your own machine.

If you get errors, check https://rest.isric.org/soilgrids/v2.0/docs for the
current parameter format - ISRIC occasionally updates the API version path.

Usage:
    pip install requests pandas
    python data_collection/fetch_soilgrids.py
"""

import requests
import pandas as pd
import time
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT_DIR / "data" / "soilgrids"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Same locations as fetch_nasa_power.py - keep them in sync
LOCATIONS = {
    "kovilpatti":   (9.1768, 77.9803),
    "madurai":      (9.9252, 78.1198),
    "tirunelveli":  (8.7139, 77.7567),
    "thanjavur":    (10.7870, 79.1378),
    "coimbatore":   (11.0168, 76.9558),
    "trichy":       (10.7905, 78.7047),
    "krishnagiri":  (12.5186, 78.2137),
    "vellore":      (12.9165, 79.1325),
    "nagapattinam": (10.7661, 79.8420),
    "nilgiris":     (11.4916, 76.7337),
}

PROPERTIES = ["phh2o", "clay", "sand", "silt", "soc", "nitrogen", "cec", "bdod"]
DEPTH = "0-5cm"  # topsoil, most relevant for crop root zone surface conditions
BASE_URL = "https://rest.isric.org/soilgrids/v2.0/properties/query"


def fetch_location(name, lat, lon):
    params = [("lon", lon), ("lat", lat), ("depth", DEPTH), ("value", "mean")]
    for prop in PROPERTIES:
        params.append(("property", prop))

    resp = requests.get(BASE_URL, params=params, timeout=60,
                         headers={"User-Agent": "AgriGuard-research/1.0"})
    resp.raise_for_status()
    data = resp.json()

    row = {"location": name, "latitude": lat, "longitude": lon}
    for layer in data.get("properties", {}).get("layers", []):
        prop_name = layer["name"]
        unit = layer.get("unit_measure", {}).get("target_units", "")
        for depth_entry in layer.get("depths", []):
            if depth_entry["label"] == DEPTH:
                mean_val = depth_entry["values"].get("mean")
                row[f"{prop_name}_{DEPTH}"] = mean_val
                row[f"{prop_name}_unit"] = unit
    return row


def main():
    rows = []
    for name, (lat, lon) in LOCATIONS.items():
        print(f"Fetching soil data for {name} ({lat}, {lon}) ...")
        try:
            row = fetch_location(name, lat, lon)
            rows.append(row)
            print(f"  -> OK")
        except Exception as e:
            print(f"  !! failed: {e}")
        time.sleep(1)  # be polite to the free API

    df = pd.DataFrame(rows)
    out_file = OUT_DIR / "soil_properties_by_location.csv"
    df.to_csv(out_file, index=False)
    print(f"\nSaved {len(df)} rows -> {out_file}")
    print(df)


if __name__ == "__main__":
    main()
