"""
CropShield / AgriGuard — Disease Detection Beanie Document Model
Image-based leaf disease detection records
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from beanie import Document, PydanticObjectId
from pymongo import IndexModel, ASCENDING, DESCENDING
from pydantic import Field


class DiseaseDetection(Document):
    farm_id: Optional[PydanticObjectId] = None
    user_id: Optional[PydanticObjectId] = None
    image_url: str
    predicted_class: str
    confidence: float
    top_k: List[Dict[str, Any]] = Field(default_factory=list)
    model_name: str = "resnet18_plantvillage_v1"
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "disease_detections"
        indexes = [
            IndexModel([("farm_id", ASCENDING)], name="disease_farm_id_idx"),
            IndexModel([("user_id", ASCENDING)], name="disease_user_id_idx"),
            IndexModel([("created_at", DESCENDING)], name="disease_created_at_idx"),
        ]
