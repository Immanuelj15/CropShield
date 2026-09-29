"""
Feature alignment between live inference and the trained model (audit P0-7 / P3-8).

The live pipeline (ml.data.feature_engineering.build_live_feature_row) must produce every
column listed in ml/training/saved_models/feature_names.json, in the trained order, with
finite values, for every supported crop. No database, no network.
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
SAVED = ROOT / "ml" / "training" / "saved_models"
RAW_DIR = ROOT / "ml" / "data" / "nasa_power_raw"

fe = pytest.importorskip("ml.data.feature_engineering")

INFORMATIONAL_COLUMNS = {"soil_ph", "soil_oc", "climate_zone"}  # carried along, never model inputs
SOIL = {"ph": 7.6, "organic_carbon": 0.45}


def _trained_features():
    with open(SAVED / "feature_names.json", encoding="utf-8") as f:
        return json.load(f)


def _nasa_window(days: int = 40) -> pd.DataFrame:
    """Last `days` rows of real NASA POWER data (uppercase API names, like the live fetch)."""
    path = RAW_DIR / "kovilpatti.csv"
    if not path.exists():
        pytest.skip("ml/data/nasa_power_raw/kovilpatti.csv not present")
    df = pd.read_csv(path).tail(days)
    cols = ["date", "T2M", "T2M_MAX", "T2M_MIN", "RH2M", "WS2M", "PRECTOTCORR", "ALLSKY_SFC_SW_DWN"]
    return df[cols].reset_index(drop=True)


def _live_like_window(days: int = 36) -> pd.DataFrame:
    """The same frame shape weather_service returns (lower-case, cleaned) via its offline fallback."""
    ws = pytest.importorskip("backend.services.weather_service")
    from datetime import date, timedelta

    end = date(2024, 11, 15)
    start = end - timedelta(days=days - 1)
    return ws._clean(ws._fallback_weather(9.1728, 77.8710, start, end))


def test_feature_names_match_pipeline_constant():
    trained = _trained_features()
    assert trained == fe.MODEL_FEATURES, (
        "feature_names.json and ml.data.feature_engineering.MODEL_FEATURES differ; "
        "retrain with `python -m ml.training.train_model`"
    )
    assert len(trained) == len(set(trained)), "duplicate feature names"


@pytest.mark.parametrize("crop", fe.CROPS)
@pytest.mark.parametrize("source", ["nasa_raw", "live_fallback"])
def test_live_row_contains_exactly_trained_features(crop, source):
    trained = _trained_features()
    weather = _nasa_window() if source == "nasa_raw" else _live_like_window()

    row = fe.build_live_feature_row(weather, SOIL, crop, "Dryland")

    assert len(row) == 1
    assert set(trained).issubset(row.columns), f"missing: {sorted(set(trained) - set(row.columns))}"
    # The row also carries raw/intermediate columns (date, et0, ...) and informational
    # soil/zone columns; none of those are model inputs.
    assert INFORMATIONAL_COLUMNS.isdisjoint(trained)
    # Selecting by the trained list gives exactly the model input, in trained order.
    X = row[trained].astype(np.float64)
    assert list(X.columns) == trained
    assert np.isfinite(X.to_numpy()).all(), "non-finite live feature values"

    crop_cols = [c for c in trained if c.startswith("crop_")]
    assert X[crop_cols].to_numpy().sum() == 1.0
    assert X[f"crop_{crop.lower()}"].iloc[0] == 1.0


def test_short_history_and_unknown_crop_raise():
    weather = _nasa_window(10)
    with pytest.raises(fe.FeatureError):
        fe.build_live_feature_row(weather, SOIL, "Cotton", "Dryland")
    with pytest.raises(fe.FeatureError):
        fe.build_live_feature_row(_nasa_window(), SOIL, "Apple", "Dryland")


def test_model_input_matches_committed_artifacts():
    """inference_service.build_model_input selects exactly the trained columns and scales them."""
    pytest.importorskip("xgboost")
    pytest.importorskip("sklearn")
    pytest.importorskip("shap")
    inference = pytest.importorskip("backend.services.inference_service")

    trained = _trained_features()
    X_df, X_scaled = inference.build_model_input(_nasa_window(), SOIL, "Rice", "Delta")

    assert list(X_df.columns) == trained
    assert X_scaled.shape == (1, len(trained))
    model = inference.model_manager.model
    assert getattr(model, "n_features_in_", len(trained)) == len(trained)
    proba = model.predict_proba(X_scaled)[0]
    assert proba.shape == (3,) and abs(float(proba.sum()) - 1.0) < 1e-5
