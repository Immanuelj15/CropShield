"""
CropShield / AgriGuard — Treatment Log Beanie Document Model
Farmer-recorded pesticide, fertilizer, or organic treatment applications
"""
from datetime import datetime
from typing import Optional
from beanie import Document, PydanticObjectId
from pymongo import IndexModel, ASCENDING, DESCENDING
from pydantic import Field


class Treatment(Document):
    farm_id: PydanticObjectId
    user_id: PydanticObjectId
    treatment_date: str  # Format: "YYYY-MM-DD"
    treatment_type: str = "organic"  # "organic" | "chemical" | "biological"
    product_name: str
    target_pest: str
    dosage: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "treatments"
        indexes = [
            IndexModel([("farm_id", ASCENDING), ("treatment_date", DESCENDING)], name="treatment_farm_date_idx"),
            IndexModel([("user_id", ASCENDING)], name="treatment_user_id_idx"),
            IndexModel([("target_pest", ASCENDING)], name="treatment_pest_idx"),
        ]
