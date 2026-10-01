"""
CropShield / AgriGuard — Admin Scoped API Router
Platform governance, system configuration, and data management:
1. Pest & Disease Database Management (CRUD)
2. Farm Zone / GPS Registration Management (pure data entry — NO hardware/IoT)
3. User Account Management (role assignments, activation)
4. Alert Threshold Configuration (sensitivity, notification frequency)
5. Advisory & Treatment Upload (expert knowledge base)
6. External API Status Monitoring (NASA POWER API uptime & latency)
7. Reports & Analytics (platform-wide trends, vulnerable zones)
8. Model Management (retraining runs, version history)
"""
import asyncio
import logging
import time
from datetime import datetime
from typing import Optional, List, Dict, Any, Union, Literal
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
import httpx

from backend.utils.auth_utils import require_roles, hash_password, parse_object_id, MIN_PASSWORD_LENGTH
from backend.services import risk_thresholds as risk_thresholds_service
from backend.models.user import User as MongoUser
from backend.models.farm import Farm as MongoFarm
from backend.models.advisory import PestDiseaseAdvisory as MongoAdvisory
from backend.models.pest_warning_log import PestWarningLog as MongoWarningLog
from backend.models.retraining_log import RetrainingLog as MongoRetrainingLog
from backend.models.treatment import Treatment as MongoTreatment
from backend.models.alert import Alert as MongoAlert
from backend.models.job_run_log import JobRunLog as MongoJobRunLog
from backend.models.retry_queue import RetryQueue as MongoRetryQueue
from backend.services.geospatial_service import run_daily_prediction_pipeline_for_all_farms

logger = logging.getLogger("cropshield.admin_api")

router = APIRouter(prefix="/admin", tags=["Admin Platform Management"])

UserRoleLiteral = Literal["farmer", "agronomist", "admin"]


def _pest_model_benchmarks() -> Dict[str, Any]:
    """Real pest-model metrics from ml/training/saved_models/metrics.json (no invented numbers)."""
    import json
    from pathlib import Path
    from backend.utils.config import settings as _settings
    path = Path(_settings.MODEL_PATH).parent / "metrics.json"
    try:
        m = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        logger.warning("Could not read model metrics (%s): %s", path, e)
        return {"available": False, "message": "Model metrics file not found."}
    test = m.get("test_calibrated") or m.get("test_raw") or {}
    return {
        "available": True,
        "pest_warning_model": m.get("model_name"),
        "model_version": m.get("model_version"),
        "test_accuracy": test.get("accuracy", m.get("accuracy")),
        "test_f1_macro": test.get("f1_macro"),
        "test_f1_weighted": test.get("f1_weighted", m.get("f1_weighted")),
        "auc_roc": test.get("auc_ovr_weighted", m.get("auc_roc")),
        "majority_class_baseline_accuracy": m.get("majority_class_baseline_accuracy"),
        "calibration_method": m.get("calibration_method"),
        "label_source": m.get("label_source"),
        "interpretation": m.get("interpretation"),
        "trained_utc": m.get("trained_utc"),
        # The yield model is a formula over official TN state-average yields: it has no fitted R².
        "yield_model": "Official TN state-average yield x uncalibrated adjustment factors (no validated accuracy)",
    }


def _legacy_alert_thresholds() -> Dict[str, Any]:
    """Legacy /admin/alert-thresholds shape (0–1 fractions), backed by the persisted risk thresholds."""
    t = risk_thresholds_service.get_risk_thresholds()
    return {
        "high_risk_threshold": round(float(t["medium_max"]) / 100.0, 4),
        "medium_risk_threshold": round(float(t["low_max"]) / 100.0, 4),
        "haversine_cluster_radius_km": t.get("haversine_cluster_radius_km", 5.0),
        "notification_frequency_hours": t.get("notification_frequency_hours", 12),
        "preemptive_alert_enabled": t.get("preemptive_alert_enabled", True),
    }


# ── Schemas ───────────────────────────────────────────────────

class PestDiseaseCreate(BaseModel):
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


class FarmGPSRegister(BaseModel):
    farm_name: str = Field(..., min_length=1, max_length=200)
    owner_email: Optional[str] = Field(None, max_length=254)
    district: str = Field("Thoothukudi", max_length=100)
    climate_zone: str = Field("Dryland", max_length=100)  # "Delta" | "Dryland" | "Coastal" | "Hills"
    crop_type: str = Field("Cotton", max_length=100)
    soil_type: Optional[str] = Field("Black Soil (Vertisol)", max_length=100)
    area_hectares: float = Field(2.0, gt=0, le=100000)
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)


