"""
CropShield / AgriGuard — Crop Cost Template Beanie Document Model
Admin-managed crop cultivation cost templates per acre with citable source notes
"""
from datetime import datetime
from typing import Optional, Dict
from beanie import Document
from pymongo import IndexModel, ASCENDING
from pydantic import Field


class CropCostTemplate(Document):
    crop_type: str  # e.g. "Cotton", "Rice", "Sugarcane"
    cost_breakdown_per_acre: Dict[str, float] = Field(
        default_factory=lambda: {
            "seeds": 0.0,
            "fertilizer": 0.0,
            "labor": 0.0,
            "irrigation": 0.0,
            "pesticides": 0.0,
        }
    )
    total_cost_per_acre: float = 0.0
    last_updated: datetime = Field(default_factory=datetime.utcnow)
    source_note: str = Field(
        default="INDICATIVE - verify against CACP Cost of Cultivation of Principal Crops reports (desagri.gov.in) before citing"
    )

    class Settings:
        name = "crop_cost_templates"
        indexes = [
            IndexModel([("crop_type", ASCENDING)], unique=True, name="crop_cost_crop_unique_idx"),
        ]
