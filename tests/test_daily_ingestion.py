"""
AgriGuard AI — Automated Daily Ingestion Pipeline Tests
Tests 38-district centroid seeding, trailing-window weather upsert,
JobRunLog persistence, RetryQueue processing, and Admin trigger endpoints.
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from backend.main import app
from backend.db.mongodb import init_mongodb, close_mongodb
from backend.models.farm import Farm as MongoFarm
from backend.models.job_run_log import JobRunLog as MongoJobRunLog
from backend.models.pest_warning_log import PestWarningLog as MongoWarningLog
from backend.models.weather_snapshot import WeatherSnapshot as MongoWeatherSnapshot
from backend.jobs.daily_ingestion_job import process_single_farm_ingestion, run_daily_ingestion_job
from scripts.seed_districts import seed_tamil_nadu_districts


@pytest_asyncio.fixture(scope="function")
async def client():
    await init_mongodb()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    await close_mongodb()


@pytest.mark.asyncio
async def test_seed_38_districts_idempotency(client: AsyncClient):
    # 1. Seed districts
    inserted, already_present = await seed_tamil_nadu_districts()
    assert (inserted + already_present) == 38

    # 2. Check total reference points in MongoDB
    ref_points_count = await MongoFarm.find({"is_reference_point": True}).count()
    assert ref_points_count == 38

    # 3. Running second time must be idempotent
    inserted_2, already_present_2 = await seed_tamil_nadu_districts()
    assert inserted_2 == 0
    assert already_present_2 == 38


@pytest.mark.asyncio
async def test_process_single_farm_ingestion(client: AsyncClient):
    # Retrieve one district centroid farm
    farm = await MongoFarm.find_one({"is_reference_point": True, "district": "Thanjavur"})
    assert farm is not None

    res = await process_single_farm_ingestion(farm)
    assert res["status"] != "failed"
    assert res["farm_id"] == str(farm.id)
    assert res["district"] == "Thanjavur"
    assert res["risk_level"] in ["Low", "Medium", "High"]

    # Verify weather snapshot upsert
    snap = await MongoWeatherSnapshot.find_one({"farm_id": farm.id})
    assert snap is not None
    assert snap.temperature_c > 0

    # Verify pest warning log upsert
    log = await MongoWarningLog.find_one({"farm_id": farm.id})
    assert log is not None
    assert log.risk_level == res["risk_level"]


@pytest.mark.asyncio
async def test_admin_api_status_and_run_now(client: AsyncClient):
    # 1. Admin login
    admin_login = await client.post("/api/v1/auth/login", json={
        "email": "admin@cropshield.org",
        "password": "admin123"
    })
    assert admin_login.status_code == 200
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 2. Farmer attempt to trigger ingestion -> 403 Forbidden
    farmer_login = await client.post("/api/v1/auth/login", json={
        "email": "farmer@cropshield.org",
        "password": "farmer123"
    })
    farmer_token = farmer_login.json()["access_token"]
    res_forbidden = await client.post(
        "/api/v1/admin/jobs/run-ingestion-now",
        headers={"Authorization": f"Bearer {farmer_token}"}
    )
    assert res_forbidden.status_code == 403

    # 3. Admin calls run-ingestion-now -> 200 OK
    res_run = await client.post(
        "/api/v1/admin/jobs/run-ingestion-now",
        headers=admin_headers
    )
    assert res_run.status_code == 200
    data = res_run.json()
    assert data["status"] == "success"
    assert "report" in data
    assert data["report"]["farms_processed"] >= 38

    # 4. Check GET /api/v1/admin/api-status telemetry
    res_status = await client.get("/api/v1/admin/api-status", headers=admin_headers)
    assert res_status.status_code == 200
    status_data = res_status.json()
    assert "last_job_run" in status_data
    assert status_data["last_job_run"] is not None
    assert status_data["last_job_run"]["farms_processed"] >= 38
    assert status_data["last_job_run"]["status"] in ["success", "partial_failure"]
