"""
AgriGuard AI — Geospatial Clustering & Regional Alert Dispatch Engine
Implements Patent Claim 5-8:
- Haversine-based spatial clustering and MongoDB 2dsphere spatial queries
- Automated 5km boundary outbreak alert generation for neighboring farms
- Batch daily prediction pipeline across all registered farm zones
"""
import math
import logging
from datetime import datetime
from typing import List, Dict, Any, Tuple, Optional
from zoneinfo import ZoneInfo
from beanie import PydanticObjectId

from backend.models.farm import Farm as MongoFarm
from backend.models.alert import Alert as MongoAlert
from backend.models.pest_warning_log import PestWarningLog as MongoWarningLog
from backend.db.mongo_helpers import get_collection, is_duplicate_key_error

logger = logging.getLogger("cropshield.geospatial")

IST = ZoneInfo("Asia/Kolkata")
REGIONAL_ALERT_TYPE = "regional_outbreak"


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates great-circle distance between two GPS coordinates in kilometers."""
    R = 6371.0  # Earth's radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(R * c, 3)


async def find_farms_within_radius(
    origin_farm_id: PydanticObjectId,
    latitude: float,
    longitude: float,
    radius_km: float = 5.0
) -> List[MongoFarm]:
    """
    Finds all registered neighboring farms within a radius (default 5km).
    Uses MongoDB 2dsphere index with Haversine geometric fallback.
    """
    neighbors: List[MongoFarm] = []
    
    # 1. Attempt MongoDB 2dsphere $near query
    try:
        query = {
            "location": {
                "$near": {
                    "$geometry": {
                        "type": "Point",
                        "coordinates": [longitude, latitude]
                    },
                    "$maxDistance": radius_km * 1000.0  # meters
                }
            },
            "_id": {"$ne": origin_farm_id}
        }
        neighbors = await MongoFarm.find(query).to_list()
        if neighbors:
            return neighbors
    except Exception as mongo_err:
        logger.debug(f"2dsphere index query fallback: {mongo_err}")

    # 2. Pure-software Haversine fallback across all registered farms
    all_farms = await MongoFarm.find(MongoFarm.id != origin_farm_id).to_list()
    for f in all_farms:
        f_coords = f.location.get("coordinates", [])
        if len(f_coords) >= 2:
            f_lon, f_lat = f_coords[0], f_coords[1]
            dist = haversine_distance_km(latitude, longitude, f_lat, f_lon)
            if dist <= radius_km:
                neighbors.append(f)
                
    return neighbors


async def _claim_regional_alert(origin_farm_id, neighbor_id, alert_date: str, msg: str, now: datetime):
    """
    Atomically creates the Alert for (origin farm, neighbour farm, IST date, type) if it does not exist.
    Returns the new alert _id, or None if one was already created (by this or a concurrent request).
    Backed by the unique partial index alert_origin_target_date_type_unique_idx.
    """
    coll = get_collection(MongoAlert)
    key = {
        "origin_farm_id": origin_farm_id,
        "farm_id": neighbor_id,
        "alert_date": alert_date,
        "type": REGIONAL_ALERT_TYPE,
    }
    try:
        res = await coll.update_one(
            key,
            {"$setOnInsert": {"message": msg, "read": False, "created_at": now}},
            upsert=True,
        )
    except Exception as e:
        if is_duplicate_key_error(e):
            return None
        raise
    return res.upserted_id


async def dispatch_5km_regional_alerts(
    origin_farm: MongoFarm,
    threat_name: str = "Pest Outbreak",
    risk_level: str = "High",
    radius_km: float = 5.0,
    weather_source: Optional[str] = None,
    skip_if_synthetic: bool = True,
) -> List[Dict[str, Any]]:
    """
    Automated Cross-Role Geospatial Action:
    When a farm enters High risk, finds all neighboring farms within 5km
    and writes alert documents for their owners immediately.

    Idempotent: at most ONE alert (and one notification) per (origin farm, neighbour farm, IST day, type);
    repeated calls the same day return only newly created alerts (usually []).
    If weather_source == "synthetic" (and skip_if_synthetic) nothing is dispatched.
    Neighbours without an owner_id get the Alert document but no push/SMS notification.
    """
    if skip_if_synthetic and weather_source == "synthetic":
        logger.info("Skipping 5km alerts from %s: prediction based on synthetic weather.", origin_farm.farm_name)
        return []

    coords = origin_farm.location.get("coordinates", [])
    if len(coords) < 2:
        return []

    origin_lon, origin_lat = coords[0], coords[1]
    neighbors = await find_farms_within_radius(
        origin_farm_id=origin_farm.id,
        latitude=origin_lat,
        longitude=origin_lon,
        radius_km=radius_km
    )

    created_alerts = []
    now = datetime.utcnow()
    alert_date = datetime.now(IST).date().isoformat()

    for neighbor in neighbors:
        n_coords = neighbor.location.get("coordinates", [0, 0])
        dist = haversine_distance_km(origin_lat, origin_lon, n_coords[1], n_coords[0])
        
        msg = (
            f"🚨 5km Community Risk Grid Alert: High pest threat ({threat_name}) "
            f"detected at neighboring {origin_farm.farm_name} ({dist:.1f}km away in {origin_farm.district}). "
            f"Preemptive scouting on your {neighbor.crop_type} crop is strongly advised."
        )

        try:
            alert_id = await _claim_regional_alert(origin_farm.id, neighbor.id, alert_date, msg, now)
        except Exception as alert_err:
            logger.warning("Failed to create regional alert for farm %s: %s", neighbor.id, alert_err)
            continue
        if alert_id is None:
            continue  # already alerted today for this origin/neighbour pair

        target_user = getattr(neighbor, "owner_id", None)
        if not target_user:
            logger.debug("Neighbour farm %s has no owner_id; alert stored without notification.", neighbor.id)
            created_alerts.append({
                "alert_id": str(alert_id),
                "target_farm_id": str(neighbor.id),
                "target_farm_name": neighbor.farm_name,
                "distance_km": dist
            })
            continue

        # Multi-Channel Alert Delivery: Notify neighboring farmer via PWA Push / SMS / WhatsApp
        try:
            from backend.services.notification_service import notify_farmer
            await notify_farmer(target_user, REGIONAL_ALERT_TYPE, {
                "en": f"AgriGuard Outbreak Alert: High pest threat ({threat_name}) detected at neighboring {origin_farm.farm_name} ({dist:.1f}km away). Preemptive scouting advised.",
                "ta": f"அக்ரிகார்ட் எச்சரிக்கை: அருகில் உள்ள பண்ணையில் ({dist:.1f} கி.மீ) பூச்சி தாக்குதல் ({threat_name}) கண்டறியப்பட்டுள்ளது. முன்கூட்டியே கண்காணிக்கவும்.",
                "hi": f"एग्रीगार्ड अलर्ट: पास के खेत में ({dist:.1f} किमी) कीट का प्रकोप ({threat_name}) पाया गया है। सतर्कता बरतें।",
                "te": f"అగ్రిగార్డ్ హెచ్చరిక: సమీపంలోని పొలంలో ({dist:.1f} కి.మీ దూరంలో) తెగులు ముప్పు ({threat_name}) గుర్తించబడింది. ముందస్తు పరిశీలన చేయండి.",
                "ml": f"അഗ്രിഗാർഡ് മുന്നറിയിപ്പ്: സമീപത്തെ കൃഷിയിടത്തിൽ ({dist:.1f} കി.മീ അകലെ) കീട ഭീഷണി ({threat_name}) കണ്ടെത്തി. മുൻകരുതൽ നിരീക്ഷണം നടത്തുക.",
            })
        except Exception as notif_err:
            logger.warning(f"Failed to dispatch regional outbreak notification for farm {neighbor.id}: {notif_err}")

        created_alerts.append({
            "alert_id": str(alert_id),
            "target_farm_id": str(neighbor.id),
            "target_farm_name": neighbor.farm_name,
            "distance_km": dist
        })

    logger.info(
        f"Dispatched {len(created_alerts)} 5km regional outbreak alerts originating from {origin_farm.farm_name}"
    )
    return created_alerts


async def run_daily_prediction_pipeline_for_all_farms() -> Dict[str, Any]:
    """
    Background Task / Batch Engine (admin "run daily predictions").
    Delegates to the daily ingestion job (the single working batch path) so it shares its lock,
    synthetic-weather guard, atomic upserts and alert dedupe. The previous implementation called
    functions that do not exist (weather_service.get_weather_for_prediction / inference_service.predict_pest_risk).
    """
    from backend.jobs.daily_ingestion_job import run_daily_ingestion_job

    report = await run_daily_ingestion_job(is_manual=True)
    return {
        "status": "completed" if report.get("status") != "skipped" else "skipped",
        "total_farms_processed": report.get("success_count", 0),
        "high_risk_cases": report.get("high_risk_count", 0),
        "medium_risk_cases": report.get("medium_risk_count", 0),
        "alerts_dispatched_5km": report.get("alerts_dispatched", 0),
        "failed_count": report.get("failed_count", 0),
        "job_run_id": report.get("job_run_id"),
        "timestamp": datetime.utcnow().isoformat()
    }
