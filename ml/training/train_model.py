"""
CropShield — Pest-risk model training (v4, real NASA POWER data)
================================================================

Data     : REAL NASA POWER daily point data (community=AG) for 10 Tamil Nadu
           locations, ml/data/nasa_power_raw/*.csv (collect with
           `python -m ml.data.collect_nasa_historical --start 2005 --end 2024`).
Features : ml.data.feature_engineering.build_feature_frame — the SAME function
           live inference uses (names match by construction).
Labels   : rule-derived weather-suitability index from pest_service thresholds
           (ml/data/pest_labels.py, documented in ml/data/LABELING.md).
           These are NOT observed outbreaks.
Split    : by calendar year (no temporal leakage):
             train        2005–2016   (base model fit)
             early-stop   2017–2018   (n_estimators selection, then refit on 2005–2018)
             calibration  2019–2021   (Platt scaling; never seen by the base model)
             test         2022–2024   (final metrics only)

Run from repo root:
    python -m ml.training.train_model
Artifacts (paths the backend loads):
    ml/training/saved_models/{pest_risk_model.joblib, pest_risk_model.json,
        scaler.joblib, feature_names.json, metrics.json, calibration_params.json,
        calibration_report.json, reliability_diagram.png, feature_importance.json}
    saved_models/{calibration_report.json, reliability_diagram.png}   (mirror)
"""

import json
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score, classification_report, confusion_matrix,
    f1_score, log_loss, roc_auc_score,
)
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

warnings.filterwarnings("ignore", category=UserWarning)

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from ml.data.collect_nasa_historical import RAW_DIR, load_raw_data  # noqa: E402
from ml.data.feature_engineering import MODEL_FEATURES, build_training_matrix  # noqa: E402
from ml.data.pest_labels import LABEL_NAMES  # noqa: E402

SAVE_DIR = ROOT / "ml" / "training" / "saved_models"
PLOT_DIR = ROOT / "ml" / "training" / "plots"
SEED = 42
MODEL_VERSION = "4.0.0-nasa-power-rules"

SPLITS = {
    "train": (2005, 2016),
    "early_stop": (2017, 2018),
    "calibration": (2019, 2021),
    "test": (2022, 2024),
}

XGB_PARAMS = dict(
    max_depth=6, learning_rate=0.05, subsample=0.85, colsample_bytree=0.85,
    min_child_weight=5, reg_lambda=1.5, objective="multi:softprob", num_class=3,
    eval_metric="mlogloss", tree_method="hist", random_state=SEED, n_jobs=4,
)


def _year_mask(df: pd.DataFrame, span) -> np.ndarray:
    y = df["date"].dt.year
    return ((y >= span[0]) & (y <= span[1])).to_numpy()


def load_matrix() -> pd.DataFrame:
    raw = load_raw_data(RAW_DIR)
    print(f"Raw NASA POWER rows: {len(raw):,} ({raw['location'].nunique()} locations, "
          f"{raw['date'].min().date()} → {raw['date'].max().date()})")
    return build_training_matrix(raw)


def split_matrix(matrix: pd.DataFrame):
    return {k: matrix[_year_mask(matrix, v)] for k, v in SPLITS.items()}


def risk_score_from_proba(p: np.ndarray) -> np.ndarray:
    """Same formula as inference_service: P(Medium)·0.5 + P(High)."""
    return np.clip(p[:, 1] * 0.5 + p[:, 2], 0.0, 1.0)


def eval_block(y, proba) -> dict:
    pred = proba.argmax(axis=1)
    return {
        "n": int(len(y)),
        "accuracy": round(float(accuracy_score(y, pred)), 4),
        "f1_macro": round(float(f1_score(y, pred, average="macro")), 4),
        "f1_weighted": round(float(f1_score(y, pred, average="weighted")), 4),
        "auc_ovr_weighted": round(float(roc_auc_score(y, proba, multi_class="ovr", average="weighted")), 4),
        "log_loss": round(float(log_loss(y, proba, labels=[0, 1, 2])), 4),
        "confusion_matrix": confusion_matrix(y, pred, labels=[0, 1, 2]).tolist(),
    }


