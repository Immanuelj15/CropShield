"""
CropShield / AgriGuard — Agronomist Scoped API Router
Human-in-the-loop verification layer between AI models and farmers:
- Active threat verification queue (confirm or override AI diagnosis)
- Closed-loop retraining queue ingestion (patent novelty)
- Real-time field environmental view (NASA POWER satellite reanalysis)
- Regional risk alert grid dashboard (5km clusters)
- Regional report generation
- Farmer support diagnostic responder
"""
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any, Literal
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from backend.utils.auth_utils import require_roles, parse_object_id, get_owned_farm
from backend.models.user import User as MongoUser
from backend.models.farm import Farm as MongoFarm
from backend.models.pest_warning_log import PestWarningLog as MongoWarningLog
from backend.models.support_request import SupportRequest as MongoSupportRequest
from backend.models.retraining_log import RetrainingLog as MongoRetrainingLog
from backend.services import weather_service

logger = logging.getLogger("cropshield.agronomist_api")

router = APIRouter(tags=["Agronomist Expert Portal"])


class VerifyThreatRequest(BaseModel):
    decision: Literal["confirm", "override"] = Field("confirm", example="confirm")
    confirmed_pest: Optional[str] = Field(None, max_length=200, example="Pink Bollworm (Pectinophora gossypiella)")
    severity: Optional[Literal["Low", "Medium", "High"]] = Field("High", example="High")
    notes: Optional[str] = Field(None, max_length=2000, example="Field scouting in Kovilpatti confirms rosette flower symptoms.")


class SupportResponseRequest(BaseModel):
    response_text: str = Field(..., min_length=5, max_length=4000, example="Apply 2% Neem seed kernel extract immediately. Recheck in 48h.")


@router.get("/detect/pending")
async def list_pending_verifications(
    limit: int = Query(25, ge=1, le=100),
    current_user: MongoUser = Depends(require_roles(["agronomist", "admin"]))
):
    """
    Returns unverified AI predictions needing human expert review.
    Prioritizes High and Medium risk warnings.
    """
    # Look for logs where verified_by is None
    pending_logs = await MongoWarningLog.find(
        MongoWarningLog.verified_by == None
    ).sort(-MongoWarningLog.created_at).limit(limit).to_list()

    # If no real unverified logs yet, return synthetic queue for demonstrations
    if not pending_logs:
        farms = await MongoFarm.find().to_list()
        farm_dict = {str(f.id): f.farm_name for f in farms}
        return {
            "total_pending": 3,
            "simulated": True,  # demo cases: verifying demo_threat_* ids returns 404
            "region": getattr(current_user, "region_assigned", "All Tamil Nadu"),
            "items": [
                {
                    "log_id": "demo_threat_01",
                    "farm_name": "Kovilpatti Black Soil Cotton Farm",
                    "district": "Thoothukudi",
                    "crop_type": "Cotton",
                    "ai_risk_score": 0.78,
                    "ai_risk_level": "High",
                    "detected_pest": "Pink Bollworm (Pectinophora gossypiella)",
                    "ai_confidence": 0.85,
                    "date": "2026-09-08",
                    "evidence_snippet": "NASA POWER 9 consecutive dry days + elevated 33.5°C heat index.",
                    "status": "pending_verification"
                },
                {
                    "log_id": "demo_threat_02",
                    "farm_name": "Thanjavur Cauvery Delta Rice Farm",
                    "district": "Thanjavur",
                    "crop_type": "Rice",
                    "ai_risk_score": 0.62,
                    "ai_risk_level": "Medium",
                    "detected_pest": "Brown Planthopper (Nilaparvata lugens)",
                    "ai_confidence": 0.74,
                    "date": "2026-09-08",
                    "evidence_snippet": "Delta zone relative humidity spiked to 84.5% with stagnant canal water.",
                    "status": "pending_verification"
                },
                {
                    "log_id": "demo_threat_03",
                    "farm_name": "Kayathar Neighbor Farm A",
                    "district": "Thoothukudi",
                    "crop_type": "Cotton",
                    "ai_risk_score": 0.71,
                    "ai_risk_level": "High",
                    "detected_pest": "American Bollworm (Helicoverpa armigera)",
                    "ai_confidence": 0.82,
                    "date": "2026-09-07",
                    "evidence_snippet": "Boll punctures reported in adjacent 5km cluster.",
                    "status": "pending_verification"
                }
            ]
        }

    farms = await MongoFarm.find().to_list()
    farm_map = {f.id: f for f in farms}

    items = []
    for log in pending_logs:
        f_info = farm_map.get(log.farm_id)
        items.append({
            "log_id": str(log.id),
            "farm_name": f_info.farm_name if f_info else "Registered Farm",
            "district": f_info.district if f_info else "Tamil Nadu",
            "crop_type": log.crop_type,
            "ai_risk_score": log.risk_score,
            "ai_risk_level": log.risk_level,
            "detected_pest": log.detected_pests[0]["pest_name"] if log.detected_pests else "Unspecified Pest",
            "ai_confidence": log.detected_pests[0].get("confidence", 0.80) if log.detected_pests else 0.75,
            "date": log.date,
            "evidence_snippet": log.counterfactual_prescription.get("delta_summary", "NASA POWER climate features.") if log.counterfactual_prescription else "Climate reanalysis indicators.",
            "status": "pending_verification",
        })

    return {
        "total_pending": len(items),
        "simulated": False,
        "region": getattr(current_user, "region_assigned", "All Tamil Nadu"),
        "items": items,
    }


