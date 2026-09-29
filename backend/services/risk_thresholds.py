"""
CropShield / AgriGuard — Persisted risk thresholds (contract item 11).

Risk score boundaries on a 0–100 scale:
    score < low_max            -> Low
    low_max <= score < medium_max -> Medium
    score >= medium_max        -> High

`get_risk_thresholds()` is SYNC and served from an in-process cache so inference code
(which runs in worker threads) can call it cheaply. The cache is filled from MongoDB at
startup (`load_risk_thresholds()`) and updated by `save_risk_thresholds()` (admin PUT).
Defaults (35/65) match the historical inference_service boundaries (0.35 / 0.65).

Stored in the `platform_settings` collection as a single document with _id "risk_thresholds"
(no Beanie model needed). Other admin alert settings are stored in the same document.
"""
import logging
import threading
from copy import deepcopy
from datetime import datetime
from typing import Any, Dict, Optional

logger = logging.getLogger("cropshield.risk_thresholds")

SETTINGS_COLLECTION = "platform_settings"
SETTINGS_DOC_ID = "risk_thresholds"

DEFAULTS: Dict[str, Any] = {
    "low_max": 35.0,
    "medium_max": 65.0,
    # Non-risk alert settings kept alongside (used by /admin/alert-thresholds)
    "haversine_cluster_radius_km": 5.0,
    "notification_frequency_hours": 12,
    "preemptive_alert_enabled": True,
}

_lock = threading.Lock()
_cache: Dict[str, Any] = deepcopy(DEFAULTS)


def _validate(values: Dict[str, Any]) -> Dict[str, Any]:
    low = float(values["low_max"])
    med = float(values["medium_max"])
    if not (0.0 < low < med < 100.0):
        raise ValueError("Thresholds must satisfy 0 < low_max < medium_max < 100.")
    out = dict(values)
    out["low_max"] = round(low, 2)
    out["medium_max"] = round(med, 2)
    return out


def get_risk_thresholds() -> Dict[str, Any]:
    """Sync, cached. Always returns at least {"low_max": float, "medium_max": float} on a 0–100 scale."""
    with _lock:
        return deepcopy(_cache)


def _collection():
    from backend.db.mongo_helpers import get_collection
    from backend.models.user import User
    return get_collection(User).database[SETTINGS_COLLECTION]


async def load_risk_thresholds() -> Dict[str, Any]:
    """Loads persisted thresholds into the cache (keeps defaults on error / when nothing is stored)."""
    global _cache
    try:
        doc = await _collection().find_one({"_id": SETTINGS_DOC_ID})
    except Exception as e:
        logger.warning("Could not load risk thresholds from MongoDB (using defaults): %s", e)
        return get_risk_thresholds()
    if doc:
        merged = deepcopy(DEFAULTS)
        merged.update({k: v for k, v in doc.items() if k in DEFAULTS})
        try:
            merged = _validate(merged)
        except (ValueError, TypeError, KeyError) as e:
            logger.error("Stored risk thresholds invalid (%s); using defaults.", e)
            merged = deepcopy(DEFAULTS)
        with _lock:
            _cache = merged
    return get_risk_thresholds()


async def save_risk_thresholds(updates: Dict[str, Any], updated_by: Optional[str] = None) -> Dict[str, Any]:
    """Validates, persists (upsert) and caches new threshold values. Raises ValueError on bad input."""
    global _cache
    current = get_risk_thresholds()
    merged = {**current, **{k: v for k, v in updates.items() if k in DEFAULTS and v is not None}}
    merged = _validate(merged)
    await _collection().update_one(
        {"_id": SETTINGS_DOC_ID},
        {"$set": {**merged, "updated_at": datetime.utcnow(), "updated_by": updated_by}},
        upsert=True,
    )
    with _lock:
        _cache = merged
    return get_risk_thresholds()