class UserCreateAdmin(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    email: str = Field(..., min_length=3, max_length=254)
    password: str = Field(..., min_length=MIN_PASSWORD_LENGTH, max_length=128)
    role: UserRoleLiteral = "farmer"
    phone: Optional[str] = Field(None, max_length=20)
    district: Optional[str] = Field("Coimbatore", max_length=100)
    region_assigned: Optional[str] = Field(None, max_length=100)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("A valid email address is required.")
        return v


class UserUpdateAdmin(BaseModel):
    name: Optional[str] = Field(None, max_length=150)
    role: Optional[UserRoleLiteral] = None
    is_active: Optional[bool] = None
    region_assigned: Optional[str] = Field(None, max_length=100)
    district: Optional[str] = Field(None, max_length=100)


class RiskThresholdsUpdate(BaseModel):
    """Risk score boundaries on a 0–100 scale (contract item 11)."""
    low_max: float = Field(..., gt=0, lt=100)
    medium_max: float = Field(..., gt=0, lt=100)


class ThresholdsUpdate(BaseModel):
    high_risk_threshold: Optional[float] = Field(None, ge=0.5, le=0.95)
    medium_risk_threshold: Optional[float] = Field(None, ge=0.2, le=0.6)
    haversine_cluster_radius_km: Optional[float] = Field(None, ge=1.0, le=25.0)
    notification_frequency_hours: Optional[int] = Field(None, ge=1, le=48)
    preemptive_alert_enabled: Optional[bool] = None


# ── 1. Pest & Disease Database Management ──────────────────────

@router.get("/pests-diseases")
async def list_pests_diseases(
    current_user: MongoUser = Depends(require_roles(["admin"]))
):
    """Admin: List all pest and disease records in knowledge base."""
    records = await MongoAdvisory.find().to_list()
    return [
        {
            "id": str(r.id),
            "pest_or_disease": r.pest_or_disease,
            "crop_type": r.crop_type,
            "season": r.season,
            "symptoms": r.symptoms,
            "chemical_treatment": r.chemical_treatment,
            "organic_treatment": r.organic_treatment,
            "prevention": r.prevention,
            "treatment_cost_per_acre": r.treatment_cost_per_acre,
            "treatment_effectiveness_pct": r.treatment_effectiveness_pct,
            "cost_source_note": r.cost_source_note,
            "created_at": r.created_at,
        }
        for r in records
    ]


@router.post("/pests-diseases", status_code=status.HTTP_201_CREATED)
async def create_pest_disease(
    req: PestDiseaseCreate,
    current_user: MongoUser = Depends(require_roles(["admin"]))
):
    """Admin: Add a new pest or disease record."""
    advisory = MongoAdvisory(
        pest_or_disease=req.pest_or_disease,
        crop_type=req.crop_type,
        season=req.season,
        symptoms=req.symptoms,
        chemical_treatment=req.chemical_treatment,
        organic_treatment=req.organic_treatment,
        prevention=req.prevention,
        favorable_temp_min=req.favorable_temp_min,
        favorable_temp_max=req.favorable_temp_max,
        favorable_rh_min=req.favorable_rh_min,
        favorable_rh_max=req.favorable_rh_max,
        treatment_cost_per_acre=req.treatment_cost_per_acre,
        treatment_effectiveness_pct=req.treatment_effectiveness_pct,
        cost_source_note=req.cost_source_note,
        uploaded_by=current_user.id,
    )
    await advisory.insert()
    return {"status": "success", "id": str(advisory.id), "pest": advisory.pest_or_disease}


@router.delete("/pests-diseases/{item_id}")
async def delete_pest_disease(
    item_id: str,
    current_user: MongoUser = Depends(require_roles(["admin"]))
):
    """Admin: Delete a pest or disease profile."""
    record = await MongoAdvisory.get(parse_object_id(item_id, "Record not found."))
    if not record:
        raise HTTPException(status_code=404, detail="Record not found.")
    await record.delete()
    return {"status": "deleted", "id": item_id}


# ── 2. Farm Zone / GPS Registration Management ─────────────────

@router.get("/farms")
async def list_registered_farms(
    current_user: MongoUser = Depends(require_roles(["admin", "agronomist"]))
):
    """Admin: List all GPS-registered farms (pure software)."""
    farms = await MongoFarm.find().to_list()
    return [
        {
            "id": str(f.id),
            "farm_id": str(f.id),
            "farm_name": f.farm_name,
            "owner_id": str(f.owner_id) if f.owner_id else None,
            "district": f.district,
            "climate_zone": f.climate_zone,
            "crop_type": f.crop_type,
            "soil_type": f.soil_type,
            "area_hectares": f.area_hectares,
            "gps_coordinates": {
                "latitude": f.location["coordinates"][1] if (f.location and f.location.get("coordinates")) else None,
                "longitude": f.location["coordinates"][0] if (f.location and f.location.get("coordinates")) else None,
            },
            "created_at": f.created_at,
        }
        for f in farms
    ]


@router.post("/farms", status_code=status.HTTP_201_CREATED)
async def register_farm_gps(
    req: FarmGPSRegister,
    current_user: MongoUser = Depends(require_roles(["admin"]))
):
    """
    Admin: Register a new farm zone via GPS coordinates.
    Pure software registration — no hardware sensors or physical setup.
    """
    owner = None
    if req.owner_email:
        owner = await MongoUser.find_one(MongoUser.email == req.owner_email.strip().lower())
        if not owner:
            raise HTTPException(status_code=404, detail="Owner account not found for owner_email.")
    # Without an owner_email the farm is an ownerless reference/zone farm (no notifications are sent for it).
    owner_id = owner.id if owner else None

    farm = MongoFarm(
        owner_id=owner_id,
        farm_name=req.farm_name,
        district=req.district,
        climate_zone=req.climate_zone,
        crop_type=req.crop_type,
        soil_type=req.soil_type,
        area_hectares=req.area_hectares,
        location={"type": "Point", "coordinates": [req.longitude, req.latitude]},
    )
    await farm.insert()

    if owner and not owner.farm_id:
        owner.farm_id = farm.id
        await owner.save()

    return {
        "status": "success",
        "farm_id": str(farm.id),
        "farm_name": farm.farm_name,
        "gps": {"latitude": req.latitude, "longitude": req.longitude},
        "district": farm.district,
    }


# ── 3. User Account Management ────────────────────────────────

@router.get("/users")
async def list_all_users(
    current_user: MongoUser = Depends(require_roles(["admin"]))
):
    """Admin: List all users across Farmer, Agronomist, and Admin roles."""
    users = await MongoUser.find().to_list()
    return [
        {
            "id": str(u.id),
            "name": u.name,
            "email": u.email,
            "role": u.role,
            "phone": u.phone,
            "district": u.district,
            "region_assigned": getattr(u, "region_assigned", None),
            "is_active": u.is_active,
            "farm_id": str(u.farm_id) if getattr(u, "farm_id", None) else None,
            "created_at": u.created_at,
        }
        for u in users
    ]


@router.post("/users", status_code=status.HTTP_201_CREATED)
async def create_user_admin(
    req: UserCreateAdmin,
    current_user: MongoUser = Depends(require_roles(["admin"]))
):
    """Admin: Create a new account with specified role."""
    existing = await MongoUser.find_one(MongoUser.email == req.email.lower())
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered.")

    new_user = MongoUser(
        name=req.name,
        email=req.email.lower(),
        password_hash=await asyncio.to_thread(hash_password, req.password),
        role=req.role,
        phone=req.phone,
        district=req.district,
        region_assigned=req.region_assigned,
        is_active=True,
    )
    await new_user.insert()

    return {"status": "created", "user_id": str(new_user.id), "email": new_user.email, "role": new_user.role}


@router.put("/users/{user_id}")
async def update_user_status(
    user_id: str,
    req: UserUpdateAdmin,
    current_user: MongoUser = Depends(require_roles(["admin"]))
):
    """Admin: Update user permissions, role, or active status."""
    target_user = await MongoUser.get(parse_object_id(user_id, "User not found."))
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found.")
    if target_user.id == current_user.id and (
        (req.is_active is False) or (req.role is not None and req.role != "admin")
    ):
        raise HTTPException(status_code=400, detail="Admins cannot deactivate or demote their own account.")

    if req.name is not None: target_user.name = req.name
    if req.role is not None: target_user.role = req.role
    if req.is_active is not None: target_user.is_active = req.is_active
    if req.region_assigned is not None: target_user.region_assigned = req.region_assigned
    if req.district is not None: target_user.district = req.district

    await target_user.save()
    return {"status": "updated", "user_id": user_id, "role": target_user.role, "is_active": target_user.is_active}


# ── 4. Alert Threshold Configuration ──────────────────────────

@router.get("/alert-thresholds")
async def get_alert_thresholds(
    current_user: MongoUser = Depends(require_roles(["admin"]))
):
    """Admin: View system-wide risk alert sensitivity thresholds (persisted; legacy 0–1 shape)."""
    return _legacy_alert_thresholds()


@router.put("/alert-thresholds")
async def update_alert_thresholds(
    req: ThresholdsUpdate,
    current_user: MongoUser = Depends(require_roles(["admin"]))
):
    """Admin: Configure risk score sensitivity and notification rules (persisted to MongoDB)."""
    updates: Dict[str, Any] = {}
    if req.high_risk_threshold is not None:
        updates["medium_max"] = req.high_risk_threshold * 100.0
    if req.medium_risk_threshold is not None:
        updates["low_max"] = req.medium_risk_threshold * 100.0
    if req.haversine_cluster_radius_km is not None:
        updates["haversine_cluster_radius_km"] = req.haversine_cluster_radius_km
    if req.notification_frequency_hours is not None:
        updates["notification_frequency_hours"] = req.notification_frequency_hours
    if req.preemptive_alert_enabled is not None:
        updates["preemptive_alert_enabled"] = req.preemptive_alert_enabled
    try:
        await risk_thresholds_service.save_risk_thresholds(updates, updated_by=current_user.email)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))

    return {
        "status": "updated",
        "updated_by": current_user.name,
        "current_thresholds": _legacy_alert_thresholds(),
    }


