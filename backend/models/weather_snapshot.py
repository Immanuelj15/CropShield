"""
CropShield / AgriGuard — Weather Snapshot Beanie Document Model
Stores embedded raw + engineered climate data for ML feature building
"""
from datetime import datetime
from typing import Dict, Any
from beanie import Document, PydanticObjectId
from pymongo import IndexModel, ASCENDING
from pydantic import Field


class WeatherSnapshot(Document):
    farm_id: PydanticObjectId
    date: str  # Format: "YYYY-MM-DD"
    source: str = "NASA_POWER"
    raw: Dict[str, Any] = Field(default_factory=dict)
    engineered: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "weather_snapshots"
        indexes = [
            IndexModel(
                [("farm_id", ASCENDING), ("date", ASCENDING)],
                unique=True,
                name="weather_farm_date_unique_idx",
            ),
            IndexModel([("farm_id", ASCENDING)], name="weather_farm_id_idx"),
            IndexModel([("date", ASCENDING)], name="weather_date_idx"),
        ]
