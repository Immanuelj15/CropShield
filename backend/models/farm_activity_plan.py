"""
CropShield / AgriGuard — Farm Activity Plan Document Model
Represents the AI Farm Activity Planner: full-season chronological timeline
orchestrating irrigation, fertilization, pest surveillance, and harvesting.
"""
from datetime import datetime, date
from typing import List, Dict, Any, Optional
from beanie import Document, PydanticObjectId
from pymongo import IndexModel, ASCENDING, DESCENDING
from pydantic import Field


class FarmActivityPlan(Document):
    farm_id: PydanticObjectId = Field(..., index=True)
    crop_type: str
    sowing_date: str  # Format: "YYYY-MM-DD"
    estimated_harvest_date: str  # Format: "YYYY-MM-DD"
    current_stage: str = "Initial"
    is_active: bool = True
    timeline: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Array of {activity_id: str, activity_type: str, scheduled_date: str, details: dict, status: str, completed_at: str|null}"
    )
    tips: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Sustainable farming recommendations (rotation, water conservation)"
    )
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    last_updated: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "farm_activity_plans"
        indexes = [
            IndexModel([("farm_id", ASCENDING), ("is_active", DESCENDING)], name="farm_activity_active_idx"),
            IndexModel([("farm_id", ASCENDING), ("sowing_date", DESCENDING)], name="farm_activity_sowing_idx"),
        ]