@router.get("/thresholds")
async def get_risk_thresholds_endpoint(
    current_user: MongoUser = Depends(require_roles(["admin"]))
):
    """Admin: Risk score boundaries (0–100): Low < low_max <= Medium < medium_max <= High."""
    t = risk_thresholds_service.get_risk_thresholds()
    return {"low_max": t["low_max"], "medium_max": t["medium_max"]}


@router.put("/thresholds")
async def update_risk_thresholds_endpoint(
    req: RiskThresholdsUpdate,
    current_user: MongoUser = Depends(require_roles(["admin"]))
):
    """Admin: Persist new risk score boundaries (0–100). Used by live inference immediately."""
    try:
        t = await risk_thresholds_service.save_risk_thresholds(
            {"low_max": req.low_max, "medium_max": req.medium_max}, updated_by=current_user.email
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    return {"low_max": t["low_max"], "medium_max": t["medium_max"]}


# ── 5. Advisory Content Upload ─────────────────────────────────

@router.post("/advisories", status_code=status.HTTP_201_CREATED)
async def upload_expert_advisory(
    req: PestDiseaseCreate,
    current_user: MongoUser = Depends(require_roles(["admin"]))
):
    """Admin: Upload or update official TNAU/ICAR crop advisories."""
    adv = MongoAdvisory(
        pest_or_disease=req.pest_or_disease,
        crop_type=req.crop_type,
        season=req.season,
        symptoms=req.symptoms,
        chemical_treatment=req.chemical_treatment,
        organic_treatment=req.organic_treatment,
        prevention=req.prevention,
        favorable_temp_min=req.favorable_temp_min,
        favorable_temp_max=req.favorable_temp_max,
        favorable_rh_min=req.favorable_rh_min,
        favorable_rh_max=req.favorable_rh_max,
        uploaded_by=current_user.id,
    )
    await adv.insert()
    return {"status": "published", "advisory_id": str(adv.id), "title": f"{adv.crop_type} - {adv.pest_or_disease}"}


# ── 6. External API Status Monitoring (NASA POWER) ────────────

@router.get("/api-status")
async def check_external_api_status(
    current_user: MongoUser = Depends(require_roles(["admin"]))
):
    """
    Admin: Real-time health monitor for NASA POWER satellite climate API.
    Pure software external integration monitor — no physical sensor nodes.
    """
    nasa_endpoint = "https://power.larc.nasa.gov/api/system/manager/version"
    status_label = "operational"
    latency_ms = None  # None = not measured (ping failed)

    try:
        t0 = time.time()
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(nasa_endpoint)
            latency_ms = round((time.time() - t0) * 1000, 1)
            if resp.status_code >= 400:
                status_label = "degraded"
    except Exception:
        # Ping failed (offline / timeout): report it honestly; predictions fall back to synthetic weather
        status_label = "unreachable"
        latency_ms = None

    # Fetch latest daily ingestion job log
    last_job = await MongoJobRunLog.find(
        MongoJobRunLog.job_name == "daily_ingestion_job"
    ).sort(-MongoJobRunLog.run_at).first_or_none()

    pending_retries = await MongoRetryQueue.find({"status": "pending"}).count()

    job_telemetry = None
    if last_job:
        job_telemetry = {
            "id": str(last_job.id),
            "run_at": last_job.run_at.isoformat() if last_job.run_at else None,
            "completed_at": last_job.completed_at.isoformat() if last_job.completed_at else None,
            "status": last_job.status,
            "duration_seconds": last_job.duration_seconds,
            "farms_processed": last_job.farms_processed,
            "success_count": last_job.success_count,
            "failed_count": last_job.failed_count,
            "failures": last_job.failures,
            "is_manual": last_job.is_manual,
        }

    return {
        "external_service": "NASA POWER Satellite Agroclimatology Reanalysis",
        "service_url": "power.larc.nasa.gov",
        "status": status_label,
        "latency_ms": latency_ms,
        "uptime_percentage": None,  # not tracked — no uptime history is recorded
        "last_sync_timestamp": datetime.utcnow().isoformat(),
        "temporal_coverage": "1980 – 2026 (Daily Point Reanalysis)",
        "spatial_resolution": "0.5° x 0.625° Global Grid",
        "monitoring_mode": "Pure Software REST API (No Hardware / No IoT)",
        "last_job_run": job_telemetry,
        "pending_retries_count": pending_retries,
    }


@router.post("/jobs/run-ingestion-now")
async def run_ingestion_now(
    current_user: MongoUser = Depends(require_roles(["admin"]))
):
    """
    Admin: Manual On-Demand Trigger for Daily Climate Ingestion across all 38 Tamil Nadu districts.
    Re-evaluates risk for all registered farms and updates weather snapshots and pest warning logs.
    """
    from backend.jobs.daily_ingestion_job import run_daily_ingestion_job
    try:
        report = await run_daily_ingestion_job(is_manual=True)
    except Exception:
        logger.exception("Manual daily ingestion run failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Daily ingestion run failed."
        )
    if isinstance(report, dict) and report.get("status") == "skipped":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=report.get("message") or "Another ingestion run is already in progress. Try again later.",
        )
    return {
        "status": "success",
        "message": f"Daily ingestion pipeline executed: {report.get('success_count', 0)}/{report.get('farms_processed', 0)} succeeded.",
        "report": report
    }



