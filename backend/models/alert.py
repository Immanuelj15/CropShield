"""
CropShield / AgriGuard — Alert Beanie Document Model
Notifications dispatched to farmers and local communities
"""
from datetime import datetime
from typing import Optional
from beanie import Document, PydanticObjectId
from pymongo import IndexModel, ASCENDING, DESCENDING
from pydantic import Field


class Alert(Document):
    farm_id: PydanticObjectId
    type: str  # "high_risk" | "regional_outbreak" | "verification_needed"
    message: str
    read: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    # Dedupe key for regional (5km) alerts: one alert per (origin farm, neighbour farm, IST date, type).
    # Optional so legacy documents without these fields stay valid and are excluded from the unique index.
    origin_farm_id: Optional[PydanticObjectId] = None
    alert_date: Optional[str] = None  # "YYYY-MM-DD" (Asia/Kolkata)

    class Settings:
        name = "alerts"
        indexes = [
            IndexModel([("farm_id", ASCENDING)], name="alert_farm_id_idx"),
            IndexModel([("farm_id", ASCENDING), ("read", ASCENDING)], name="alert_farm_read_idx"),
            IndexModel([("type", ASCENDING)], name="alert_type_idx"),
            IndexModel([("created_at", DESCENDING)], name="alert_created_at_idx"),
            IndexModel(
                [("origin_farm_id", ASCENDING), ("farm_id", ASCENDING), ("alert_date", ASCENDING), ("type", ASCENDING)],
                unique=True,
                name="alert_origin_target_date_type_unique_idx",
                partialFilterExpression={
                    "origin_farm_id": {"$type": "objectId"},
                    "alert_date": {"$type": "string"},
                },
            ),
        ]
