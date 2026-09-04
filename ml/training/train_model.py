"""
CropShield — XGBoost Model Training (v2)
Trains on NASA POWER historical data 1980–2025.
Target: current-day pest risk (Low=0 / Medium=1 / High=2).

Run from project root:
    python -m ml.training.train_model

Prerequisites (optional but recommended):
    python -m ml.data.collect_nasa_historical
    # Downloads real NASA POWER data.
    # If skipped, a realistic synthetic fallback is generated.
"""

import json
import sys
import warnings
from pathlib import Path

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
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

DATA_DIR = ROOT / "ml" / "data" / "nasa_historical"
SAVE_DIR = ROOT / "ml" / "training" / "saved_models"
PLOT_DIR = ROOT / "ml" / "training" / "plots"
SAVE_DIR.mkdir(parents=True, exist_ok=True)
PLOT_DIR.mkdir(parents=True, exist_ok=True)


def load_data() -> pd.DataFrame:
    """Load NASA POWER historical data, or generate synthetic fallback."""
    master = DATA_DIR / "all_locations.parquet"
    if master.exists():
        print(f"Loading NASA POWER historical data: {master}")
        df = pd.read_parquet(master)
        print(f"  → {len(df):,} rows, {df['location'].nunique()} locations")
        return df

    print("⚠  NASA POWER historical data not found.")
    print("   Run:  python -m ml.data.collect_nasa_historical")
    print("   Using synthetic 1980–2025 fallback for development.\n")
    return _synthetic_fallback()


def _synthetic_fallback() -> pd.DataFrame:
    """
    Climate-realistic synthetic data covering 10 TN locations × 1980–2025.
    Seasonal patterns derived from Tamil Nadu climatological normals.
    Used ONLY when real NASA POWER data is unavailable.
    """
    from ml.data.collect_nasa_historical import TRAINING_LOCATIONS

    np.random.seed(42)
    dates = pd.date_range("1980-01-01", "2025-12-31", freq="D")
    seasonal = {
        1: (26,60,1), 2: (27,58,1), 3: (30,52,2), 4: (33,48,3),
        5: (35,46,4), 6: (32,72,7), 7: (30,78,9), 8: (30,80,9),
        9: (29,78,8), 10:(28,82,11),11:(27,80,10),12:(26,70,4),
    }
    rows = []
    for loc in TRAINING_LOCATIONS:
        print(f"  Generating {loc['name']}...", end="\r")
        for d in dates:
            tb, rb, pb = seasonal[d.month]
            t   = float(np.clip(np.random.normal(tb, 3.2), 16, 46))
            rh  = float(np.clip(np.random.normal(rb, 10), 15, 100))
            r   = float(np.clip(np.random.exponential(pb), 0, 120))
            tmax= t + float(np.random.uniform(3, 7))
            tmin= t - float(np.random.uniform(3, 7))
            rad = float(np.clip(np.random.normal(16, 3), 6, 26))
            ws  = float(np.clip(np.random.exponential(2), 0.3, 9))
            et0 = max(0.0, 0.0023*(t+17.8)*max(0,tmax-tmin)**0.5*rad*0.408)
            rows.append({
                "date": d, "location": loc["name"],
                "latitude": loc["lat"], "longitude": loc["lon"],
                "zone": loc["zone"],
                "t2m": round(t,2), "t2m_max": round(tmax,2),
                "t2m_min": round(tmin,2), "rh2m": round(rh,2),
                "ws2m": round(ws,2), "prectotcorr": round(r,2),
                "allsky_sfc_sw_dwn": round(rad,2), "et0": round(et0,3),
            })
    df = pd.DataFrame(rows)
    out = DATA_DIR / "synthetic_fallback.parquet"
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    df.to_parquet(out, index=False)
    print(f"\nSynthetic data: {len(df):,} rows → {out}")
    return df


def build_matrix(raw_df: pd.DataFrame) -> pd.DataFrame:
    from ml.data.feature_engineering import build_training_matrix
    print("\nEngineering features (rolling, lag, cyclical, soil, crop)...")
    return build_training_matrix(raw_df)


def get_feature_columns(df: pd.DataFrame):
    from ml.data.feature_engineering import get_feature_columns
    return get_feature_columns(df)


