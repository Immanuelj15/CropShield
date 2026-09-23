"""
AgriGuard AI — Automated Role-Based Authentication & Scope Verification Tests
Validates JWT RBAC, farmer self-service, agronomist verification, and admin controls.
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from backend.main import app
from backend.db.mongodb import init_mongodb, close_mongodb


@pytest_asyncio.fixture(scope="function")
async def client():
    await init_mongodb()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    await close_mongodb()



@pytest.mark.asyncio
async def test_farmer_login_and_scope(client: AsyncClient):
    # 1. Login as Farmer
    res = await client.post("/api/v1/auth/login", json={"email": "farmer@cropshield.org", "password": "farmer123"})
    assert res.status_code == 200
    data = res.json()
    token = data["access_token"]
    assert data["role"] == "farmer"
    assert data["user_id"] is not None

    headers = {"Authorization": f"Bearer {token}"}

    # 2. Access Farmer-scoped route -> Success
    farm_res = await client.get("/api/v1/farms/me", headers=headers)
    assert farm_res.status_code == 200
    assert "farm_name" in farm_res.json()

    # 3. Access Treatment Log -> Create and list
    t_res = await client.post("/api/v1/treatments", json={
        "treatment_date": "2026-09-09",
        "treatment_type": "organic",
        "product_name": "Neem Oil 2%",
        "target_pest": "Aphids",
        "dosage": "5 ml/L",
        "notes": "Test application"
    }, headers=headers)
    assert t_res.status_code == 201
    assert t_res.json()["status"] == "success"

    # 4. Attempt to access Admin-scoped route -> 403 Forbidden
    admin_res = await client.get("/api/v1/admin/users", headers=headers)
    assert admin_res.status_code == 403

    # 5. Attempt to access Agronomist verification queue -> 403 Forbidden
    agro_res = await client.get("/api/v1/detect/pending", headers=headers)
    assert agro_res.status_code == 403


@pytest.mark.asyncio
async def test_agronomist_verification_and_weather(client: AsyncClient):
    # 1. Login as Agronomist
    res = await client.post("/api/v1/auth/login", json={"email": "agronomist@cropshield.org", "password": "agro123"})
    assert res.status_code == 200
    data = res.json()
    token = data["access_token"]
    assert data["role"] == "agronomist"

    headers = {"Authorization": f"Bearer {token}"}

    # 2. Get pending verification queue -> Success
    pending_res = await client.get("/api/v1/detect/pending", headers=headers)
    assert pending_res.status_code == 200
    p_data = pending_res.json()
    assert "items" in p_data

    # 3. Verify / Confirm a threat case -> Success with audit trail
    verify_res = await client.post("/api/v1/detect/demo_threat_01/verify", json={
        "decision": "confirm",
        "confirmed_pest": "Pink Bollworm",
        "severity": "High",
        "notes": "Expert field confirmation in Thoothukudi."
    }, headers=headers)
    assert verify_res.status_code == 200
    v_data = verify_res.json()
    assert v_data["audit_trail_recorded"] is True
    assert "Dr. V. Sundaram" in v_data["verified_by"]

    # 4. Get regional report
    rep_res = await client.get("/api/v1/reports/regional?range=weekly", headers=headers)
    assert rep_res.status_code == 200
    assert "report_id" in rep_res.json()


@pytest.mark.asyncio
async def test_admin_pure_software_management(client: AsyncClient):
    # 1. Login as Admin
    res = await client.post("/api/v1/auth/login", json={"email": "admin@cropshield.org", "password": "admin123"})
    assert res.status_code == 200
    token = res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Check NASA POWER API health (pure software monitor)
    api_res = await client.get("/api/v1/admin/api-status", headers=headers)
    assert api_res.status_code == 200
    api_data = api_res.json()
    assert "NASA POWER" in api_data["external_service"]
    assert api_data["monitoring_mode"] == "Pure Software REST API (No Hardware / No IoT)"

    # 3. Register a farm zone with GPS coordinates (no sensors)
    farm_reg = await client.post("/api/v1/admin/farms", json={
        "farm_name": "Madurai Jasmine & Pulses Zone",
        "owner_email": "farmer@cropshield.org",
        "district": "Madurai",
        "climate_zone": "Dryland",
        "crop_type": "Pulses",
        "area_hectares": 3.0,
        "latitude": 9.9252,
        "longitude": 78.1198
    }, headers=headers)
    assert farm_reg.status_code == 201
    assert farm_reg.json()["farm_name"] == "Madurai Jasmine & Pulses Zone"

    # 4. Trigger model retraining pipeline
    retrain_res = await client.post("/api/v1/admin/models/retrain", headers=headers)
    assert retrain_res.status_code == 200
    assert retrain_res.json()["status"] == "success"