def train():
    print("=" * 64)
    print("  CropShield — XGBoost pest-risk training on REAL NASA POWER data")
    print("=" * 64)
    SAVE_DIR.mkdir(parents=True, exist_ok=True)
    PLOT_DIR.mkdir(parents=True, exist_ok=True)

    matrix = load_matrix()
    parts = split_matrix(matrix)
    feats = list(MODEL_FEATURES)
    for k, v in parts.items():
        dist = np.bincount(v["risk_label"], minlength=3)
        print(f"  {k:12s} {SPLITS[k]}: {len(v):>7,} rows  Low/Med/High = {dist.tolist()}")

    X = {k: v[feats].to_numpy(dtype=np.float32) for k, v in parts.items()}
    y = {k: v["risk_label"].to_numpy(dtype=int) for k, v in parts.items()}

    # 1) choose n_estimators with early stopping on 2017–2018
    probe = XGBClassifier(n_estimators=1500, early_stopping_rounds=50, **XGB_PARAMS)
    scaler_probe = StandardScaler().fit(X["train"])
    probe.fit(scaler_probe.transform(X["train"]), y["train"],
              eval_set=[(scaler_probe.transform(X["early_stop"]), y["early_stop"])], verbose=False)
    n_best = int(probe.best_iteration) + 1
    print(f"\nEarly stopping (2017–2018): best n_estimators = {n_best}")

    # 2) refit base model on 2005–2018 (calibration + test years never seen)
    X_fit = np.vstack([X["train"], X["early_stop"]])
    y_fit = np.concatenate([y["train"], y["early_stop"]])
    scaler = StandardScaler().fit(X_fit)
    model = XGBClassifier(n_estimators=n_best, **XGB_PARAMS)
    model.fit(scaler.transform(X_fit), y_fit, verbose=False)

    Xs_cal, Xs_test = scaler.transform(X["calibration"]), scaler.transform(X["test"])
    p_test_raw = model.predict_proba(Xs_test)
    test_raw = eval_block(y["test"], p_test_raw)
    print(f"\nTest 2022–2024 (raw): acc={test_raw['accuracy']}  F1w={test_raw['f1_weighted']}  "
          f"F1macro={test_raw['f1_macro']}  AUC={test_raw['auc_ovr_weighted']}")
    print(classification_report(y["test"], p_test_raw.argmax(1), target_names=LABEL_NAMES, digits=4))

    majority = int(np.bincount(y_fit).argmax())
    baseline_acc = float((y["test"] == majority).mean())

    # per-crop / per-location test accuracy
    tdf = parts["test"].assign(pred=p_test_raw.argmax(1))
    per_crop = tdf.groupby("crop_name").apply(lambda d: round(float((d.pred == d.risk_label).mean()), 4)).to_dict()
    per_loc = tdf.groupby("location").apply(lambda d: round(float((d.pred == d.risk_label).mean()), 4)).to_dict()

    # 3) save base artifacts
    joblib.dump(model, SAVE_DIR / "pest_risk_model.joblib")
    model.save_model(SAVE_DIR / "pest_risk_model.json")  # portable XGBoost format
    joblib.dump(scaler, SAVE_DIR / "scaler.joblib")
    with open(SAVE_DIR / "feature_names.json", "w") as f:
        json.dump(feats, f, indent=2)

    # 4) calibration on 2019–2021 (held out from the base model), evaluated on test
    from backend.services.calibration_service import (
        evaluate_calibration, fit_platt_calibrator, plot_reliability_diagram,
    )
    calibrated = fit_platt_calibrator(model, Xs_cal, y["calibration"], out_dir=SAVE_DIR)
    p_test_cal = calibrated.predict_proba(Xs_test)
    test_cal = eval_block(y["test"], p_test_cal)
    report = evaluate_calibration(
        calibrated, Xs_test, y["test"], target_class=2, out_dir=SAVE_DIR,
        raw_probs=p_test_raw,
        extra={
            "calibration_split": f"{SPLITS['calibration'][0]}-{SPLITS['calibration'][1]}",
            "test_split": f"{SPLITS['test'][0]}-{SPLITS['test'][1]}",
            "base_model_version": MODEL_VERSION,
        },
    )
    plot_reliability_diagram(report, save_path=str(SAVE_DIR / "reliability_diagram.png"))
    print(f"Calibration ({report['calibration_method']}): ECE(High) raw={report['ece_raw']} → "
          f"calibrated={report['expected_calibration_error']}; Brier raw={report['brier_raw']} → "
          f"{report['brier_score']}")

    # 5) metrics.json
    raw_meta = []
    for mf in sorted(RAW_DIR.glob("*.meta.json")):
        with open(mf) as f:
            m = json.load(f)
        raw_meta.append({"location": m["location"]["name"], "lat": m["location"]["lat"],
                         "lon": m["location"]["lon"], "rows": m["rows"],
                         "downloaded_utc": m.get("downloaded_utc")})
    metrics = {
        "model_name": "CropShield XGBoost pest weather-suitability classifier",
        "model_version": MODEL_VERSION,
        "trained_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "data_source": "NASA POWER Daily API v2 (community=AG), https://power.larc.nasa.gov/api/temporal/daily/point",
        "raw_files": raw_meta,
        "label_source": "Rule-derived weather-suitability index (pest_service.PEST_DATABASE thresholds); "
                        "NOT observed outbreaks — see ml/data/LABELING.md",
        "label_boundaries": {"low_max": 0.35, "medium_max": 0.65},
        "splits": {k: f"{a}-{b}" for k, (a, b) in SPLITS.items()},
        "n_rows": {k: int(len(v)) for k, v in parts.items()},
        "label_distribution": {k: np.bincount(v["risk_label"], minlength=3).tolist() for k, v in parts.items()},
        "n_features": len(feats),
        "n_estimators": n_best,
        "xgb_params": XGB_PARAMS,
        "seed": SEED,
        "test_raw": test_raw,
        "test_calibrated": test_cal,
        "majority_class_baseline_accuracy": round(baseline_acc, 4),
        "test_accuracy_by_crop": per_crop,
        "test_accuracy_by_location": per_loc,
        "calibration_method": report["calibration_method"],
        # legacy keys read by admin/UI
        "accuracy": test_raw["accuracy"],
        "f1_weighted": test_raw["f1_weighted"],
        "auc_roc": test_raw["auc_ovr_weighted"],
        "interpretation": (
            "The model reproduces a deterministic rule index on unseen years (2022-2024). "
            "High scores measure agreement with the documented rules, not the ability to "
            "predict observed pest outbreaks, for which no ground truth is available."
        ),
    }
    with open(SAVE_DIR / "metrics.json", "w") as f:
        json.dump(metrics, f, indent=2)

    # 6) plots + SHAP importance (test sample)
    _plots(model, Xs_test, y["test"], p_test_raw, feats)
    print(f"\nArtifacts written to {SAVE_DIR}")
    return model, scaler, feats, metrics


