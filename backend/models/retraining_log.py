"""
CropShield / AgriGuard — Model Retraining Log Beanie Document Model
Tracks human-in-the-loop expert verification feedback loop and automated model retraining runs
"""
from datetime import datetime
from typing import Optional, Dict, Any
from beanie import Document, PydanticObjectId
from pymongo import IndexModel, DESCENDING
from pydantic import Field


class RetrainingLog(Document):
    triggered_by: Optional[PydanticObjectId] = None
    triggered_by_role: str = "admin"  # "admin" | "agronomist" | "system"
    model_name: str = "xgboost_multicrop_v2"
    dataset_rows: int = 10000
    verified_samples_ingested: int = 0
    accuracy: float = 0.7845
    auc_roc: float = 0.7820
    status: str = "completed"  # "queued" | "running" | "completed" | "failed"
    metrics: Dict[str, Any] = Field(default_factory=dict)
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "retraining_logs"
        indexes = [
            IndexModel([("created_at", DESCENDING)], name="retrain_created_at_idx"),
            IndexModel([("status", DESCENDING)], name="retrain_status_idx"),
        ]
