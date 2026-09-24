"""
CropShield / AgriGuard — Pest & Disease Advisory Beanie Document Model
Admin/Agronomist-managed pest and disease knowledge base
"""
from datetime import datetime
from typing import Optional, List, Dict, Any, Union
from beanie import Document, PydanticObjectId
from pymongo import IndexModel, ASCENDING
from pydantic import Field


class PestDiseaseAdvisory(Document):
    pest_or_disease: Union[Dict[str, str], str]
    crop_type: Union[Dict[str, str], str]
    season: Optional[str] = "All"
    symptoms: Union[List[str], Dict[str, Any], str] = Field(default_factory=list)
    chemical_treatment: Optional[Union[Dict[str, str], str]] = None
    organic_treatment: Optional[Union[Dict[str, str], str]] = None
    prevention: Optional[Union[Dict[str, str], str]] = None
    favorable_temp_min: Optional[float] = None
    favorable_temp_max: Optional[float] = None
    favorable_rh_min: Optional[float] = None
    favorable_rh_max: Optional[float] = None
    treatment_cost_per_acre: Optional[float] = None
    treatment_effectiveness_pct: Optional[float] = 0.75
    cost_source_note: Optional[str] = None
    uploaded_by: Optional[PydanticObjectId] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "pest_disease_advisories"
        indexes = [
            IndexModel([("pest_or_disease", ASCENDING)], name="advisory_pest_name_idx"),
            IndexModel([("crop_type", ASCENDING)], name="advisory_crop_type_idx"),
            IndexModel([("pest_or_disease", ASCENDING), ("crop_type", ASCENDING)], name="advisory_pest_crop_idx"),
        ]
