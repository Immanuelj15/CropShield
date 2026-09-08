"""
AgriGuard / CropShield — Soil & Crop Yield Prediction Model Training
Trains a Random Forest Regressor on the 10,000-row soil profile & crop yield dataset.
Predicts expected yield (kg/hectare and tons/ha) from soil NPK, pH, EC, organic carbon, and crop metadata.
"""

import sys
import json
import warnings
from pathlib import Path

if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score, root_mean_squared_error
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

DATA_FILE = ROOT / "ml" / "data" / "agriguard_soil_yield_dataset_10000rows.csv"
SAVE_DIR = ROOT / "ml" / "yield_prediction" / "saved_models"
SAVE_DIR.mkdir(parents=True, exist_ok=True)


def train_yield():
    print("=" * 65)
    print("  AgriGuard AI — Soil & Crop Yield Training (10,000 Samples)")
    print("=" * 65)

    if not DATA_FILE.exists():
        raise FileNotFoundError(f"Dataset missing: {DATA_FILE}")

    df = pd.read_csv(DATA_FILE)
    print(f"Loaded: {DATA_FILE.name} ({len(df):,} rows)")
    print(f"Crops: {dict(df['crop_type'].value_counts())}")

    # One-hot encode categorical features: crop_type, season, district_soil_type, location
    cat_cols = ["crop_type", "season", "district_soil_type", "location"]
    df_encoded = pd.get_dummies(df, columns=cat_cols, drop_first=False)

    num_features = [
        "soil_ph", "soil_ec_dS_m", "organic_carbon_pct",
        "available_nitrogen_kg_ha", "available_phosphorus_kg_ha",
        "available_potassium_kg_ha", "area_hectares"
    ]
    encoded_cols = [c for c in df_encoded.columns if any(c.startswith(prefix + "_") for prefix in cat_cols)]
    feature_cols = num_features + encoded_cols

    X = df_encoded[feature_cols].values.astype(np.float32)
    y = df_encoded["yield_kg_per_hectare"].values.astype(np.float32)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42
    )

    scaler = StandardScaler()
    Xtr = scaler.fit_transform(X_train)
    Xte = scaler.transform(X_test)

    print(f"Training Random Forest Regressor on {len(X_train):,} samples with {len(feature_cols)} features...")
    model = RandomForestRegressor(
        n_estimators=150,
        max_depth=12,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=-1,
    )
    model.fit(Xtr, y_train)

    y_pred = model.predict(Xte)
    r2 = r2_score(y_test, y_pred)
    mae = mean_absolute_error(y_test, y_pred)
    rmse = root_mean_squared_error(y_test, y_pred)

    print("\n" + "-" * 50)
    print(f"  R2 Score  : {r2:.4f} ({r2*100:.2f}% variance explained)")
    print(f"  MAE       : {mae:.2f} kg/hectare")
    print(f"  RMSE      : {rmse:.2f} kg/hectare")
    print("-" * 50)

    # Save artifacts
    joblib.dump(model, SAVE_DIR / "yield_model.joblib")
    joblib.dump(scaler, SAVE_DIR / "yield_scaler.joblib")
    with open(SAVE_DIR / "yield_features.json", "w") as f:
        json.dump(feature_cols, f, indent=2)

    metrics = {
        "model_name": "RandomForestRegressor",
        "dataset": "agriguard_soil_yield_dataset_10000rows.csv",
        "n_samples": len(df),
        "n_features": len(feature_cols),
        "r2_score": round(float(r2), 4),
        "mae_kg_per_ha": round(float(mae), 2),
        "rmse_kg_per_ha": round(float(rmse), 2),
    }
    with open(SAVE_DIR / "yield_metrics.json", "w") as f:
        json.dump(metrics, f, indent=2)
    print(f"[OK] Saved yield prediction model and metrics to: {SAVE_DIR}")


if __name__ == "__main__":
    train_yield()
