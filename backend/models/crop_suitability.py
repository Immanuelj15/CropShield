"""
CropShield / AgriGuard — Crop Suitability Rule Beanie Document Model
Admin-managed agronomic suitability rules for pre-season crop selection
"""
from datetime import datetime
from typing import Optional, List, Union
from beanie import Document
from pymongo import IndexModel, ASCENDING
from pydantic import Field


class CropSuitabilityRule(Document):
    crop_type: str  # e.g. "Cotton", "Rice", "Millets"
    suitable_soil_types: List[str] = Field(default_factory=list)  # ["Black Cotton Soil", "Red Sandy Loam"]
    water_requirement: str = "Medium"  # "Low" | "Medium" | "High"
    suitable_seasons: List[str] = Field(default_factory=list)  # ["Kharif", "Rabi", "Summer"]
    base_yield_per_acre_kg: float = 500.0  # kg per acre
    yield_variance_pct: float = 20.0  # percentage variance for yield range (e.g. 20%)
    avoid_after_same_crop_seasons: int = 1  # crop rotation guard
    source_note: str = Field(
        default="INDICATIVE - verify against TNAU crop production guides / CACP Cost of Cultivation reports before citing"
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "crop_suitability_rules"
        indexes = [
            IndexModel([("crop_type", ASCENDING)], unique=True, name="crop_suitability_crop_unique_idx"),
            IndexModel([("water_requirement", ASCENDING)], name="crop_suitability_water_idx"),
        ]
