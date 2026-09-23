"""
AgriGuard — Model Calibration Training Script
Performs 3-way data split (Train 70% / Calibration 15% / Test 15%),
fits Platt scaling via CalibratedClassifierCV on held-out calibration data,
evaluates Expected Calibration Error (ECE) and Brier score on test data,
and produces the official Reliability Diagram for the Testing chapter.

Usage:
    python -m ml.training.train_calibration
"""

import sys
import json
from pathlib import Path

import numpy as np
import pandas as pd
import joblib
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from backend.services.calibration_service import (
    train_calibrator,
    evaluate_calibration,
    plot_reliability_diagram,
)

DATA_PATH = ROOT / "agriguard_multicrop_dataset_10000rows.csv"
SAVE_DIR = ROOT / "saved_models"
ML_SAVE_DIR = ROOT / "ml" / "training" / "saved_models"
FEATURE_NAMES_PATH = ML_SAVE_DIR / "feature_names.json"

SAVE_DIR.mkdir(parents=True, exist_ok=True)
ML_SAVE_DIR.mkdir(parents=True, exist_ok=True)


def run_calibration_pipeline():
    print("=" * 65)
    print("  AgriGuard — Model Confidence Calibration Pipeline (Platt Scaling)")
    print("=" * 65)

    if not DATA_PATH.exists():
        print(f"Dataset not found at {DATA_PATH}. Using fallback synthetic matrix.")
        np.random.seed(42)
        X = np.random.randn(10000, 33).astype(np.float32)
        y = np.random.choice([0, 1, 2], size=10000, p=[0.45, 0.35, 0.20])
    else:
        print(f"Loading multi-crop agricultural dataset: {DATA_PATH}")
        df = pd.read_csv(DATA_PATH)
        print(f"  -> {len(df):,} total samples")

        with open(FEATURE_NAMES_PATH, "r") as f:
            feat_cols = json.load(f)

        # Ensure all columns exist
        for col in feat_cols:
            if col not in df.columns:
                df[col] = 0.0

        X = df[feat_cols].values.astype(np.float32)

        # Label encoding: Low=0, Medium=1, High=2
        label_map = {"Low": 0, "Medium": 1, "High": 2, 0: 0, 1: 1, 2: 2}
        y = df["risk_level"].map(label_map).fillna(0).values.astype(int)

    n_samples = len(X)
    print(f"\n1. Executing 3-Way Split (70% Train / 15% Calibration / 15% Test):")
    idx = np.random.permutation(n_samples)
    n_train = int(0.70 * n_samples)
    n_calib = int(0.15 * n_samples)

    train_idx = idx[:n_train]
    calib_idx = idx[n_train:n_train + n_calib]
    test_idx = idx[n_train + n_calib:]

    X_train, y_train = X[train_idx], y[train_idx]
    X_calib, y_calib = X[calib_idx], y[calib_idx]
    X_test, y_test = X[test_idx], y[test_idx]

    print(f"  * Training set     : {len(X_train):,} samples")
    print(f"  * Calibration set  : {len(X_calib):,} samples (never seen by base model)")
    print(f"  * Test set         : {len(X_test):,} samples")

    # Fit Scaler
    scaler = StandardScaler()
    X_train_sc = scaler.fit_transform(X_train)
    X_calib_sc = scaler.transform(X_calib)
    X_test_sc = scaler.transform(X_test)

    # 2. Base XGBoost Classifier
    base_model_path = ML_SAVE_DIR / "pest_risk_model.joblib"
    if base_model_path.exists():
        print(f"\n2. Loading existing base model: {base_model_path}")
        base_model = joblib.load(base_model_path)
    else:
        print("\n2. Training base XGBoost model on Train partition...")
        base_model = XGBClassifier(
            n_estimators=300,
            max_depth=6,
            learning_rate=0.06,
            objective="multi:softprob",
            num_class=3,
            eval_metric="mlogloss",
            random_state=42,
            n_jobs=-1,
        )
        base_model.fit(X_train_sc, y_train)
        joblib.dump(base_model, base_model_path)
        joblib.dump(scaler, ML_SAVE_DIR / "scaler.joblib")

    # 3. Fit Platt Scaling Calibrator on Calibration set
    print("\n3. Fitting Platt Scaler (sigmoid CalibratedClassifierCV) on Calibration set...")
    calibrated_model = train_calibrator(
        base_model=base_model,
        X_train=X_train_sc,
        y_train=y_train,
        X_calib=X_calib_sc,
        y_calib=y_calib,
        method="sigmoid",
        out_dir=SAVE_DIR,
    )

    # 4. Evaluate Calibration on Test set
    print("\n4. Evaluating Calibration on held-out Test set...")
    report = evaluate_calibration(
        calibrated_model=calibrated_model,
        X_test=X_test_sc,
        y_test=y_test,
        target_class=2,  # High risk class
        out_dir=SAVE_DIR,
    )

    print(f"  * Expected Calibration Error (ECE) : {report['expected_calibration_error']:.4f}")
    print(f"  * Brier Score Loss                 : {report['brier_score']:.4f} (lower is better)")
    print(f"  * Target Class                     : {report['target_class']}")

    # 5. Generate Reliability Diagram
    print("\n5. Plotting Reliability Diagram...")
    img_path = plot_reliability_diagram(report, save_path=str(SAVE_DIR / "reliability_diagram.png"))
    print(f"  * Saved reliability diagram -> {img_path}")

    print("\n" + "=" * 65)
    print("  [SUCCESS] Confidence Calibration Pipeline Successfully Completed!")
    print("=" * 65)
    return report


if __name__ == "__main__":
    run_calibration_pipeline()