# ── 7. Platform Analytics & Vulnerability Metrics ─────────────

@router.get("/analytics")
async def get_platform_analytics(
    current_user: MongoUser = Depends(require_roles(["admin"]))
):
    """Admin: Platform-wide analytics on outbreaks, registered farms, and model metrics."""
    total_users = await MongoUser.count()
    total_farms = await MongoFarm.count()
    total_treatments = await MongoTreatment.count()
    total_advisories = await MongoAdvisory.count()
    total_alerts = await MongoAlert.count()

    # Live closed-loop counts
    unverified_pending = await MongoWarningLog.find(MongoWarningLog.verified_by == None).count()
    verified_samples = await MongoWarningLog.find(MongoWarningLog.verified_by != None).count()

    # Calculate live vulnerability by district from farms
    farms = await MongoFarm.find().to_list()
    dist_map = {}
    for f in farms:
        dist_map[f.district] = dist_map.get(f.district, 0) + 1

    vuln_list = [
        {"district": d, "risk_level": "High" if d == "Thoothukudi" else "Medium" if d == "Thanjavur" else "Low",
         "dominant_threat": "Pink Bollworm" if d == "Thoothukudi" else "Stem Borer" if d == "Thanjavur" else "Aphids",
         "farm_count": count}
        for d, count in dist_map.items()
    ]

    last_real_retrain = await MongoRetrainingLog.find(
        MongoRetrainingLog.status == "completed"
    ).sort(-MongoRetrainingLog.created_at).first_or_none()
    metrics = _pest_model_benchmarks()

    return {
        # Counts, model metrics (metrics.json) and retrain date are real; the district
        # vulnerability labels are static demo values (not computed from live predictions).
        "simulated": True,
        "simulated_sections": ["vulnerability_by_district"],
        "platform_summary": {
            "total_registered_users": total_users,
            "total_registered_farms": total_farms,
            "total_treatments_logged": total_treatments,
            "total_knowledge_advisories": total_advisories,
            "total_geospatial_alerts_dispatched": total_alerts,
        },
        "vulnerability_by_district": vuln_list or [
            {"district": "Thoothukudi", "risk_level": "High", "dominant_threat": "Pink Bollworm", "farm_count": 14},
            {"district": "Thanjavur", "risk_level": "Medium", "dominant_threat": "Brown Planthopper", "farm_count": 28},
            {"district": "Coimbatore", "risk_level": "Low", "dominant_threat": "Aphids (Sub-threshold)", "farm_count": 17},
        ],
        "model_performance_benchmarks": metrics,
        "retraining_feedback_status": {
            "agronomist_verified_samples": verified_samples,
            "pending_in_queue": unverified_pending,
            "last_retrain_date": (
                last_real_retrain.created_at.date().isoformat() if last_real_retrain else metrics.get("trained_utc")
            ),
        }
    }


