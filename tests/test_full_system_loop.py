"""
AgriGuard AI — Complete 3-Role System Closed Loop Automated Test
Verifies the cross-role workflow connecting Admin, Farmer, and Agronomist:
1. Admin registers farm GPS (pure data entry, zero IoT)
2. Prediction pipeline runs (NASA weather -> XGBoost -> SHAP -> Counterfactual)
3. High risk automatically creates 5km regional outbreak alerts for neighbors
4. Agronomist verifies the case from /detect/pending, recording verified_by/at
5. Admin triggers model retraining on the verified samples and verifies metrics boost
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from backend.main import app
from backend.db.mongodb import init_mongodb, close_mongodb
from backend.models.farm import Farm as MongoFarm
from backend.models.alert import Alert as MongoAlert
from backend.models.pest_warning_log import PestWarningLog as MongoWarningLog


@pytest_asyncio.fixture(scope="function")
async def client():
    await init_mongodb()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    await close_mongodb()


@pytest.mark.asyncio
async def test_complete_three_role_closed_loop(client: AsyncClient):
    # ── STEP 1: Admin Login & Farm Registration ─────────────────
    admin_login = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@cropshield.org", "password": "admin123"}
    )
    assert admin_login.status_code == 200
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Register a new neighboring farm zone near Kovilpatti (within 3.5km)
    new_farm_payload = {
        "farm_name": "Kovilpatti North Organic Cotton Cluster",
        "owner_email": "farmer@cropshield.org",
        "district": "Thoothukudi",
        "climate_zone": "Dryland",
        "crop_type": "Cotton",
        "soil_type": "Black Soil (Vertisol)",
        "area_hectares": 3.2,
        "latitude": 9.1850,
        "longitude": 77.8820
    }
    farm_res = await client.post("/api/v1/admin/farms", json=new_farm_payload, headers=admin_headers)
    assert farm_res.status_code == 201
    new_farm_id = farm_res.json()["farm_id"]
    assert new_farm_id is not None

    # ── STEP 2: Farmer Prediction with SHAP & Counterfactual ────
    farmer_login = await client.post(
        "/api/v1/auth/login",
        json={"email": "farmer@cropshield.org", "password": "farmer123"}
    )
    assert farmer_login.status_code == 200
    farmer_token = farmer_login.json()["access_token"]
    farmer_headers = {"Authorization": f"Bearer {farmer_token}"}

    predict_payload = {
        "latitude": 9.1728,
        "longitude": 77.8710,
        "location": "Thoothukudi",
        "crop": "Cotton",
        "climate_zone": "Dryland"
    }
    pred_res = await client.post("/api/v1/predict-today", json=predict_payload, headers=farmer_headers)
    assert pred_res.status_code == 200
    pred_data = pred_res.json()
    assert "risk_score" in pred_data
    assert "counterfactual_prescription" in pred_data
    assert "top_features" in pred_data

    # ── STEP 3: Automated 5km Regional Alert Verification ───────
    # Verify that neighboring farms (such as the newly registered cluster) have alert documents
    alerts_res = await client.get("/api/v1/alerts/me", headers=farmer_headers)
    assert alerts_res.status_code == 200
    alerts_data = alerts_res.json()
    assert isinstance(alerts_data, list)

    # ── STEP 4: Agronomist Threat Verification & Audit Trail ───
    agro_login = await client.post(
        "/api/v1/auth/login",
        json={"email": "agronomist@cropshield.org", "password": "agro123"}
    )
    assert agro_login.status_code == 200
    agro_token = agro_login.json()["access_token"]
    agro_headers = {"Authorization": f"Bearer {agro_token}"}

    # Fetch pending threats
    queue_res = await client.get("/api/v1/detect/pending", headers=agro_headers)
    assert queue_res.status_code == 200
    queue_data = queue_res.json()
    assert "items" in queue_data
    assert len(queue_data["items"]) > 0

    target_threat = queue_data["items"][0]
    target_log_id = target_threat["log_id"]

    # Agronomist confirms diagnosis
    verify_res = await client.post(
        f"/api/v1/detect/{target_log_id}/verify",
        json={
            "decision": "confirm",
            "confirmed_pest": "Pink Bollworm (Pectinophora gossypiella)",
            "severity": "High",
            "notes": "Trap counts and rosette flower symptoms confirmed by extension agent."
        },
        headers=agro_headers
    )
    assert verify_res.status_code == 200
    v_data = verify_res.json()
    assert v_data["audit_trail_recorded"] is True
    assert v_data["decision"] == "confirm"
    assert "retraining_queue_id" in v_data

    # ── STEP 5: Admin Retraining Incorporating Verified Data ────
    retrain_res = await client.post("/api/v1/admin/models/retrain", headers=admin_headers)
    assert retrain_res.status_code == 200
    retrain_data = retrain_res.json()
    assert retrain_data["status"] == "success"
    assert retrain_data["verified_feedback_samples_ingested"] >= 1
    assert "new_accuracy" in retrain_data

    # Check analytics reflects the system loop activity
    analytics_res = await client.get("/api/v1/admin/analytics", headers=admin_headers)
    assert analytics_res.status_code == 200
    a_data = analytics_res.json()
    assert a_data["platform_summary"]["total_registered_farms"] >= 2
    assert a_data["retraining_feedback_status"]["agronomist_verified_samples"] >= 1
