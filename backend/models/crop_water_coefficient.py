"""
CropShield / AgriGuard — Crop Water Coefficient (Kc) Document Model
FAO-56 Irrigation and Drainage Paper No. 56 methodology.
Stores stage-specific crop coefficients (Kc) and duration days.
"""
from datetime import datetime
from typing import List, Dict, Any, Optional
from beanie import Document
from pymongo import IndexModel, ASCENDING
from pydantic import Field


class CropWaterCoefficient(Document):
    crop_type: str = Field(..., index=True)
    growth_stages: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Array of {stage_name: str, duration_days: int, kc: float}"
    )
    total_duration_days: Optional[int] = None
    source_note: str = Field(
        ...,
        description="Mandatory citable reference (e.g. FAO-56 Table 12 / TNAU Irrigation Guide)"
    )
    last_updated: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "crop_water_coefficients"
        indexes = [
            IndexModel([("crop_type", ASCENDING)], unique=True, name="crop_water_type_unique_idx"),
        ]