# ── 8. Batch Predictions & Model Retraining Management ────────

@router.post("/run-daily-predictions")
async def trigger_daily_batch_predictions(
    current_user: MongoUser = Depends(require_roles(["admin"]))
):
    """
    Admin: Triggers the daily background prediction pipeline across all registered farms.
    Fetches NASA weather, predicts risk, writes to pest_warning_logs, and dispatches 5km alerts.
    """
    result = await run_daily_prediction_pipeline_for_all_farms()
    if isinstance(result, dict) and result.get("status") == "skipped":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=result.get("message") or "Another ingestion run is already in progress. Try again later.",
        )
    return {
        "status": "success",
        "message": f"Daily prediction pipeline executed across {result['total_farms_processed']} registered farm zones.",
        "details": result
    }


@router.post("/models/retrain")
async def trigger_model_retraining(
    current_user: MongoUser = Depends(require_roles(["admin"]))
):
    """
    Admin: SIMULATED retraining request. No model is retrained by this endpoint (training runs
    offline via ml/training/*). It records a RetrainingLog entry with status "simulated" and
    makes no accuracy-improvement claim.
    """
    now = datetime.utcnow()
    verified_count = await MongoWarningLog.find(MongoWarningLog.verified_by != None).count()

    log = MongoRetrainingLog(
        triggered_by=current_user.id,
        triggered_by_role="admin",
        model_name="xgboost_multicrop_v2",
        dataset_rows=0,
        verified_samples_ingested=verified_count,
        status="simulated",
        metrics={"simulated": True, "verified_samples_available": verified_count},
        notes=(
            f"Simulated retrain requested by Admin {current_user.name}; {verified_count} agronomist-verified "
            "samples available. No model was retrained and no metrics changed."
        ),
    )
    await log.insert()

    return {
        "status": "simulated",
        "simulated": True,
        "message": (
            "Retraining is simulated in this deployment: no model was retrained and accuracy is unchanged. "
            "Run the offline training pipeline (ml/training) to produce a new model."
        ),
        "model_name": "xgboost_multicrop_v2",
        "new_accuracy": None,
        "verified_feedback_samples_available": verified_count,
        "retraining_log_id": str(log.id),
        "timestamp": now.isoformat(),
    }


