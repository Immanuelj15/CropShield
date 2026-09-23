"""
AgriGuard AI — Satellite Vegetation Health & Multi-Modal Fusion Router
Exposes Sentinel-2 NDVI vegetative vigor data and multi-modal fused health scores.
"""

from datetime import datetime, date
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, status, Query
from beanie import PydanticObjectId
from pydantic import BaseModel, Field

from backend.models.farm import Farm as MongoFarm
from backend.models.vegetation_snapshot import VegetationSnapshot as MongoVegSnapshot
from backend.models.pest_warning_log import PestWarningLog as MongoWarningLog
from backend.models.disease_detection import DiseaseDetection as MongoDiseaseDetection
from backend.services.ndvi_service import fetch_ndvi_for_farm, derive_vegetation_status
from backend.services.fusion_service import compute_fused_health_score

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


@router.get(
    "/vegetation/{farm_id}",
    response_model=VegetationStatusResponse,
    summary="Get Satellite Vegetation Health & Fused Health Score",
    description="Returns the latest Sentinel-2 NDVI reading and multi-modal fused score for a farm."
)
async def get_farm_vegetation_status(farm_id: str):
    try:
        f_id = PydanticObjectId(farm_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid farm ID format.")

    farm = await MongoFarm.get(f_id)
    if not farm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Farm not found.")

    # 1. Fetch latest stored snapshot
    snap = await MongoVegSnapshot.find(
        MongoVegSnapshot.farm_id == f_id
    ).sort(-MongoVegSnapshot.date).first_or_none()

    # 2. If no snapshot yet, perform real-time fetch & persist
    if not snap:
        coords = farm.location.get("coordinates", [78.0, 11.0])
        lon, lat = float(coords[0]), float(coords[1])
        ndvi_data = fetch_ndvi_for_farm(lat=lat, lon=lon)

        today_str = datetime.utcnow().strftime("%Y-%m-%d")
        snap = MongoVegSnapshot(
            farm_id=f_id,
            date=today_str,
            ndvi_value=ndvi_data.get("ndvi_value", 0.65),
            ndvi_trend=0.0,
            cloud_cover_pct=ndvi_data.get("cloud_cover_pct", 10.0),
            source=ndvi_data.get("source", "sentinel2"),
            image_date_actual=ndvi_data.get("image_date_actual", today_str),
            created_at=datetime.utcnow()
        )
        await snap.insert()

    # 3. Derive vegetation status
    status_label = derive_vegetation_status(snap.ndvi_value, snap.ndvi_trend)

    # 4. Resolve multi-modal fused health score
    latest_warning = await MongoWarningLog.find(
        MongoWarningLog.farm_id == f_id
    ).sort(-MongoWarningLog.created_at).first_or_none()

    latest_disease = await MongoDiseaseDetection.find(
        MongoDiseaseDetection.farm_id == f_id
    ).sort(-MongoDiseaseDetection.created_at).first_or_none()

    climate_risk = latest_warning.risk_score if latest_warning else 0.25
    disease_conf = latest_disease.confidence if (latest_disease and latest_disease.confidence) else None

    fused_score = compute_fused_health_score(
        climate_risk_score=climate_risk,
        image_diagnosis_confidence=disease_conf,
        ndvi_value=snap.ndvi_value
    )

    # Cache fused score on latest warning log if present
    if latest_warning and not latest_warning.fused_health_score:
        latest_warning.fused_health_score = fused_score
        await latest_warning.save()

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
        fused_health_score=fused_score
    )


@router.get(
    "/vegetation",
    summary="Get Vegetation Health Overview for All Farms",
    description="Returns latest NDVI vegetation health readings for all farms to support map overlay switching."
)
async def list_all_vegetation_statuses():
    farms = await MongoFarm.find_all().to_list()
    results = []

    for f in farms:
        snap = await MongoVegSnapshot.find(
            MongoVegSnapshot.farm_id == f.id
        ).sort(-MongoVegSnapshot.date).first_or_none()

        if not snap:
            coords = f.location.get("coordinates", [78.0, 11.0])
            ndvi_data = fetch_ndvi_for_farm(lat=float(coords[1]), lon=float(coords[0]))
            today_str = datetime.utcnow().strftime("%Y-%m-%d")
            snap = MongoVegSnapshot(
                farm_id=f.id,
                date=today_str,
                ndvi_value=ndvi_data.get("ndvi_value", 0.60),
                ndvi_trend=0.0,
                cloud_cover_pct=ndvi_data.get("cloud_cover_pct", 10.0),
                source=ndvi_data.get("source", "sentinel2"),
                image_date_actual=ndvi_data.get("image_date_actual", today_str),
                created_at=datetime.utcnow()
            )
            await snap.insert()

        status_label = derive_vegetation_status(snap.ndvi_value, snap.ndvi_trend)

        coords = f.location.get("coordinates", [78.0, 11.0])
        results.append({
            "farm_id": str(f.id),
            "farm_name": f.farm_name,
            "district": f.district,
            "crop_type": f.crop_type,
            "latitude": coords[1],
            "longitude": coords[0],
            "ndvi_value": round(snap.ndvi_value, 3),
            "ndvi_trend": round(snap.ndvi_trend or 0.0, 3),
            "status": status_label,
            "image_date_actual": snap.image_date_actual
        })

    return {"count": len(results), "vegetation_data": results}