@router.post("/detect/{log_id}/verify")
async def verify_threat_case(
    log_id: str,
    req: VerifyThreatRequest,
    current_user: MongoUser = Depends(require_roles(["agronomist", "admin"]))
):
    """
    Confirms or overrides an AI-flagged pest diagnosis.
    Feeds directly into the patent's 'closed-loop verification' audit trail.
    """
    now = datetime.utcnow()
    obj_id = parse_object_id(log_id, "Warning log not found.")
    verified_record = await MongoWarningLog.get(obj_id)
    if not verified_record:
        raise HTTPException(status_code=404, detail="Warning log not found.")
    if verified_record.verified_by is not None:
        raise HTTPException(status_code=409, detail="This case has already been verified.")

    verified_record.verified_by = current_user.id
    verified_record.verified_at = now
    if req.decision == "override" and req.severity:
        verified_record.risk_level = req.severity
    await verified_record.save()

    # Enqueue into retraining feedback queue
    retrain_entry = MongoRetrainingLog(
        triggered_by=current_user.id,
        triggered_by_role="agronomist",
        model_name="xgboost_multicrop_v2",
        dataset_rows=10000,
        verified_samples_ingested=1,
        status="queued",
        notes=f"Agronomist {current_user.name} ({req.decision}): {req.notes or 'Diagnosis updated.'}",
    )
    await retrain_entry.insert()

    return {
        "status": "success",
        "log_id": log_id,
        "decision": req.decision,
        "confirmed_pest": req.confirmed_pest or "Verified as diagnosed",
        "verified_by": current_user.name,
        "verified_at": now.isoformat(),
        "audit_trail_recorded": True,
        "retraining_queue_id": str(retrain_entry.id),
        "message": f"Case successfully {req.decision}ed by expert. Added to retraining feedback queue."
    }


