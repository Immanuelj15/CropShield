"""
CropShield / AgriGuard — Alert Beanie Document Model
Notifications dispatched to farmers and local communities
"""
from datetime import datetime
from beanie import Document, PydanticObjectId
from pymongo import IndexModel, ASCENDING, DESCENDING
from pydantic import Field


class Alert(Document):
    farm_id: PydanticObjectId
    type: str  # "high_risk" | "regional_outbreak" | "verification_needed"
    message: str
    read: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "alerts"
        indexes = [
            IndexModel([("farm_id", ASCENDING)], name="alert_farm_id_idx"),
            IndexModel([("farm_id", ASCENDING), ("read", ASCENDING)], name="alert_farm_read_idx"),
            IndexModel([("type", ASCENDING)], name="alert_type_idx"),
            IndexModel([("created_at", DESCENDING)], name="alert_created_at_idx"),
        ]
