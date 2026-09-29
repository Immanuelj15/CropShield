"""
AgriGuard AI — Complete 3-Role System Closed Loop Test (isolated test database)
1. Admin registers a farm for the demo farmer (pure data entry, zero IoT)
2. Farmer runs the prediction pipeline (NASA weather -> XGBoost -> SHAP -> counterfactual);
   the response reports whether the weather was real or synthetic
3. A real unverified PestWarningLog is verified by the agronomist (404 for demo ids,
   409 on a second verification)
4. Admin "retraining" is explicitly simulated and makes no accuracy claim
Skips when MongoDB is unreachable. /predict-today calls NASA POWER; offline it falls back
to synthetic weather (flagged, and no neighbour alerts are dispatched).
"""
import uuid
from datetime import date

import pytest
from httpx import AsyncClient

from conftest import DEMO_ADMIN, DEMO_AGRONOMIST, DEMO_FARMER, login_headers

pytestmark = pytest.mark.mongo


@pytest.mark.asyncio
async def test_complete_three_role_closed_loop(client: AsyncClient):
    from beanie import PydanticObjectId
    from backend.models.pest_warning_log import upsert_pest_warning_log

    # ── STEP 1: Admin registers a farm for the farmer ───────────
    admin_headers = await login_headers(client, *DEMO_ADMIN)
    farm_res = await client.post("/api/v1/admin/farms", json={
        "farm_name": f"Kovilpatti North Organic Cotton Cluster {uuid.uuid4().hex[:4]}",
        "owner_email": DEMO_FARMER[0],
        "district": "Thoothukudi",
        "climate_zone": "Dryland",
        "crop_type": "Cotton",
        "soil_type": "Black Soil (Vertisol)",
        "area_hectares": 3.2,
        "latitude": 9.1850,
        "longitude": 77.8820
    }, headers=admin_headers)
    assert farm_res.status_code == 201, farm_res.text
    new_farm_id = farm_res.json()["farm_id"]

    # ── STEP 2: Farmer prediction with SHAP & counterfactual ────
    farmer_headers = await login_headers(client, *DEMO_FARMER)
    pred_res = await client.post("/api/v1/predict-today", json={
        "latitude": 9.1728, "longitude": 77.8710, "location": "Thoothukudi",
        "crop": "Cotton", "climate_zone": "Dryland", "farm_id": new_farm_id,
    }, headers=farmer_headers)
    assert pred_res.status_code == 200, pred_res.text
    pred_data = pred_res.json()
    assert "risk_score" in pred_data
    assert "counterfactual_prescription" in pred_data
    assert "top_features" in pred_data
    assert pred_data["data_quality"]["weather_source"] in ("NASA_POWER", "synthetic")

    alerts_res = await client.get("/api/v1/alerts/me", headers=farmer_headers)
    assert alerts_res.status_code == 200
    assert isinstance(alerts_res.json(), list)

    # ── STEP 3: Agronomist verifies a real case ─────────────────
    log = await upsert_pest_warning_log(
        farm_id=PydanticObjectId(new_farm_id), date=date.today().isoformat(), source="test_loop",
        fields={"crop_type": "Cotton", "risk_score": 0.82, "risk_level": "High",
                "detected_pests": [{"pest_name": "Pink Bollworm", "confidence": 0.8}]},
    )
    log_id = str(log["id"])

    agro_headers = await login_headers(client, *DEMO_AGRONOMIST)
    queue = (await client.get("/api/v1/detect/pending", headers=agro_headers)).json()
    assert queue["simulated"] is False
    assert log_id in {item["log_id"] for item in queue["items"]}

    verify_body = {
        "decision": "confirm",
        "confirmed_pest": "Pink Bollworm (Pectinophora gossypiella)",
        "severity": "High",
        "notes": "Trap counts and rosette flower symptoms confirmed by extension agent."
    }
    farmer_try = await client.post(f"/api/v1/detect/{log_id}/verify", json=verify_body, headers=farmer_headers)
    assert farmer_try.status_code == 403

    verify_res = await client.post(f"/api/v1/detect/{log_id}/verify", json=verify_body, headers=agro_headers)
    assert verify_res.status_code == 200, verify_res.text
    v_data = verify_res.json()
    assert v_data["audit_trail_recorded"] is True
    assert v_data["decision"] == "confirm"
    assert "retraining_queue_id" in v_data

    again = await client.post(f"/api/v1/detect/{log_id}/verify", json=verify_body, headers=agro_headers)
    assert again.status_code == 409
    unknown = await client.post("/api/v1/detect/0123456789abcdef01234567/verify", json=verify_body, headers=agro_headers)
    assert unknown.status_code == 404

    # ── STEP 4: Admin retraining is simulated ───────────────────
    retrain = await client.post("/api/v1/admin/models/retrain", headers=admin_headers)
    assert retrain.status_code == 200
    r = retrain.json()
    assert r["status"] == "simulated" and r["simulated"] is True
    assert r["new_accuracy"] is None
    assert r["verified_feedback_samples_available"] >= 1

    analytics = await client.get("/api/v1/admin/analytics", headers=admin_headers)
    assert analytics.status_code == 200
    a_data = analytics.json()
    assert a_data["simulated"] is True
    assert a_data["platform_summary"]["total_registered_farms"] >= 2
    assert a_data["retraining_feedback_status"]["agronomist_verified_samples"] >= 1