@router.get("/weather/{farm_id}")
async def get_farm_field_weather(
    farm_id: str,
    current_user: MongoUser = Depends(require_roles(["agronomist", "admin"]))
):
    """
    Returns real-time and 30-day NASA POWER satellite reanalysis for a registered farm zone.
    Pure software API integration — no physical hardware sensors.
    """
    farm = await get_owned_farm(farm_id, current_user, allow_staff_read=True)
    coords = (farm.location or {}).get("coordinates") if isinstance(farm.location, dict) else None
    if not coords or len(coords) < 2:
        raise HTTPException(status_code=404, detail="Farm has no GPS location.")
    lat, lon = float(coords[1]), float(coords[0])

    try:
        weather_df = await weather_service.fetch_latest_weather(latitude=lat, longitude=lon, days_back=14)
        latest = weather_service.get_today_weather_dict(weather_df)
    except Exception:
        logger.exception("Weather fetch failed for farm %s", farm.id)
        raise HTTPException(status_code=503, detail="Weather data is temporarily unavailable.")
    weather_source = latest.get("weather_source") or getattr(weather_df, "attrs", {}).get("source") or "NASA_POWER"
    is_synthetic = weather_source == "synthetic"

    return {
        "farm_id": str(farm.id),
        "farm_name": farm.farm_name,
        "district": farm.district,
        "gps_coordinates": {"latitude": lat, "longitude": lon},
        "data_source": "Synthetic climatology (NASA POWER unavailable)" if is_synthetic else "NASA POWER Satellite Reanalysis (Pure Software)",
        "data_quality": {"weather_source": weather_source, "is_synthetic": is_synthetic},
        "current_metrics": {
            "temperature_c": latest.get("t2m", 30.2),
            "humidity_pct": latest.get("rh2m", 66.4),
            "max_temperature_c": latest.get("t2m_max", 34.0),
            "min_temperature_c": latest.get("t2m_min", 24.1),
            "rainfall_mm": latest.get("prectotcorr", 0.0),
            "wind_speed_ms": latest.get("ws2m", 2.8),
            "vapour_pressure_deficit_kpa": round(0.61078 * (2.718 ** ((17.27 * latest.get("t2m", 30)) / (latest.get("t2m", 30) + 237.3))) * (1 - latest.get("rh2m", 66) / 100), 2),
        },
        "microclimate_status": _microclimate_status(latest),
    }


def _microclimate_status(latest: dict) -> str:
    """Plain-language summary derived from today's values (simple agronomic thresholds)."""
    rh = latest.get("rh2m")
    t_max = latest.get("t2m_max")
    rain = latest.get("prectotcorr") or 0.0
    if rh is None or t_max is None:
        return "Insufficient weather data for a microclimate summary."
    if rain >= 10:
        return "Recent heavy rain — watch for fungal disease and waterlogging."
    if rh >= 80:
        return "High humidity — favourable for fungal disease and sucking pests."
    if t_max >= 35 and rh < 50:
        return "Hot and dry — favourable for mites and thrips; check irrigation."
    return "No notable microclimate stress today."


@router.get("/outbreak/regional-grid")
async def get_regional_risk_grid(
    current_user: MongoUser = Depends(require_roles(["agronomist", "admin"]))
):
    """
    Returns 5km clustered regional risk grid overview across all registered zones.
    """
    farms = await MongoFarm.find().to_list()
    clusters = [
        {
            "cluster_id": "cluster_kovilpatti_01",
            "center_name": "Kovilpatti Rainfed Zone",
            "district": "Thoothukudi",
            "center_coordinates": [77.8710, 9.1728],
            "radius_km": 5.0,
            "active_farms": 12,
            "risk_level": "High",
            "dominant_threat": "Pink Bollworm (Pectinophora gossypiella)",
            "average_risk_score": 0.74,
            "alert_status": "Preemptive Neighbor Warning Dispatched"
        },
        {
            "cluster_id": "cluster_thanjavur_02",
            "center_name": "Thanjavur Delta Zone",
            "district": "Thanjavur",
            "center_coordinates": [79.1378, 10.7870],
            "radius_km": 5.0,
            "active_farms": 28,
            "risk_level": "Medium",
            "dominant_threat": "Brown Planthopper (Nilaparvata lugens)",
            "average_risk_score": 0.58,
            "alert_status": "Monitoring Active"
        },
        {
            "cluster_id": "cluster_coimbatore_03",
            "center_name": "Coimbatore Agro-Plateau",
            "district": "Coimbatore",
            "center_coordinates": [76.9558, 11.0168],
            "radius_km": 5.0,
            "active_farms": 19,
            "risk_level": "Low",
            "dominant_threat": "None (Sub-threshold)",
            "average_risk_score": 0.24,
            "alert_status": "Normal Operations"
        }
    ]

    return {
        "simulated": True,  # static demo clusters, not computed from live predictions
        "total_clusters": len(clusters),
        "high_risk_clusters": 1,
        "medium_risk_clusters": 1,
        "low_risk_clusters": 1,
        "clusters": clusters
    }