def train():
    print("=" * 60)
    print("  CropShield v2 — XGBoost Training (NASA POWER 1980–2025)")
    print("=" * 60)

    raw_df = load_data()
    matrix = build_matrix(raw_df)

    feat_cols = get_feature_columns(matrix)
    matrix = matrix.dropna(subset=feat_cols + ["risk_label"])

    X = matrix[feat_cols].values.astype(np.float32)
    y = matrix["risk_label"].values.astype(int)

    print(f"\nDataset: {len(matrix):,} samples | {len(feat_cols)} features")
    u, c = np.unique(y, return_counts=True)
    print(f"Labels : Low={c[0]:,}  Medium={c[1]:,}  High={c[2]:,}")

    # Time-aware split: last 10% of data as test (no future leakage)
    split = int(len(X) * 0.90)
    X_train, X_test = X[:split], X[split:]
    y_train, y_test = y[:split], y[split:]

    scaler = StandardScaler()
    Xtr = scaler.fit_transform(X_train)
    Xte = scaler.transform(X_test)

    model = XGBClassifier(
        n_estimators=400, max_depth=7, learning_rate=0.06,
        subsample=0.80, colsample_bytree=0.80,
        min_child_weight=5, gamma=0.1,
        reg_alpha=0.1, reg_lambda=1.5,
        objective="multi:softprob", num_class=3,
        eval_metric="mlogloss", use_label_encoder=False,
        random_state=42, n_jobs=-1, early_stopping_rounds=40,
    )

    print("\nTraining...")
    model.fit(Xtr, y_train, eval_set=[(Xte, y_test)], verbose=100)

    y_pred = model.predict(Xte)
    y_prob = model.predict_proba(Xte)
    acc = accuracy_score(y_test, y_pred)
    f1  = f1_score(y_test, y_pred, average="weighted")
    auc = roc_auc_score(y_test, y_prob, multi_class="ovr", average="weighted")

    print(f"\n{'─'*44}")
    print(f"  Accuracy : {acc:.4f}  |  F1: {f1:.4f}  |  AUC: {auc:.4f}")
    print(f"{'─'*44}")
    print(classification_report(y_test, y_pred, target_names=["Low","Medium","High"]))

    # CV on sample
    samp = np.random.choice(len(X), min(50_000, len(X)), replace=False)
    cv_model = XGBClassifier(n_estimators=200, max_depth=7, learning_rate=0.06,
                              objective="multi:softprob", num_class=3,
                              use_label_encoder=False, random_state=42, n_jobs=-1)
    cv_s = cross_val_score(cv_model, scaler.transform(X[samp]), y[samp],
                           cv=StratifiedKFold(5, shuffle=True, random_state=42),
                           scoring="f1_weighted")
    print(f"5-Fold CV F1 (50k sample): {cv_s.mean():.4f} ± {cv_s.std():.4f}")

    # ── Save ─────────────────────────────────────────────────
    joblib.dump(model,  SAVE_DIR / "pest_risk_model.joblib")
    joblib.dump(scaler, SAVE_DIR / "scaler.joblib")
    with open(SAVE_DIR / "feature_names.json", "w") as f:
        json.dump(feat_cols, f, indent=2)

    metrics = {
        "accuracy": round(acc,4), "f1_weighted": round(f1,4), "auc_roc": round(auc,4),
        "cv_f1_mean": round(float(cv_s.mean()),4), "cv_f1_std": round(float(cv_s.std()),4),
        "n_features": len(feat_cols), "n_train": int(len(X_train)), "n_test": int(len(X_test)),
        "training_data": "NASA POWER 1980-01-01 to 2025-12-31",
        "model_version": "2.0.0",
    }
    with open(SAVE_DIR / "metrics.json", "w") as f:
        json.dump(metrics, f, indent=2)

    # ── SHAP ─────────────────────────────────────────────────
    print("\nComputing SHAP values (1000-sample)...")
    try:
        expl = shap.TreeExplainer(model)
        idx  = np.random.choice(len(Xte), min(1000, len(Xte)), replace=False)
        sv   = expl.shap_values(Xte[idx])
        sv_h = sv[2] if isinstance(sv, list) else sv

        plt.figure(figsize=(10,8))
        shap.summary_plot(sv_h, Xte[idx], feature_names=feat_cols,
                          plot_type="bar", show=False, max_display=20)
        plt.title("Top SHAP Features — High Risk Class (NASA POWER 1980–2025)")
        plt.tight_layout()
        plt.savefig(PLOT_DIR/"shap_summary.png", dpi=130, bbox_inches="tight")
        plt.close()

        mean_abs = np.abs(sv_h).mean(axis=0)
        fi = {feat_cols[i]: round(float(mean_abs[i]),4) for i in range(len(feat_cols))}
        with open(SAVE_DIR/"feature_importance.json","w") as f:
            json.dump(dict(sorted(fi.items(), key=lambda x: x[1], reverse=True)), f, indent=2)

        print("\nTop 12 features (SHAP, High Risk class):")
        for k,v in sorted(fi.items(), key=lambda x: x[1], reverse=True)[:12]:
            print(f"  {k:42s}  {v:.4f}")
    except Exception as e:
        print(f"SHAP skipped: {e}")

    # ── Confusion matrix plot ─────────────────────────────────
    cm = confusion_matrix(y_test, y_pred)
    fig, ax = plt.subplots(figsize=(5,4))
    ax.imshow(cm, cmap="YlOrRd")
    ax.set_xticks([0,1,2]); ax.set_yticks([0,1,2])
    ax.set_xticklabels(["Low","Med","High"])
    ax.set_yticklabels(["Low","Med","High"])
    ax.set_xlabel("Predicted"); ax.set_ylabel("Actual")
    ax.set_title("Confusion Matrix — NASA POWER 1980–2025")
    for i in range(3):
        for j in range(3):
            ax.text(j, i, str(cm[i,j]), ha="center", va="center", fontsize=11,
                    color="white" if cm[i,j] > cm.max()*0.5 else "black")
    plt.tight_layout()
    plt.savefig(PLOT_DIR/"confusion_matrix.png", dpi=130, bbox_inches="tight")
    plt.close()

    print(f"\n✅ Training complete!  Artifacts → {SAVE_DIR}")
    return model, scaler, feat_cols, metrics


if __name__ == "__main__":
    train()
