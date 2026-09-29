"""
CropShield / AgriGuard — MongoDB initialisation tests (isolated test database).
Validates collections, 2dsphere and compound unique indexes (including the dedupe indexes
added for P1-3 / P1-6), and Beanie CRUD. Skips when MongoDB is unreachable.
"""
import pytest
from beanie import PydanticObjectId

from conftest import TEST_DB_NAME

pytestmark = pytest.mark.mongo


@pytest.mark.asyncio
async def test_uses_isolated_test_database(mongo_db):
    assert mongo_db.name == TEST_DB_NAME
    assert mongo_db.name != "cropshield_db"


@pytest.mark.asyncio
async def test_collections_exist(mongo_db):
    collection_names = await mongo_db.list_collection_names()
    for col in ["users", "farms", "weather_snapshots", "pest_warning_logs", "disease_detections",
                "regional_risk_grid", "pest_disease_advisories", "alerts"]:
        assert col in collection_names, f"Collection '{col}' missing from MongoDB!"


@pytest.mark.asyncio
async def test_user_email_unique_index(mongo_db):
    index_info = await mongo_db["users"].index_information()
    assert "email_1" in index_info
    assert index_info["email_1"].get("unique") is True


@pytest.mark.asyncio
async def test_farm_2dsphere_index(mongo_db):
    index_info = await mongo_db["farms"].index_information()
    assert "farm_location_2dsphere" in index_info
    key_types = [k[1] for k in index_info["farm_location_2dsphere"]["key"]]
    assert "2dsphere" in key_types


@pytest.mark.asyncio
async def test_weather_compound_unique_index(mongo_db):
    index_info = await mongo_db["weather_snapshots"].index_information()
    assert "weather_farm_date_unique_idx" in index_info
    assert index_info["weather_farm_date_unique_idx"].get("unique") is True


@pytest.mark.asyncio
@pytest.mark.parametrize("collection,index_name", [
    ("alerts", "alert_origin_target_date_type_unique_idx"),
    ("pest_warning_logs", "pest_log_farm_date_source_unique_idx"),
    ("retry_queue", "retry_queue_one_pending_per_farm_idx"),
])
async def test_dedupe_unique_indexes(mongo_db, collection, index_name):
    index_info = await mongo_db[collection].index_information()
    assert index_name in index_info, f"{index_name} missing on {collection}"
    assert index_info[index_name].get("unique") is True
    assert "partialFilterExpression" in index_info[index_name]


@pytest.mark.asyncio
async def test_geospatial_query_on_farms(mongo_db):
    # Seeded demo farms: Kovilpatti + Kayathar (~2.5 km apart)
    cursor = mongo_db["farms"].find({
        "location": {"$nearSphere": {"$geometry": {"type": "Point", "coordinates": [77.8710, 9.1728]},
                                     "$maxDistance": 10000}}
    })
    farms_near = await cursor.to_list(length=10)
    assert len(farms_near) >= 2


@pytest.mark.asyncio
async def test_pest_warning_log_upsert_is_idempotent(mongo_db):
    from backend.models.pest_warning_log import PestWarningLog, upsert_pest_warning_log

    farm_id = PydanticObjectId()
    fields = {"crop_type": "Cotton", "risk_score": 0.4, "risk_level": "Medium"}
    first = await upsert_pest_warning_log(farm_id=farm_id, date="2026-09-01", source="test", fields=fields)
    second = await upsert_pest_warning_log(farm_id=farm_id, date="2026-09-01", source="test",
                                           fields={**fields, "risk_score": 0.7, "risk_level": "High"})
    assert first["status"] == "inserted"
    assert second["status"] == "updated"
    rows = await PestWarningLog.find({"farm_id": farm_id}).to_list()
    assert len(rows) == 1 and rows[0].risk_level == "High"


@pytest.mark.asyncio
async def test_beanie_crud_and_validation(mongo_db):
    from backend.models import Alert

    alert = Alert(farm_id=PydanticObjectId(), type="high_risk",
                  message="Test pest risk warning from Phase 0 validation", read=False)
    await alert.insert()
    assert alert.id is not None

    fetched = await Alert.get(alert.id)
    assert fetched is not None
    assert fetched.message == "Test pest risk warning from Phase 0 validation"

    await fetched.delete()
    assert await Alert.get(alert.id) is None
