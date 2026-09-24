"""
CropShield / AgriGuard — Irrigation Pipeline Validation Script
Sanity-checks the actual compute_et0() and compute_effective_rainfall()
implementations in backend.services.irrigation_service against the precomputed
reference values in irrigation_fertilizer_demo_log_10000rows.csv.

This is a one-time validation step to verify implementation fidelity before going live.
"""
import sys
from pathlib import Path
import pandas as pd

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.services.irrigation_service import compute_et0, compute_effective_rainfall

DEMO_CSV_PATH = "irrigation_fertilizer_demo_log_10000rows.csv"


def validate_pipeline(csv_path: str = DEMO_CSV_PATH, sample_size: int = 500):
    print(f"Loading reference dataset: {csv_path} ...")
    df = pd.read_csv(csv_path)
    total_available = len(df)
    sample_df = df.head(sample_size)
    print(f"Total rows in dataset: {total_available}. Spot-checking first {len(sample_df)} rows...")

    et0_mismatches = []
    rain_mismatches = []
    total_et0_error = 0.0
    total_rain_error = 0.0

    TOLERANCE = 0.06  # 0.06 mm/day tolerance for float rounding variations

    for idx, row in sample_df.iterrows():
        t_max = float(row["t_max_c"])
        t_min = float(row["t_min_c"])
        sol_rad = float(row["solar_rad_mjm2"])
        expected_et0 = float(row["et0_mm_day"])

        computed_et0 = compute_et0(t_max, t_min, sol_rad)
        et0_diff = abs(computed_et0 - expected_et0)
        total_et0_error += et0_diff

        if et0_diff > TOLERANCE:
            et0_mismatches.append({
                "row": idx,
                "t_max": t_max,
                "t_min": t_min,
                "solar_rad": sol_rad,
                "computed_et0": computed_et0,
                "expected_et0": expected_et0,
                "diff": round(et0_diff, 4)
            })

        # Validate effective rainfall calculation
        raw_rain = float(row["rain_7d_mm"])
        expected_rain = float(row["effective_rain_mm"])
        computed_rain = compute_effective_rainfall(raw_rain)
        rain_diff = abs(computed_rain - expected_rain)
        total_rain_error += rain_diff

        if rain_diff > 0.15:
            rain_mismatches.append({
                "row": idx,
                "raw_rain": raw_rain,
                "computed_rain": computed_rain,
                "expected_rain": expected_rain,
                "diff": round(rain_diff, 4)
            })

    mae_et0 = total_et0_error / len(sample_df)
    mae_rain = total_rain_error / len(sample_df)

    print("\n" + "=" * 65)
    print("[REPORT] AGRI GUARD IRRIGATION PIPELINE SANITY-CHECK REPORT")
    print("=" * 65)
    print(f"Sample Rows Evaluated: {len(sample_df)}")
    print(f"ET0 Mean Absolute Error: {mae_et0:.4f} mm/day")
    print(f"Effective Rain MAE:       {mae_rain:.4f} mm")
    print(f"ET0 Mismatches (> {TOLERANCE} mm): {len(et0_mismatches)} / {len(sample_df)}")
    print(f"Rain Mismatches (> 0.15 mm): {len(rain_mismatches)} / {len(sample_df)}")

    if et0_mismatches:
        print("\nFlagged ET0 Divergences:")
        for m in et0_mismatches[:5]:
            print(f"  - Row {m['row']}: Computed={m['computed_et0']}, Expected={m['expected_et0']}, Diff={m['diff']}")
    else:
        print("\n[OK] ET0 Calculation Verification: PASSED (0 significant divergences).")

    if not rain_mismatches:
        print("[OK] USDA SCS Effective Rainfall Verification: PASSED.")
    print("=" * 65 + "\n")

    return len(et0_mismatches) == 0


if __name__ == "__main__":
    csv_file = sys.argv[1] if len(sys.argv) > 1 else DEMO_CSV_PATH
    success = validate_pipeline(csv_file, sample_size=500)
    sys.exit(0 if success else 1)
