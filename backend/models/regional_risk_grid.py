"""
CropShield / AgriGuard — Regional Risk Grid Beanie Document Model
Village-Level Community Risk Grid (Haversine 5 km geospatial clustering)
"""
from datetime import datetime
from typing import List
from beanie import Document, PydanticObjectId
from pymongo import IndexModel, ASCENDING, DESCENDING
from pydantic import Field


class RegionalRiskGrid(Document):
    center_farm_id: PydanticObjectId
    cluster_farms: List[PydanticObjectId] = Field(default_factory=list)
    cluster_risk_level: str = "Low"  # "Low" | "Medium" | "High"
    radius_km: float = 5.0
    last_updated: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "regional_risk_grid"
        indexes = [
            IndexModel([("center_farm_id", ASCENDING)], unique=True, name="grid_center_farm_unique_idx"),
            IndexModel([("cluster_risk_level", ASCENDING)], name="grid_risk_level_idx"),
            IndexModel([("last_updated", DESCENDING)], name="grid_last_updated_idx"),
        ]