@router.get("/models/status")
async def get_model_history(
    current_user: MongoUser = Depends(require_roles(["admin"]))
):
    """Admin: Model version history and accuracy metrics."""
    logs = await MongoRetrainingLog.find().sort(-MongoRetrainingLog.created_at).limit(10).to_list()
    return [
        {
            "id": str(l.id),
            "model_name": l.model_name,
            "dataset_rows": l.dataset_rows,
            "verified_samples_ingested": l.verified_samples_ingested,
            "accuracy": l.accuracy,
            "auc_roc": l.auc_roc,
            "status": l.status,
            "simulated": l.status == "simulated" or bool((l.metrics or {}).get("simulated")),
            "notes": l.notes,
            "created_at": l.created_at,
        }
        for l in logs
    ]


# ── 9. Model Calibration Report ───────────────────────────────

@router.get("/model-calibration")
async def get_model_calibration_report(
    current_user: MongoUser = Depends(require_roles(["admin"]))
):
    """
    Admin: Returns the Platt-scaling calibration report including reliability diagram
    data (mean predicted confidence vs fraction actually correct per bin), Expected
    Calibration Error (ECE), Brier score, confidence bands, and methodology details.
    """
    from backend.services.calibration_service import get_calibration_report
    report = get_calibration_report()
    return report

