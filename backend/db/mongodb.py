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
    await init_beanie(database=db, document_models=DOCUMENT_MODELS)
    logger.info("MongoDB & Beanie initialized successfully with all document models.")
    
    # Auto-seed crop suitability rules and cost templates from CSV if empty
    try:
        from backend.db.seed_crop_recommendation_data import seed_crop_recommendation_data
        await seed_crop_recommendation_data()
    except Exception as e:
        logger.warning("Could not auto-seed crop recommendation data: %s", e)

    return db


async def close_mongodb():
    """Closes the active Motor client connection pool."""
    global motor_client
    if motor_client is not None:
        motor_client.close()
        motor_client = None
        logger.info("MongoDB connection pool closed.")
