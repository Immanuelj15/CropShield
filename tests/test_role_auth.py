"""
AgriGuard AI — Role-Based Authentication & Scope Verification Tests
JWT RBAC, register hardening (role ignored, min length), /auth/me from token, login by email
only, legacy password-hash upgrade, agronomist verification and admin controls.
Runs against the isolated test database (see conftest.py); skips when MongoDB is unreachable.
"""
import hashlib
import uuid

import pytest
from httpx import AsyncClient

from conftest import DEMO_ADMIN, DEMO_AGRONOMIST, DEMO_FARMER, login_headers, register_farmer

pytestmark = pytest.mark.mongo


# ── Register / login / me ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_register_with_admin_role_creates_farmer(client: AsyncClient):
    headers, data = await register_farmer(client, "Role Escalation", role="admin")
    assert data["role"] == "farmer"

    me = await client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["role"] == "farmer"

    from backend.models.user import User
    stored = await User.find_one({"email": data["username"]})
    assert stored is not None and stored.role == "farmer"

    # ...and it really has no admin rights
    assert (await client.get("/api/v1/admin/users", headers=headers)).status_code == 403


@pytest.mark.asyncio
async def test_register_rejects_short_password(client: AsyncClient):
    res = await client.post("/api/v1/auth/register", json={
        "username": "shorty", "email": f"short.{uuid.uuid4().hex[:6]}@example.com", "password": "abc123",
    })
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_auth_me_requires_token_and_returns_token_user(client: AsyncClient):
    assert (await client.get("/api/v1/auth/me")).status_code == 401
    # the old ?username= lookup must not leak another profile
    assert (await client.get("/api/v1/auth/me", params={"username": DEMO_ADMIN[0]})).status_code == 401
    bad = await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert bad.status_code == 401

    headers = await login_headers(client, *DEMO_FARMER)
    me = await client.get("/api/v1/auth/me", params={"username": DEMO_ADMIN[0]}, headers=headers)
    assert me.status_code == 200
    assert me.json()["email"] == DEMO_FARMER[0]
    assert me.json()["role"] == "farmer"


@pytest.mark.asyncio
async def test_login_is_by_email_only(client: AsyncClient):
    res = await client.post("/api/v1/auth/login", json={"username": "Ramanathan Farmer", "password": DEMO_FARMER[1]})
    assert res.status_code in (400, 401)
    wrong = await client.post("/api/v1/auth/login", json={"email": DEMO_FARMER[0], "password": "wrong-password"})
    assert wrong.status_code == 401


@pytest.mark.asyncio
async def test_legacy_sha256_hash_logs_in_and_is_upgraded(client: AsyncClient):
    from backend.models.user import User

    email = f"legacy.{uuid.uuid4().hex[:8]}@example.com"
    password = "legacy-pass-123"
    legacy_hash = hashlib.sha256((password + "agriguard_salt_tn").encode("utf-8")).hexdigest()
    await User(name="Legacy User", email=email, password_hash=legacy_hash, role="farmer", is_active=True).insert()

    res = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text

    stored = await User.find_one({"email": email})
    assert stored.password_hash != legacy_hash
    assert stored.password_hash.startswith(("$2a$", "$2b$", "$2y$", "pbkdf2_sha256$"))

    # the upgraded hash still works
    again = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert again.status_code == 200


# ── Role scopes ───────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_farmer_login_and_scope(client: AsyncClient):
    res = await client.post("/api/v1/auth/login", json={"email": DEMO_FARMER[0], "password": DEMO_FARMER[1]})
    assert res.status_code == 200
    data = res.json()
    assert data["role"] == "farmer"
    assert data["user_id"] is not None
    headers = {"Authorization": f"Bearer {data['access_token']}"}

    farm_res = await client.get("/api/v1/farms/me", headers=headers)
    assert farm_res.status_code == 200
    assert "farm_name" in farm_res.json()

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

    assert (await client.get("/api/v1/admin/users", headers=headers)).status_code == 403
    assert (await client.get("/api/v1/detect/pending", headers=headers)).status_code == 403
    assert (await client.post("/api/v1/admin/jobs/run-ingestion-now", headers=headers)).status_code == 403
    assert (await client.post("/api/v1/activity-planner/run-reminders-now", headers=headers)).status_code == 403


@pytest.mark.asyncio
async def test_farmer_without_farm_gets_no_fallback(client: AsyncClient):
    headers, _ = await register_farmer(client, "No Farm")
    assert (await client.get("/api/v1/farms", headers=headers)).json() == []
    assert (await client.get("/api/v1/farms/me", headers=headers)).status_code == 404
    profile = await client.get("/api/v1/farmer/profile", headers=headers)
    assert profile.status_code == 200
    assert profile.json()["farm"] is None


@pytest.mark.asyncio
async def test_agronomist_verification_and_reports(client: AsyncClient):
    headers = await login_headers(client, *DEMO_AGRONOMIST)

    pending_res = await client.get("/api/v1/detect/pending", headers=headers)
    assert pending_res.status_code == 200
    assert "items" in pending_res.json()

    # Demo / unknown ids no longer "succeed": 404
    demo = await client.post("/api/v1/detect/demo_threat_01/verify", json={
        "decision": "confirm", "confirmed_pest": "Pink Bollworm", "severity": "High", "notes": "demo",
    }, headers=headers)
    assert demo.status_code == 404

    rep_res = await client.get("/api/v1/reports/regional?range=weekly", headers=headers)
    assert rep_res.status_code == 200
    assert "report_id" in rep_res.json()
    assert rep_res.json()["simulated"] is True


@pytest.mark.asyncio
async def test_admin_software_management(client: AsyncClient):
    headers = await login_headers(client, *DEMO_ADMIN)

    api_res = await client.get("/api/v1/admin/api-status", headers=headers)
    assert api_res.status_code == 200
    assert "NASA POWER" in api_res.json()["external_service"]

    farm_reg = await client.post("/api/v1/admin/farms", json={
        "farm_name": f"Madurai Jasmine & Pulses Zone {uuid.uuid4().hex[:4]}",
        "owner_email": DEMO_FARMER[0],
        "district": "Madurai",
        "climate_zone": "Dryland",
        "crop_type": "Pulses",
        "area_hectares": 3.0,
        "latitude": 9.9252,
        "longitude": 78.1198
    }, headers=headers)
    assert farm_reg.status_code == 201

    # Retraining is explicitly simulated: no accuracy claim
    retrain = await client.post("/api/v1/admin/models/retrain", headers=headers)
    assert retrain.status_code == 200
    body = retrain.json()
    assert body["status"] == "simulated"
    assert body["simulated"] is True
    assert body["new_accuracy"] is None

    thresholds = await client.get("/api/v1/admin/thresholds", headers=headers)
    assert thresholds.status_code == 200
    t = thresholds.json()
    assert 0 < t["low_max"] < t["medium_max"] <= 100
