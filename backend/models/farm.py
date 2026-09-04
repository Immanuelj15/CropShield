"""
CropShield / AgriGuard — Farm Beanie Document Model
"""
from datetime import datetime
from typing import Optional, Dict, Any
from beanie import Document, Indexed, PydanticObjectId
from pymongo import IndexModel, GEOSPHERE, ASCENDING
from pydantic import Field


class Farm(Document):
    owner_id: Indexed(PydanticObjectId)
    farm_name: str
    location: Dict[str, Any]  # GeoJSON Point: {"type": "Point", "coordinates": [lon, lat]}
    district: str
    climate_zone: str = "Dryland"  # "Delta" | "Dryland" | "Coastal" | "Hills"
    crop_type: str = "Cotton"  # "Cotton" | "Rice" | "Sorghum" | "Millets" | "Sugarcane" | "Pulses"
    soil_type: Optional[str] = "Black Soil (Vertisol)"
    area_hectares: float = 1.0
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "farms"
        indexes = [
            IndexModel([("location", GEOSPHERE)], name="farm_location_2dsphere"),
            IndexModel([("district", ASCENDING)], name="farm_district_idx"),
            IndexModel([("crop_type", ASCENDING)], name="farm_crop_type_idx"),
        ]
