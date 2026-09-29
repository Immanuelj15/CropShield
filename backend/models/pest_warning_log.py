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
    fused_health_score: Optional[Dict[str, Any]] = None
    raw_confidence: Optional[float] = None
    calibrated_confidence: Optional[float] = None
    confidence_band: Optional[str] = None
    model_calibration_version: Optional[str] = None
    economic_impact: Optional[Dict[str, Any]] = None
    # Which pipeline wrote the row: "daily_job" | "predict_today" | ... . Rows with a string source are
    # unique per (farm_id, date, source); legacy rows without it are excluded from that index.
    source: Optional[str] = None
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
            IndexModel(
                [("farm_id", ASCENDING), ("date", ASCENDING), ("source", ASCENDING)],
                unique=True,
                name="pest_log_farm_date_source_unique_idx",
                partialFilterExpression={"source": {"$type": "string"}},
            ),
        ]


async def upsert_pest_warning_log(
    farm_id: PydanticObjectId,
    date: str,
    source: str,
    fields: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Atomic upsert of one PestWarningLog row keyed on (farm_id, date, source).
    - Never overwrites a row an agronomist already verified (verified_by set): returns status "verified_locked".
    - `fields` are $set on every write; created_at / verified_by / verified_at are only set on insert.
    Returns {"status": "inserted" | "updated" | "verified_locked", "id": <ObjectId|None>}.
    """
    from pymongo import ReturnDocument
    from backend.db.mongo_helpers import get_collection, is_duplicate_key_error

    coll = get_collection(PestWarningLog)
    set_fields = {k: v for k, v in fields.items() if k not in ("farm_id", "date", "source", "verified_by", "verified_at", "created_at")}
    key = {"farm_id": farm_id, "date": date, "source": source}
    update = {
        "$set": set_fields,
        "$setOnInsert": {"created_at": datetime.utcnow(), "verified_by": None, "verified_at": None},
    }
    for attempt in range(2):
        try:
            existed = await coll.count_documents({**key, "verified_by": None}, limit=1)
            doc = await coll.find_one_and_update(
                {**key, "verified_by": None},
                update,
                upsert=True,
                return_document=ReturnDocument.AFTER,
            )
            return {"status": "updated" if existed else "inserted", "id": doc.get("_id") if doc else None}
        except Exception as e:
            if not is_duplicate_key_error(e):
                raise
            # Either a verified row holds the key (filter excluded it) or a concurrent upsert won the race.
            verified = await coll.find_one({**key, "verified_by": {"$ne": None}}, {"_id": 1})
            if verified:
                return {"status": "verified_locked", "id": verified["_id"]}
            if attempt == 1:
                raise
    return {"status": "updated", "id": None}