def _plots(model, Xs_test, y_test, p_test, feats):
    cm = confusion_matrix(y_test, p_test.argmax(1), labels=[0, 1, 2])
    fig, ax = plt.subplots(figsize=(5, 4))
    ax.imshow(cm, cmap="Blues")
    ax.set_xticks([0, 1, 2]); ax.set_yticks([0, 1, 2])
    ax.set_xticklabels(LABEL_NAMES); ax.set_yticklabels(LABEL_NAMES)
    ax.set_xlabel("Predicted"); ax.set_ylabel("Rule label")
    ax.set_title("Confusion matrix — test years 2022–2024")
    for i in range(3):
        for j in range(3):
            ax.text(j, i, f"{cm[i, j]:,}", ha="center", va="center",
                    color="white" if cm[i, j] > cm.max() * 0.5 else "black")
    plt.tight_layout()
    plt.savefig(PLOT_DIR / "confusion_matrix.png", dpi=130)
    plt.close()
    try:
        import shap
        rng = np.random.default_rng(SEED)
        idx = rng.choice(len(Xs_test), min(1000, len(Xs_test)), replace=False)
        sv = shap.TreeExplainer(model).shap_values(Xs_test[idx])
        sv_h = sv[2] if isinstance(sv, list) else (sv[:, :, 2] if np.ndim(sv) == 3 else sv)
        mean_abs = np.abs(sv_h).mean(axis=0)
        fi = dict(sorted({feats[i]: round(float(mean_abs[i]), 4) for i in range(len(feats))}.items(),
                         key=lambda x: x[1], reverse=True))
        with open(SAVE_DIR / "feature_importance.json", "w") as f:
            json.dump(fi, f, indent=2)
        plt.figure(figsize=(9, 7))
        shap.summary_plot(sv_h, Xs_test[idx], feature_names=feats, plot_type="bar", show=False, max_display=20)
        plt.title("Mean |SHAP| — High class (test 2022–2024)")
        plt.tight_layout()
        plt.savefig(PLOT_DIR / "shap_summary.png", dpi=130)
        plt.close()
    except Exception as e:  # SHAP is optional for training
        print(f"SHAP skipped: {e}")


if __name__ == "__main__":
    train()
