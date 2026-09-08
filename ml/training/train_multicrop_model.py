"""
AgriGuard / CropShield — Multi-Crop Pest Risk Training Pipeline
Trains XGBoost multiclass model on the 10,000-row real dataset across 6 major crops:
Cotton, Rice, Millets, Pulses, Sorghum, Sugarcane.
Generates SHAP explainability plots, confusion matrix, and performance metrics for the PD Report.
"""

import json
import sys
import warnings
from pathlib import Path

if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import shap
from sklearn.metrics import (
    accuracy_score, classification_report,
    confusion_matrix, f1_score, roc_auc_score,
)
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

DATA_FILE = ROOT / "ml" / "data" / "agriguard_multicrop_dataset_10000rows.csv"
SAVE_DIR = ROOT / "ml" / "training" / "saved_models"
PLOT_DIR = ROOT / "ml" / "training" / "plots"
SAVE_DIR.mkdir(parents=True, exist_ok=True)
PLOT_DIR.mkdir(parents=True, exist_ok=True)


def train_multicrop():
    print("=" * 65)
    print("  AgriGuard AI — Multi-Crop XGBoost Model Training (10,000 Samples)")
    print("=" * 65)

    if not DATA_FILE.exists():
        raise FileNotFoundError(f"Dataset not found at {DATA_FILE}")

    print(f"Loading dataset: {DATA_FILE.name}")
    df = pd.read_csv(DATA_FILE)
    print(f"  • Total samples: {len(df):,}")
    print(f"  • Crops: {dict(df['crop_type'].value_counts())}")

    # Map target risk_level to integer (Low=0, Medium=1, High=2)
    risk_map = {"Low": 0, "Medium": 1, "High": 2}
    df["risk_label"] = df["risk_level"].map(risk_map)

    # One-hot encode crop_type and location
    df_encoded = pd.get_dummies(df, columns=["crop_type", "location"], drop_first=False)

    # Select numerical feature columns
    ignore_cols = ["date", "risk_level", "risk_score", "risk_label"]
    feat_cols = [c for c in df_encoded.columns if c not in ignore_cols and np.issubdtype(df_encoded[c].dtype, np.number)]

    X = df_encoded[feat_cols].values.astype(np.float32)
    y = df_encoded["risk_label"].values.astype(int)

    print(f"\nFeature count: {len(feat_cols)}")
    print(f"Target distribution: Low={np.sum(y==0):,}, Medium={np.sum(y==1):,}, High={np.sum(y==2):,}")

    # Stratified train-test split (80% train, 20% test)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, stratify=y, random_state=42
    )

    scaler = StandardScaler()
    Xtr = scaler.fit_transform(X_train)
    Xte = scaler.transform(X_test)

    # Train XGBoost Classifier
    model = XGBClassifier(
        n_estimators=350,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.85,
        colsample_bytree=0.85,
        min_child_weight=3,
        gamma=0.1,
        reg_alpha=0.1,
        reg_lambda=1.2,
        objective="multi:softprob",
        num_class=3,
        eval_metric="mlogloss",
        random_state=42,
        n_jobs=-1,
        early_stopping_rounds=30,
    )

    print("\nFitting XGBoost model...")
    model.fit(Xtr, y_train, eval_set=[(Xte, y_test)], verbose=50)

    # Predictions & Metrics
    y_pred = model.predict(Xte)
    y_prob = model.predict_proba(Xte)
    acc = accuracy_score(y_test, y_pred)
    f1 = f1_score(y_test, y_pred, average="weighted")
    auc = roc_auc_score(y_test, y_prob, multi_class="ovr", average="weighted")

    print("\n" + "-" * 50)
    print(f"  Test Accuracy : {acc:.4f} ({acc*100:.2f}%)")
    print(f"  Weighted F1   : {f1:.4f}")
    print(f"  AUC-ROC (OVR) : {auc:.4f}")
    print("-" * 50)

    print("\nClassification Report:\n", classification_report(y_test, y_pred, target_names=["Low", "Medium", "High"]))

    # 5-Fold Cross Validation
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_scores = cross_val_score(
        XGBClassifier(n_estimators=150, max_depth=6, learning_rate=0.05, random_state=42, n_jobs=-1),
        Xtr, y_train, cv=cv, scoring="f1_weighted"
    )
    print(f"5-Fold CV F1-Score: {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")

    # Save artifacts
    joblib.dump(model, SAVE_DIR / "pest_risk_model.joblib")
    joblib.dump(scaler, SAVE_DIR / "scaler.joblib")
    with open(SAVE_DIR / "feature_names.json", "w") as f:
        json.dump(feat_cols, f, indent=2)

    metrics = {
        "model_name": "AgriGuard XGBoost Multi-Crop Pest Risk Classifier",
        "dataset": "agriguard_multicrop_dataset_10000rows.csv",
        "n_samples": len(df),
        "n_features": len(feat_cols),
        "accuracy": round(acc, 4),
        "f1_weighted": round(f1, 4),
        "auc_roc": round(auc, 4),
        "cv_f1_mean": round(float(cv_scores.mean()), 4),
        "cv_f1_std": round(float(cv_scores.std()), 4),
        "model_version": "3.0.0-multicrop",
    }
    with open(SAVE_DIR / "metrics.json", "w") as f:
        json.dump(metrics, f, indent=2)
    print(f"[OK] Saved model & metrics to: {SAVE_DIR}")

    # Generate Confusion Matrix plot
    cm = confusion_matrix(y_test, y_pred)
    fig, ax = plt.subplots(figsize=(6, 5))
    cax = ax.imshow(cm, cmap="Blues", interpolation="nearest")
    fig.colorbar(cax)
    ax.set_xticks([0, 1, 2])
    ax.set_yticks([0, 1, 2])
    ax.set_xticklabels(["Low", "Medium", "High"], fontsize=11)
    ax.set_yticklabels(["Low", "Medium", "High"], fontsize=11)
    ax.set_xlabel("Predicted Pest Risk Level", fontsize=12, fontweight="bold")
    ax.set_ylabel("Ground Truth Risk Level", fontsize=12, fontweight="bold")
    ax.set_title("AgriGuard AI — Confusion Matrix (10,000 Multi-Crop Data)", fontsize=13, fontweight="bold", pad=12)

    for i in range(3):
        for j in range(3):
            ax.text(j, i, f"{cm[i, j]:,}", ha="center", va="center",
                    color="white" if cm[i, j] > cm.max() * 0.5 else "black",
                    fontweight="bold", fontsize=12)
    plt.tight_layout()
    cm_plot_path = PLOT_DIR / "confusion_matrix.png"
    plt.savefig(cm_plot_path, dpi=150)
    plt.close()
    print(f"[OK] Confusion matrix plot saved: {cm_plot_path}")

    # Generate SHAP Summary Plot
    print("\nComputing TreeSHAP values for High Risk predictions...")
    try:
        explainer = shap.TreeExplainer(model)
        sample_idx = np.random.choice(len(Xte), min(500, len(Xte)), replace=False)
        shap_vals = explainer.shap_values(Xte[sample_idx])

        # For multiclass, index 2 is High Risk
        sv_high = shap_vals[2] if isinstance(shap_vals, list) else shap_vals

        plt.figure(figsize=(10, 8))
        shap.summary_plot(
            sv_high, Xte[sample_idx], feature_names=feat_cols,
            plot_type="bar", show=False, max_display=15
        )
        plt.title("AgriGuard AI — Top SHAP Feature Importance (High Pest Risk Class)", fontsize=13, fontweight="bold")
        plt.tight_layout()
        shap_plot_path = PLOT_DIR / "shap_summary.png"
        plt.savefig(shap_plot_path, dpi=150)
        plt.close()
        print(f"[OK] SHAP summary plot saved: {shap_plot_path}")

        mean_abs_shap = np.abs(sv_high).mean(axis=0)
        fi = {feat_cols[i]: round(float(mean_abs_shap[i]), 4) for i in range(len(feat_cols))}
        fi_sorted = dict(sorted(fi.items(), key=lambda x: x[1], reverse=True))
        with open(SAVE_DIR / "feature_importance.json", "w") as f:
            json.dump(fi_sorted, f, indent=2)
    except Exception as e:
        print(f"[WARN] SHAP generation skipped: {e}")

    print("\n[OK] Model training and evaluation completed successfully.")
    return model, scaler, metrics


if __name__ == "__main__":
    train_multicrop()
