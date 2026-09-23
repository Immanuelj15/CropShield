"""
clean_crop_yield_data.py
---------------------------
Cleans the REAL India district-wise crop production dataset (originally from
data.gov.in) into the same column schema as the synthetic
agriguard_soil_yield_dataset_10000rows.csv you already have, so it's a
drop-in replacement.

GET THE REAL DATA FIRST (pick one, both are real, sourced from data.gov.in):
  - Kaggle: https://www.kaggle.com/datasets/pyatakov/india-agriculture-crop-production
    (district-wise, 1997-2021, updated 2023)
  - Kaggle: https://www.kaggle.com/datasets/akshatgupta7/crop-yield-in-indian-states-dataset
    (state-wise, 1997-2020, includes rainfall/fertilizer/pesticide columns -
    useful if you want to cross-check against your own NASA POWER rainfall)
  - Original source: https://www.data.gov.in/catalog/district-wise-season-wise-crop-production-statistics
    (requires navigating their portal UI to export; Kaggle mirrors are easier)

Download requires a free Kaggle account (same as PlantVillage):
    pip install kagglehub
    python -c "import kagglehub; print(kagglehub.dataset_download('pyatakov/india-agriculture-crop-production'))"

Usage:
    python data_collection/clean_crop_yield_data.py --input path/to/downloaded.csv --state "Tamil Nadu"
"""

import argparse
from pathlib import Path
import pandas as pd


def clean(input_path: str, state_filter: str = None) -> pd.DataFrame:
    df = pd.read_csv(input_path)

    # Column names vary slightly by source - normalize common variants
    rename_map = {
        "State_Name": "state", "State": "state",
        "District_Name": "district", "District": "district",
        "Crop_Year": "year", "Year": "year",
        "Season": "season",
        "Crop": "crop_type",
        "Area": "area_hectares",
        "Production": "production_kg",
        "Annual_Rainfall": "annual_rainfall_mm",
        "Fertilizer": "fertilizer_kg",
        "Pesticide": "pesticide_kg",
        "Yield": "yield_kg_per_hectare",
    }
    df = df.rename(columns={k: v for k, v in rename_map.items() if k in df.columns})

    # Strip whitespace, standardize text case
    for col in ["state", "district", "season", "crop_type"]:
        if col in df.columns:
            df[col] = df[col].astype(str).str.strip()

    if state_filter and "state" in df.columns:
        df = df[df["state"].str.contains(state_filter, case=False, na=False)]

    # Compute yield if not already present
    if "yield_kg_per_hectare" not in df.columns and {"area_hectares", "production_kg"}.issubset(df.columns):
        df["yield_kg_per_hectare"] = df["production_kg"] / df["area_hectares"].replace(0, pd.NA)

    # Drop rows with missing core fields
    core_cols = [c for c in ["crop_type", "year", "area_hectares", "production_kg"] if c in df.columns]
    df = df.dropna(subset=core_cols)

    # Remove obviously bad rows (zero/negative area or production)
    if "area_hectares" in df.columns:
        df = df[df["area_hectares"] > 0]
    if "production_kg" in df.columns:
        df = df[df["production_kg"] >= 0]

    return df.reset_index(drop=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="path to downloaded raw CSV")
    parser.add_argument("--state", default="Tamil Nadu", help="filter to one state, or omit for all-India")
    parser.add_argument("--output", default="data/real_crop_yield_cleaned.csv")
    args = parser.parse_args()

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    cleaned = clean(args.input, args.state)
    cleaned.to_csv(out_path, index=False)
    print(f"Cleaned dataset: {len(cleaned):,} rows -> {out_path}")
    print(cleaned.head())
    if "crop_type" in cleaned.columns:
        print("\nCrops covered:", cleaned["crop_type"].nunique())
    if "district" in cleaned.columns:
        print("Districts covered:", cleaned["district"].nunique())


if __name__ == "__main__":
    main()
