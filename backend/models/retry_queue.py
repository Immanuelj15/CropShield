"""
CropShield / AgriGuard — Retry Queue Beanie Document Model
Holds failed farm ingestion items for automated hourly retry sweeps.
"""

from datetime import datetime
from typing import Optional
from beanie import Document, PydanticObjectId
from pymongo import IndexModel, ASCENDING, DESCENDING
from pydantic import Field


class RetryQueue(Document):
    farm_id: PydanticObjectId
    district: str
    error_message: str
    retry_count: int = 0
    status: str = "pending"  # "pending" | "resolved" | "abandoned"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_attempt_at: Optional[datetime] = None

    class Settings:
        name = "retry_queue"
        indexes = [
            IndexModel([("status", ASCENDING), ("retry_count", ASCENDING)], name="retry_queue_status_idx"),
            IndexModel([("farm_id", ASCENDING)], name="retry_queue_farm_idx"),
        ]
