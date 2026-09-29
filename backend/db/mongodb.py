"""
CropShield / AgriGuard — MongoDB & Beanie Connection Manager
"""
import logging
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from backend.utils.config import settings
from backend.models import DOCUMENT_MODELS

logger = logging.getLogger("cropshield.mongodb")

motor_client: Optional[AsyncIOMotorClient] = None


async def _pre_index_migrations(db) -> None:
    """
    Cleans legacy data that would make newly added unique indexes fail to build
    (init_beanie raises if an index cannot be created, which would take the whole app down).
    - retry_queue: keep only the newest `pending` item per farm; older duplicates -> "abandoned".
    Alerts / pest_warning_logs unique indexes are partial on new fields, so legacy docs are excluded.
    """
    try:
        coll = db["retry_queue"]
        pipeline = [
            {"$match": {"status": "pending"}},
            {"$sort": {"created_at": -1}},
            {"$group": {"_id": "$farm_id", "ids": {"$push": "$_id"}, "n": {"$sum": 1}}},
            {"$match": {"n": {"$gt": 1}}},
        ]
        abandoned = 0
        async for grp in coll.aggregate(pipeline):
            stale_ids = grp["ids"][1:]
            res = await coll.update_many(
                {"_id": {"$in": stale_ids}},
                {"$set": {"status": "abandoned", "error_message": "Superseded duplicate pending retry item"}},
            )
            abandoned += res.modified_count
        if abandoned:
            logger.info("Pre-index migration: abandoned %d duplicate pending retry_queue items.", abandoned)
    except Exception as e:
        logger.warning("Pre-index migration for retry_queue failed: %s", e)


async def init_mongodb(mongodb_url: Optional[str] = None, db_name: Optional[str] = None):
    """
    Initializes Motor Async client and Beanie ODM with all Document models.
    Automatically ensures all collection indexes (including 2dsphere and compound unique) are created.
    """
    global motor_client
    url = mongodb_url or settings.MONGODB_URL
    name = db_name or settings.MONGODB_DB_NAME
    logger.info("Connecting to MongoDB at %s (database: %s)", url, name)
    motor_client = AsyncIOMotorClient(url)
    # Compatibility shim: PyMongo 4.14+ added append_metadata which Motor delegates dynamically as a Database
    if hasattr(motor_client, "delegate") and hasattr(motor_client.delegate, "append_metadata"):
        motor_client.append_metadata = motor_client.delegate.append_metadata
    db = motor_client[name]
    await _pre_index_migrations(db)
    await init_beanie(database=db, document_models=DOCUMENT_MODELS)
    logger.info("MongoDB & Beanie initialized successfully with all document models.")
    
    # Auto-seed crop suitability rules and cost templates from CSV if empty
    try:
        from backend.db.seed_crop_recommendation_data import seed_crop_recommendation_data
        await seed_crop_recommendation_data()
    except Exception as e:
        logger.warning("Could not auto-seed crop recommendation data: %s", e)

    # Auto-seed FAO-56 crop water coefficients and ICAR/TNAU nutrient requirements
    try:
        from backend.db.seed_agronomic_planner_data import seed_agronomic_planner_data
        await seed_agronomic_planner_data()
    except Exception as e:
        logger.warning("Could not auto-seed agronomic planner data: %s", e)

    return db


async def close_mongodb():
    """Closes the active Motor client connection pool."""
    global motor_client
    if motor_client is not None:
        motor_client.close()
        motor_client = None
        logger.info("MongoDB connection pool closed.")
