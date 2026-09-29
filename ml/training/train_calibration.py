"""
Re-fit ONLY the Platt calibrator for the saved base model.

Uses the same year-based split as ml/training/train_model.py. The calibrator is
fitted on 2019-2021, which the base model never saw (the base model is trained
on 2005-2018), and evaluated on 2022-2024. The full pipeline
(`python -m ml.training.train_model`) already does this step, so this script
only matters after you change calibration code.

Usage:
    python -m ml.training.train_calibration
"""

import sys
from pathlib import Path

import joblib

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from ml.training.train_model import MODEL_VERSION, SAVE_DIR, SPLITS, load_matrix, split_matrix  # noqa: E402
from backend.services.calibration_service import (  # noqa: E402
    evaluate_calibration, fit_platt_calibrator, plot_reliability_diagram,
)


def run_calibration_pipeline():
    import json
    model = joblib.load(SAVE_DIR / "pest_risk_model.joblib")
    scaler = joblib.load(SAVE_DIR / "scaler.joblib")
    with open(SAVE_DIR / "feature_names.json") as f:
        feats = json.load(f)
    parts = split_matrix(load_matrix())
    Xc = scaler.transform(parts["calibration"][feats].to_numpy(dtype="float32"))
    Xt = scaler.transform(parts["test"][feats].to_numpy(dtype="float32"))
    yc = parts["calibration"]["risk_label"].to_numpy()
    yt = parts["test"]["risk_label"].to_numpy()
    cal = fit_platt_calibrator(model, Xc, yc, out_dir=SAVE_DIR)
    report = evaluate_calibration(
        cal, Xt, yt, target_class=2, out_dir=SAVE_DIR, raw_probs=model.predict_proba(Xt),
        extra={"calibration_split": "%d-%d" % SPLITS["calibration"],
               "test_split": "%d-%d" % SPLITS["test"], "base_model_version": MODEL_VERSION},
    )
    plot_reliability_diagram(report, save_path=str(SAVE_DIR / "reliability_diagram.png"))
    print(json.dumps({k: report[k] for k in ("calibration_method", "ece_raw", "expected_calibration_error",
                                             "brier_raw", "brier_score")}, indent=2))
    return report


if __name__ == "__main__":
    run_calibration_pipeline()