@router.get("/reports/regional")
async def generate_regional_report(
    range: str = Query("weekly", regex="^(daily|weekly|monthly)$"),
    current_user: MongoUser = Depends(require_roles(["agronomist", "admin"]))
):
    """
    Generates structured regional pest pressure and outbreak spread report.
    """
    region = getattr(current_user, "region_assigned", "Tamil Nadu Central Zone")
    return {
        "simulated": True,  # static demo report content
        "report_id": f"REP-{datetime.utcnow().strftime('%Y%m%d')}-{range.upper()}",
        "generated_by": current_user.name,
        "region": region,
        "time_horizon": {"daily": "Last 24 Hours", "weekly": "Last 7 Days", "monthly": "Last 30 Days"}[range],
        "generated_at": datetime.utcnow().isoformat(),
        "summary": {
            "total_farms_monitored": 59,
            "farms_at_high_risk": 7,
            "farms_at_medium_risk": 16,
            "threats_verified_by_experts": 24,
            "threat_override_rate": "4.2%",
        },
        "dominant_pests": [
            {"pest": "Pink Bollworm", "affected_crops": "Cotton", "incidence": "42%"},
            {"pest": "Brown Planthopper", "affected_crops": "Rice (Paddy)", "incidence": "28%"},
            {"pest": "Early Shoot Borer", "affected_crops": "Sugarcane", "incidence": "15%"},
        ],
        "climatic_drivers": "Elevated nighttime relative humidity combined with prolonged dry spells triggered localized nymph multiplication.",
        "recommended_policy_action": "Issue TNAU extension bulletin advising farmers to transition irrigation intervals to dawn and apply preventative neem foliar extract."
    }


@router.get("/advisories/farmer-requests")
async def list_farmer_support_requests(
    status_filter: Optional[Literal["pending", "resolved", "all"]] = Query("pending", alias="status"),
    limit: int = Query(50, ge=1, le=100),
    current_user: MongoUser = Depends(require_roles(["agronomist", "admin"]))
):
    """Lists farmer support requests (default: pending), newest first (contract item 9)."""
    query: Dict[str, Any] = {}
    if status_filter and status_filter != "all":
        query["status"] = status_filter
    requests = await MongoSupportRequest.find(query).sort(-MongoSupportRequest.created_at).limit(limit).to_list()

    farm_ids = list({r.farm_id for r in requests if r.farm_id})
    farm_map = {}
    if farm_ids:
        farms = await MongoFarm.find({"_id": {"$in": farm_ids}}).to_list()
        farm_map = {f.id: f for f in farms}

    return [
        {
            "id": str(r.id),
            "farmer_name": r.farmer_name,
            "farm_id": str(r.farm_id) if r.farm_id else None,
            "farm_name": farm_map[r.farm_id].farm_name if r.farm_id in farm_map else None,
            "district": r.district,
            "crop_type": r.crop_type,
            "question": r.query_text,
            "image_url": r.image_url,
            "created_at": r.created_at,
            "status": r.status,
            "response_text": r.response_text,
            "agronomist_name": r.agronomist_name,
            "responded_at": r.responded_at,
        }
        for r in requests
    ]


@router.post("/advisories/farmer-requests/{request_id}/respond")
async def respond_to_farmer_support(
    request_id: str,
    req: SupportResponseRequest,
    current_user: MongoUser = Depends(require_roles(["agronomist", "admin"]))
):
    """
    Responds to a farmer diagnostic query with expert-verified advisory instructions.
    """
    support_item = await MongoSupportRequest.get(parse_object_id(request_id, "Support request not found."))
    if not support_item:
        raise HTTPException(status_code=404, detail="Support request not found.")

    support_item.response_text = req.response_text
    support_item.responded_by = current_user.id
    support_item.agronomist_name = current_user.name
    support_item.responded_at = datetime.utcnow()
    support_item.status = "resolved"
    await support_item.save()

    return {
        "status": "success",
        "request_id": str(support_item.id),
        "farmer_name": support_item.farmer_name,
        "response_text": support_item.response_text,
        "responded_by": current_user.name,
        "responded_at": support_item.responded_at,
    }
