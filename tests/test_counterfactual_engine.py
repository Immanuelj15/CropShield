"""
AgriGuard AI — Automated Counterfactual Engine & Tree-SHAP Integration Tests
Validates non-differentiable counterfactual optimization, mutable parameter deltas,
and end-to-end /predict-today composite response structure (auth required, data_quality flag).
The endpoint test uses the isolated test database and skips when MongoDB is unreachable.
It calls NASA POWER; offline it falls back to synthetic weather, which is flagged and never alerts.
"""
import pytest
from httpx import AsyncClient

from backend.services.counterfactual_service import generate_counterfactual_prescription
from conftest import DEMO_FARMER, login_headers


def test_counterfactual_service_logic():
    """Verify counterfactual optimization service produces valid minimal physical deltas."""
    current_features = {
        "temperature_c": 33.5,
        "humidity_pct": 82.0,
        "vapor_pressure_deficit_kpa": 0.85,
        "consecutive_wet_days": 4,
        "consecutive_dry_days": 0,
        "rain_rolling_7d_mm": 65.0,
    }

    prescription = generate_counterfactual_prescription(
        crop="Cotton",
        risk_score=0.78,
        risk_level="High",
        weather_snapshot=current_features
    )

    assert prescription is not None
    assert prescription["target_risk_level"] in ["Low", "Medium"]
    assert prescription["target_risk_score"] < 0.78
    assert "delta_summary" in prescription
    assert len(prescription["mutable_deltas"]) > 0
    assert len(prescription["actionable_steps"]) > 0
    assert prescription["confidence"] >= 0.85

    # Confirm delta parameters belong to valid agronomic domain
    for delta in prescription["mutable_deltas"]:
        assert "parameter" in delta
        assert "current_value" in delta
        assert "target_value" in delta
        assert "delta" in delta


@pytest.mark.mongo
@pytest.mark.asyncio
async def test_predict_today_endpoint_counterfactual(client: AsyncClient):
    """Verify POST /api/v1/predict-today delivers SHAP + counterfactual prescription."""
    payload_anon = {"crop": "Cotton"}
    assert (await client.post("/api/v1/predict-today", json=payload_anon)).status_code == 401

    headers = await login_headers(client, *DEMO_FARMER)

    payload = {
        "latitude": 9.1728,
        "longitude": 77.8710,
        "location": "Kovilpatti",
        "crop": "Cotton",
        "climate_zone": "Dryland"
    }

    res = await client.post("/api/v1/predict-today", json=payload, headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()

    # Core risk metrics
    assert "risk_score" in data
    assert "risk_level" in data
    assert 0.0 <= data["risk_score"] <= 1.0
    assert data["risk_level"] in ["Low", "Medium", "High"]

    # Tree-SHAP explainability
    assert "top_features" in data
    assert len(data["top_features"]) > 0
    assert "shap_interpretation" in data

    # Counterfactual prescription object (Hero Feature)
    assert "counterfactual_prescription" in data
    prescription = data["counterfactual_prescription"]
    assert "target_risk_score" in prescription
    assert "mutable_deltas" in prescription
    assert "actionable_steps" in prescription

    # Pure-software compliance check (Zero IoT/hardware fields)
    assert "sensor_id" not in data
    assert "device_id" not in data
    assert "hardware_status" not in data

    # Contract item 8: weather provenance is always reported
    dq = data["data_quality"]
    assert dq["weather_source"] in ("NASA_POWER", "synthetic")
    assert dq["is_synthetic"] is (dq["weather_source"] == "synthetic")
