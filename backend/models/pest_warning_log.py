"""
CropShield / AgriGuard — Pest Warning Log Beanie Document Model
Core prediction audit trail with SHAP values and Counterfactual Prescriptions
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from beanie import Document, PydanticObjectId
from pymongo import IndexModel, ASCENDING, DESCENDING
from pydantic import Field


class PestWarningLog(Document):
    farm_id: PydanticObjectId
    date: str  # Format: "YYYY-MM-DD"
    crop_type: str = "Cotton"
    risk_score: float  # Range: 0.0 to 1.0
    risk_level: str  # "Low" | "Medium" | "High"
    model_name: str = "xgboost_v1"
    model_version: str = "1.0.0"
    shap_explanation: List[Dict[str, Any]] = Field(default_factory=list)
    counterfactual_prescription: Optional[Dict[str, Any]] = None
    detected_pests: List[Dict[str, Any]] = Field(default_factory=list)
    verified_by: Optional[PydanticObjectId] = None
    verified_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "pest_warning_logs"
        indexes = [
            IndexModel(
                [("farm_id", ASCENDING), ("date", DESCENDING)],
                name="pest_log_farm_date_idx",
            ),
            IndexModel([("farm_id", ASCENDING)], name="pest_log_farm_id_idx"),
            IndexModel([("risk_level", ASCENDING)], name="pest_log_risk_level_idx"),
            IndexModel([("created_at", DESCENDING)], name="pest_log_created_at_idx"),
        ]
