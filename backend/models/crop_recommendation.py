"""
CropShield / AgriGuard — Crop Recommendation Beanie Document Model
Audit trail of pre-season crop recommendations generated for farms
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from beanie import Document, PydanticObjectId
from pymongo import IndexModel, ASCENDING, DESCENDING
from pydantic import Field


class CropRecommendation(Document):
    farm_id: Optional[PydanticObjectId] = None
    district: Optional[str] = None
    soil_type: Optional[str] = None
    land_area_acres: float = 1.0
    season: str = "Kharif"
    water_availability: str = "Medium"
    requested_budget: float = 50000.0
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    recommendations: List[Dict[str, Any]] = Field(default_factory=list)

    class Settings:
        name = "crop_recommendations"
        indexes = [
            IndexModel([("farm_id", ASCENDING)], name="crop_rec_farm_idx"),
            IndexModel([("generated_at", DESCENDING)], name="crop_rec_generated_at_idx"),
            IndexModel([("district", ASCENDING)], name="crop_rec_district_idx"),
        ]
