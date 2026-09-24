"""
CropShield / AgriGuard — Crop Nutrient Requirement Document Model
Stores recommended N, P, K requirements (kg/acre) and application splits across growth stages.
Cites ICAR / TNAU crop production guides.
"""
from datetime import datetime
from typing import List, Dict, Any
from beanie import Document
from pymongo import IndexModel, ASCENDING
from pydantic import Field


class CropNutrientRequirement(Document):
    crop_type: str = Field(..., index=True)
    n_required_kg_per_acre: float = Field(..., description="Nitrogen requirement in kg/acre")
    p_required_kg_per_acre: float = Field(..., description="Phosphorus (P2O5) requirement in kg/acre")
    k_required_kg_per_acre: float = Field(..., description="Potassium (K2O) requirement in kg/acre")
    application_split: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Array of {stage: str, n_pct: float, p_pct: float, k_pct: float, days_after_sowing: int}"
    )
    source_note: str = Field(
        ...,
        description="Mandatory citable reference (e.g. ICAR Handbook of Agriculture / TNAU Agritech Portal)"
    )
    last_updated: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "crop_nutrient_requirements"
        indexes = [
            IndexModel([("crop_type", ASCENDING)], unique=True, name="crop_nutrient_type_unique_idx"),
        ]
