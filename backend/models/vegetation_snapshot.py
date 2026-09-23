"""
CropShield / AgriGuard — Vegetation Snapshot Beanie Document Model
Stores Sentinel-2 satellite NDVI observations and vegetation health indices
"""
from datetime import datetime
from typing import Optional
from beanie import Document, PydanticObjectId
from pymongo import IndexModel, ASCENDING, DESCENDING
from pydantic import Field


class VegetationSnapshot(Document):
    farm_id: PydanticObjectId
    date: str  # Format: "YYYY-MM-DD"
    ndvi_value: float  # Range: -1.0 to 1.0
    ndvi_trend: Optional[float] = None  # Delta vs previous stored reading
    cloud_cover_pct: float = 0.0  # Quality indicator
    source: str = "sentinel2"
    image_date_actual: str  # Actual satellite pass timestamp date
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "vegetation_snapshots"
        indexes = [
            IndexModel(
                [("farm_id", ASCENDING), ("date", ASCENDING)],
                unique=True,
                name="vegetation_farm_date_unique_idx",
            ),
            IndexModel([("farm_id", ASCENDING)], name="vegetation_farm_id_idx"),
            IndexModel([("date", DESCENDING)], name="vegetation_date_idx"),
            IndexModel([("created_at", DESCENDING)], name="vegetation_created_at_idx"),
        ]
