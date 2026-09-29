"""
AgriGuard AI — Automated Daily Ingestion Pipeline Tests
Tests 38-district centroid seeding, trailing-window weather upsert,
JobRunLog persistence, RetryQueue processing, and Admin trigger endpoints.
Uses the isolated test database (skips without MongoDB). Tests that fetch NASA POWER for
every farm are marked `network` and only run with CROPSHIELD_TEST_NETWORK=1.
"""

import pytest
from httpx import AsyncClient

from conftest import DEMO_ADMIN, DEMO_FARMER, login_headers

pytestmark = pytest.mark.mongo


@pytest.mark.asyncio
async def test_seed_38_districts_idempotency(mongo_db):
    from backend.models.farm import Farm as MongoFarm
    from scripts.seed_districts import seed_tamil_nadu_districts

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


@pytest.mark.network
@pytest.mark.asyncio
async def test_process_single_farm_ingestion(mongo_db):
    from backend.jobs.daily_ingestion_job import process_single_farm_ingestion
    from backend.models.farm import Farm as MongoFarm
    from backend.models.pest_warning_log import PestWarningLog as MongoWarningLog
    from backend.models.weather_snapshot import WeatherSnapshot as MongoWeatherSnapshot
    from scripts.seed_districts import seed_tamil_nadu_districts

    await seed_tamil_nadu_districts()
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
async def test_run_ingestion_now_is_admin_only(client: AsyncClient):
    farmer = await login_headers(client, *DEMO_FARMER)
    assert (await client.post("/api/v1/admin/jobs/run-ingestion-now", headers=farmer)).status_code == 403
    assert (await client.post("/api/v1/admin/jobs/run-ingestion-now")).status_code == 401


@pytest.mark.network
@pytest.mark.asyncio
async def test_admin_api_status_and_run_now(client: AsyncClient):
    from scripts.seed_districts import seed_tamil_nadu_districts

    await seed_tamil_nadu_districts()
    admin_headers = await login_headers(client, *DEMO_ADMIN)

    # Admin calls run-ingestion-now -> 200 OK (409 if another run holds the lock)
    res_run = await client.post("/api/v1/admin/jobs/run-ingestion-now", headers=admin_headers)
    assert res_run.status_code == 200, res_run.text
    data = res_run.json()
    assert data["status"] == "success"
    assert "report" in data
    assert data["report"]["farms_processed"] >= 38

    res_status = await client.get("/api/v1/admin/api-status", headers=admin_headers)
    assert res_status.status_code == 200
    status_data = res_status.json()
    assert status_data["last_job_run"] is not None
    assert status_data["last_job_run"]["farms_processed"] >= 38
    assert status_data["last_job_run"]["status"] in ["success", "partial_failure"]
