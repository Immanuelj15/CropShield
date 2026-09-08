"""
AgriGuard / CropShield — Wadhwani AI Bollworm Dataset Ingestion & Processing
Source: https://github.com/WadhwaniAI/pest-management-opendata
Paper Citation: arXiv:2304.00763 (Pest Management Open Data)
License: CC-BY 4.0 (Data) / Apache-2.0 (Code)

Downloads public metadata without requiring AWS CLI / AWS credentials,
inspects schemas, aggregates pest counts per trap image (Pink Bollworm & American Bollworm),
and generates ground-truth pest risk metrics based on ICAR Economic Threshold Levels (ETL).
"""

import sys
import urllib.request
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

WADHWANI_S3_BASE = "https://wadhwaniai-agri-opendata.s3.amazonaws.com/"
METADATA_KEYS = [
    "metadata/20230327-1214/dev.csv.gz",
    "metadata/20230327-1214/test.csv.gz",
]

OUTPUT_DIR = ROOT / "ml" / "data" / "wadhwani_bollworm"
RAW_DIR = OUTPUT_DIR / "metadata"
PROCESSED_FILE = OUTPUT_DIR / "pest_counts_per_observation.csv"


def download_wadhwani_metadata():
    """Download Wadhwani AI bollworm metadata files directly via HTTPS."""
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    downloaded_files = []

    for key in METADATA_KEYS:
        filename = key.replace("/", "_")
        dest_path = RAW_DIR / filename
        downloaded_files.append(dest_path)

        if dest_path.exists() and dest_path.stat().st_size > 0:
            print(f"[CACHE] Already downloaded: {dest_path.name} ({dest_path.stat().st_size / 1e6:.2f} MB)")
            continue

        url = WADHWANI_S3_BASE + key
        print(f"[DOWNLOAD] Fetching {url} -> {dest_path.name} ...")
        urllib.request.urlretrieve(url, dest_path)
        print(f"[OK] Downloaded: {dest_path.name} ({dest_path.stat().st_size / 1e6:.2f} MB)")

    return downloaded_files


def inspect_and_aggregate_counts(metadata_files):
    """Inspects schema and aggregates pest detections into per-observation counts."""
    print("\n[STEP 2 & 3] Aggregating Pink & American Bollworm pest counts...")
    dfs = []
    for f in metadata_files:
        df = pd.read_csv(f, compression="gzip", low_memory=False)
        print(f"  • {f.name}: {len(df)} rows | Columns: {list(df.columns)}")
        dfs.append(df)

    raw = pd.concat(dfs, ignore_index=True)
    print(f"\nTotal raw bounding box/detection records: {len(raw)}")

    # Filter labeled rows (pbw = Pink Bollworm, abw = American Bollworm)
    labeled = raw.dropna(subset=["label", "url"])
    counts = (
        labeled.groupby(["url", "label"])
        .size()
        .reset_index(name="count")
    )

    wide = counts.pivot_table(
        index="url",
        columns="label",
        values="count",
        fill_value=0,
        aggfunc="sum",
    ).reset_index()

    # Rename species columns clearly
    if "pbw" in wide.columns:
        wide = wide.rename(columns={"pbw": "pink_bollworm_count"})
    else:
        wide["pink_bollworm_count"] = 0

    if "abw" in wide.columns:
        wide = wide.rename(columns={"abw": "american_bollworm_count"})
    else:
        wide["american_bollworm_count"] = 0

    wide["total_bollworm_count"] = wide["pink_bollworm_count"] + wide["american_bollworm_count"]

    # Calibrate Economic Threshold Levels (ETL) per ICAR / TNAU:
    # PBW: >= 8 High Risk, >= 3 Medium Risk
    # ABW: >= 5 High Risk, >= 2 Medium Risk
    def assign_risk_level(row):
        pbw = row["pink_bollworm_count"]
        abw = row["american_bollworm_count"]
        if pbw >= 8 or abw >= 5 or row["total_bollworm_count"] >= 10:
            return "High"
        elif pbw >= 3 or abw >= 2 or row["total_bollworm_count"] >= 3:
            return "Medium"
        else:
            return "Low"

    wide["risk_level"] = wide.apply(assign_risk_level, axis=1)

    PROCESSED_FILE.parent.mkdir(parents=True, exist_ok=True)
    wide.to_csv(PROCESSED_FILE, index=False)
    print(f"\n[OK] Aggregated counts saved to: {PROCESSED_FILE}")
    print(f"Observations: {len(wide)} images | Columns: {list(wide.columns)}")
    print("Risk level distribution from real Wadhwani trap data:")
    print(wide["risk_level"].value_counts())
    print("\nSample records:")
    print(wide.head(5))
    return wide


if __name__ == "__main__":
    files = download_wadhwani_metadata()
    inspect_and_aggregate_counts(files)
