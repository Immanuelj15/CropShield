"""
AgriGuard AI — Satellite Vegetation Health & Multi-Modal Fusion Router
Exposes Sentinel-2 NDVI vegetative vigor data and multi-modal fused health scores.

GET routes never write: when no stored snapshot exists the NDVI reading is computed
on the fly (non-blocking) and returned without persisting it. The NDVI ingestion job
is responsible for storing snapshots.
"""

from datetime import datetime
from typing import Optional, Dict, Any, Tuple
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from backend.models.farm import Farm as MongoFarm
from backend.models.user import User as MongoUser
from backend.models.vegetation_snapshot import VegetationSnapshot as MongoVegSnapshot
from backend.models.pest_warning_log import PestWarningLog as MongoWarningLog
from backend.models.disease_detection import DiseaseDetection as MongoDiseaseDetection
from backend.services.ndvi_service import derive_vegetation_status
from backend.services import ndvi_service
from backend.services.fusion_service import compute_fused_health_score
from backend.utils.auth_utils import get_current_user, get_owned_farm

router = APIRouter()


class VegetationStatusResponse(BaseModel):
    farm_id: str
    farm_name: str
    district: str
    date: str
    ndvi_value: float
    ndvi_trend: float
    cloud_cover_pct: float
    source: str
    image_date_actual: str
    status: str  # "healthy" | "stressed" | "declining"
    fused_health_score: Optional[Dict[str, Any]] = None
    persisted: bool = True  # False when computed on the fly (no stored snapshot yet)


def _farm_coords(farm: MongoFarm) -> Optional[Tuple[float, float]]:
    """Returns (lat, lon) from the farm's GeoJSON point, or None when missing/invalid."""
    loc = farm.location if isinstance(farm.location, dict) else None
    coords = (loc or {}).get("coordinates")
    if not coords or len(coords) < 2:
        return None
    try:
        return float(coords[1]), float(coords[0])
    except (TypeError, ValueError):
        return None


async def _fetch_ndvi(lat: float, lon: float) -> Dict[str, Any]:
    fetch_async = getattr(ndvi_service, "fetch_ndvi_for_farm_async", None)
    if fetch_async is not None:
        return (await fetch_async(lat=lat, lon=lon)) or {}
    import asyncio
    return (await asyncio.to_thread(ndvi_service.fetch_ndvi_for_farm, lat, lon)) or {}


async def _latest_or_live_snapshot(farm: MongoFarm) -> Tuple[Optional[MongoVegSnapshot], bool]:
    snap = await MongoVegSnapshot.find(
        MongoVegSnapshot.farm_id == farm.id
    ).sort(-MongoVegSnapshot.date).first_or_none()
    if snap:
        return snap, True
    coords = _farm_coords(farm)
    if coords is None:
        return None, False
    lat, lon = coords
    ndvi_data = await _fetch_ndvi(lat, lon)
    today_str = datetime.utcnow().strftime("%Y-%m-%d")
    # Unsaved snapshot object (no writes on GET)
    snap = MongoVegSnapshot(
        farm_id=farm.id,
        date=today_str,
        ndvi_value=ndvi_data.get("ndvi_value", 0.65),
        ndvi_trend=0.0,
        cloud_cover_pct=ndvi_data.get("cloud_cover_pct", 10.0),
        source=ndvi_data.get("source", "sentinel2"),
        image_date_actual=ndvi_data.get("image_date_actual", today_str),
        created_at=datetime.utcnow(),
    )
    return snap, False


@router.get(
    "/vegetation/{farm_id}",
    response_model=VegetationStatusResponse,
    summary="Get Satellite Vegetation Health & Fused Health Score",
    description="Returns the latest Sentinel-2 NDVI reading and multi-modal fused score for a farm."
)
async def get_farm_vegetation_status(
    farm_id: str,
    current_user: MongoUser = Depends(get_current_user),
):
    farm = await get_owned_farm(farm_id, current_user, allow_staff_read=True)

    # 1. Latest stored snapshot, else a live (unsaved) reading
    snap, persisted = await _latest_or_live_snapshot(farm)
    if snap is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Farm has no GPS location; vegetation data is unavailable.",
        )

    # 2. Derive vegetation status
    status_label = derive_vegetation_status(snap.ndvi_value, snap.ndvi_trend)

    # 3. Resolve multi-modal fused health score (read-only)
    latest_warning = await MongoWarningLog.find(
        MongoWarningLog.farm_id == farm.id
    ).sort(-MongoWarningLog.created_at).first_or_none()

    latest_disease = await MongoDiseaseDetection.find(
        MongoDiseaseDetection.farm_id == farm.id
    ).sort(-MongoDiseaseDetection.created_at).first_or_none()

    climate_risk = latest_warning.risk_score if latest_warning else 0.25
    # Only real model predictions count as an image signal (legacy heuristic rows carried a
    # fixed 0.924 confidence and are excluded).
    image_available = bool(
        latest_disease is not None
        and latest_disease.confidence is not None
        and latest_disease.model_name
        and abs(float(latest_disease.confidence) - 0.924) > 1e-9
    )
    fused_score = compute_fused_health_score(
        climate_risk_score=climate_risk,
        image_diagnosis_confidence=latest_disease.confidence if image_available else None,
        ndvi_value=snap.ndvi_value,
        image_predicted_class=latest_disease.predicted_class if image_available else None,
        image_model_available=image_available,
    )

    return VegetationStatusResponse(
        farm_id=str(farm.id),
        farm_name=farm.farm_name,
        district=farm.district,
        date=snap.date,
        ndvi_value=round(snap.ndvi_value, 4),
        ndvi_trend=round(snap.ndvi_trend or 0.0, 4),
        cloud_cover_pct=snap.cloud_cover_pct,
        source=snap.source,
        image_date_actual=snap.image_date_actual,
        status=status_label,
        fused_health_score=fused_score,
        persisted=persisted,
    )


@router.get(
    "/vegetation",
    summary="Get Vegetation Health Overview for Farms",
    description=(
        "Returns latest NDVI vegetation health readings for map overlay switching. "
        "Farmers see their own farms; agronomists/admins see all farms. Only stored snapshots "
        "are returned (farms without one are listed with ndvi_value=null)."
    ),
)
async def list_all_vegetation_statuses(
    limit: int = Query(500, ge=1, le=1000),
    current_user: MongoUser = Depends(get_current_user),
):
    if current_user.role in ("admin", "agronomist"):
        farms = await MongoFarm.find_all().limit(limit).to_list()
    else:
        farms = await MongoFarm.find(MongoFarm.owner_id == current_user.id).limit(limit).to_list()

    results = []
    for f in farms:
        coords = _farm_coords(f)
        if coords is None:
            continue
        lat, lon = coords
        snap = await MongoVegSnapshot.find(
            MongoVegSnapshot.farm_id == f.id
        ).sort(-MongoVegSnapshot.date).first_or_none()

        results.append({
            "farm_id": str(f.id),
            "farm_name": f.farm_name,
            "district": f.district,
            "crop_type": f.crop_type,
            "latitude": lat,
            "longitude": lon,
            "ndvi_value": round(snap.ndvi_value, 3) if snap else None,
            "ndvi_trend": round(snap.ndvi_trend or 0.0, 3) if snap else None,
            "status": derive_vegetation_status(snap.ndvi_value, snap.ndvi_trend) if snap else "unknown",
            "image_date_actual": snap.image_date_actual if snap else None,
        })

    return {"count": len(results), "vegetation_data": results}
