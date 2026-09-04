"""
CropShield / AgriGuard — Phase 0 Automated Tests
Validates MongoDB connection, 8 collections, 2dsphere geo indexes, unique compound indexes,
and Beanie Document CRUD operations.
"""

import pytest
import pytest_asyncio
from beanie import PydanticObjectId
from backend.db.mongodb import init_mongodb, close_mongodb
from backend.models import (
    User,
    Farm,
    WeatherSnapshot,
    PestWarningLog,
    DiseaseDetection,
    RegionalRiskGrid,
    PestDiseaseAdvisory,
    Alert,
)


@pytest_asyncio.fixture(scope="function")
async def setup_db():
    db = await init_mongodb()
    yield db
    await close_mongodb()


@pytest.mark.asyncio
async def test_collections_exist(setup_db):
    db = setup_db
    collection_names = await db.list_collection_names()
    required = [
        "users",
        "farms",
        "weather_snapshots",
        "pest_warning_logs",
        "disease_detections",
        "regional_risk_grid",
        "pest_disease_advisories",
        "alerts",
    ]
    for col in required:
        assert col in collection_names, f"Collection '{col}' missing from MongoDB!"


@pytest.mark.asyncio
async def test_user_email_unique_index(setup_db):
    db = setup_db
    index_info = await db["users"].index_information()
    assert "email_1" in index_info, "Index email_1 missing on users!"
    assert index_info["email_1"].get("unique") is True, "email_1 index must be unique!"


@pytest.mark.asyncio
async def test_farm_2dsphere_index(setup_db):
    db = setup_db
    index_info = await db["farms"].index_information()
    assert "farm_location_2dsphere" in index_info, "2dsphere index missing on farms.location!"
    key_types = [k[1] for k in index_info["farm_location_2dsphere"]["key"]]
    assert "2dsphere" in key_types, "farm_location_2dsphere index must be of type 2dsphere!"


@pytest.mark.asyncio
async def test_weather_compound_unique_index(setup_db):
    db = setup_db
    index_info = await db["weather_snapshots"].index_information()
    assert "weather_farm_date_unique_idx" in index_info, "Compound index missing on weather_snapshots!"
    assert index_info["weather_farm_date_unique_idx"].get("unique") is True


@pytest.mark.asyncio
async def test_geospatial_query_on_farms(setup_db):
    db = setup_db
    # Query farms near Kovilpatti (lon 77.8710, lat 9.1728) within 10 km (10,000 meters)
    cursor = db["farms"].find({
        "location": {
            "$nearSphere": {
                "$geometry": {
                    "type": "Point",
                    "coordinates": [77.8710, 9.1728]
                },
                "$maxDistance": 10000
            }
        }
    })
    farms_near = await cursor.to_list(length=10)
    assert len(farms_near) >= 2, "Geospatial 2dsphere query failed to locate clustered farms!"


@pytest.mark.asyncio
async def test_beanie_crud_and_validation(setup_db):
    # Test inserting a test alert and reading it back
    test_farm_id = PydanticObjectId()
    alert = Alert(
        farm_id=test_farm_id,
        type="high_risk",
        message="Test pest risk warning from Phase 0 validation",
        read=False,
    )
    await alert.insert()
    assert alert.id is not None

    fetched = await Alert.get(alert.id)
    assert fetched is not None
    assert fetched.message == "Test pest risk warning from Phase 0 validation"

    # Cleanup test alert
    await fetched.delete()
    assert await Alert.get(alert.id) is None
