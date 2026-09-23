"""
AgriGuard AI — Spatial Outbreak & "Draw-to-Scan" API Router
Generates Haversine distance-decay heatmaps and enables interactive Polygon
"Draw-to-Scan" queries across registered agricultural farms with MongoDB 2dsphere indexes.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime
from collections import Counter

from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, Field
from beanie import PydanticObjectId

from backend.models.farm import Farm as MongoFarm
from backend.models.pest_warning_log import PestWarningLog as MongoPestWarningLog
from backend.models.alert import Alert as MongoAlert
from backend.models.user import User as MongoUser
from backend.models.vegetation_snapshot import VegetationSnapshot as MongoVegetationSnapshot
from backend.services.ndvi_service import derive_vegetation_status
from backend.utils.auth_utils import get_optional_current_user, require_roles
from ml.spatial_outbreak.clustering import calculate_spatial_outbreak_risk, get_full_district_heatmap_data

router = APIRouter()


class SpatialRiskRequest(BaseModel):
    latitude: float = 9.1728
    longitude: float = 77.8710
    bandwidth_km: float = 50.0


class PolygonGeoJSON(BaseModel):
    type: str = "Polygon"
    coordinates: List[List[List[float]]] = Field(
        ...,
        description="GeoJSON LinearRing coordinate arrays [[[lon, lat], [lon, lat], ...]]"
    )


class BroadcastScanAdvisoryRequest(BaseModel):
    polygon: PolygonGeoJSON
    title: str = Field(..., description="Advisory headline")
    message: str = Field(..., description="Prescribed agronomic action or alert message")
    severity: str = Field("High", description="Severity level: High | Medium | Low")
    target_threat: Optional[str] = None


@router.get("/outbreak/heatmap")
def get_outbreak_heatmap():
    """Returns spatial points for Leaflet map heatmap rendering across Tamil Nadu."""
    return {
        "status": "success",
        "region": "Tamil Nadu, India",
        "points": get_full_district_heatmap_data()
    }


@router.post("/outbreak/spatial-risk")
def get_spatial_risk_prediction(req: SpatialRiskRequest):
    """Calculates proximity-weighted spatial outbreak risk for a given field coordinate."""
    return calculate_spatial_outbreak_risk(req.latitude, req.longitude, req.bandwidth_km)


@router.post("/outbreak/scan-area")
async def scan_drawn_area(
    req: PolygonGeoJSON,
    current_user: Optional[MongoUser] = Depends(get_optional_current_user)
):
    """
    Draw-to-Scan Spatial Aggregator:
    1. Validates GeoJSON Polygon ring closure.
    2. Runs $geoWithin query against MongoDB 2dsphere index on Farm.location.
    3. Caps query at 500 farms (returns HTTP 422 if exceeded).
    4. Aggregates latest pest warning logs, risk breakdown, and dominant threat with SHAP synthesis.
    """
    if not req.coordinates or not req.coordinates[0]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_POLYGON", "message": "Polygon coordinates must contain at least one ring."}
        )

    ring = req.coordinates[0]
    if len(ring) < 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_POLYGON", "message": "Polygon ring must have at least 4 coordinate pairs (first=last)."}
        )

    # Ensure ring is closed in GeoJSON standard
    if ring[0] != ring[-1]:
        ring.append(ring[0])

    poly_geometry = {
        "type": "Polygon",
        "coordinates": [ring]
    }

    # Query MongoDB 2dsphere index
    try:
        farms_in_area = await MongoFarm.find({
            "location": {
                "$geoWithin": {
                    "$geometry": poly_geometry
                }
            }
        }).to_list()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "GEOSPATIAL_QUERY_ERROR", "message": f"GeoJSON query failed: {str(e)}"}
        )

    # Check farm volume cap
    if len(farms_in_area) > 500:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "AREA_TOO_LARGE",
                "message": f"Selected area contains {len(farms_in_area)} farms (>500 maximum). Please zoom in and scan a smaller zone."
            }
        )

    if not farms_in_area:
        return {
            "status": "success",
            "farm_count": 0,
            "risk_breakdown": {"Low": 0, "Medium": 0, "High": 0},
            "farms": [],
            "dominant_threat": {
                "pest_or_disease": "Nil",
                "affected_farm_count": 0,
                "shap_summary": "No registered farms found in the selected boundary."
            }
        }

    farm_ids = [f.id for f in farms_in_area]

    # Retrieve recent warning logs for these farms
    logs = await MongoPestWarningLog.find(
        {"farm_id": {"$in": farm_ids}}
    ).sort(-MongoPestWarningLog.created_at).to_list()

    # Deduplicate to most recent log per farm
    latest_logs_by_farm: Dict[PydanticObjectId, MongoPestWarningLog] = {}
    for log in logs:
        if log.farm_id not in latest_logs_by_farm:
            latest_logs_by_farm[log.farm_id] = log

    # Retrieve recent vegetation snapshots for these farms
    veg_snapshots = await MongoVegetationSnapshot.find(
        {"farm_id": {"$in": farm_ids}}
    ).sort(-MongoVegetationSnapshot.date).to_list()
    latest_veg_by_farm: Dict[PydanticObjectId, MongoVegetationSnapshot] = {}
    for veg in veg_snapshots:
        if veg.farm_id not in latest_veg_by_farm:
            latest_veg_by_farm[veg.farm_id] = veg

    risk_breakdown = {"Low": 0, "Medium": 0, "High": 0}
    farms_output: List[Dict[str, Any]] = []
    pest_counts: Counter = Counter()
    shap_drivers: List[str] = []

    for farm in farms_in_area:
        log = latest_logs_by_farm.get(farm.id)
        if log:
            r_level = log.risk_level or "Low"
            threat_name = "Nil"
            if log.detected_pests:
                p0 = log.detected_pests[0]
                threat_name = p0.get("pest_name") if isinstance(p0, dict) else str(p0)
            elif r_level == "High":
                threat_name = f"{farm.crop_type} Major Threat"
            elif r_level == "Medium":
                threat_name = f"{farm.crop_type} Moderate Threat"

            if log.shap_explanation:
                top_f = log.shap_explanation[0]
                feat_name = top_f.get("feature", "Atmospheric factor")
                shap_drivers.append(feat_name)
        else:
            r_level = "Low"
            threat_name = "Optimal Canopy"

        risk_breakdown[r_level] = risk_breakdown.get(r_level, 0) + 1

        if threat_name not in ["Nil", "Optimal Canopy"]:
            pest_counts[threat_name] += 1

        veg = latest_veg_by_farm.get(farm.id)
        ndvi_val = veg.ndvi_value if veg else None
        ndvi_stat = derive_vegetation_status(ndvi_val, veg.ndvi_trend if veg else 0.0) if veg else "healthy"

        coords = farm.location.get("coordinates", [77.8710, 9.1728]) if isinstance(farm.location, dict) else [77.8710, 9.1728]
        farms_output.append({
            "farm_id": str(farm.id),
            "name": farm.farm_name,
            "location": coords,  # [lon, lat]
            "risk_level": r_level,
            "crop_type": farm.crop_type,
            "threat_name": threat_name,
            "ndvi_value": ndvi_val,
            "ndvi_status": ndvi_stat,
            "ndvi_trend": veg.ndvi_trend if veg else 0.0,
        })

    # Dominant threat computation
    if pest_counts:
        dominant_pest, affected_count = pest_counts.most_common(1)[0]
    else:
        dominant_pest = "Nil / Clean Canopy"
        affected_count = 0

    # SHAP synthesis
    if shap_drivers:
        common_driver = Counter(shap_drivers).most_common(1)[0][0]
        driver_readable = common_driver.replace("_", " ").title()
        shap_summary_text = (
            f"Primary regional risk driven by elevated {driver_readable} "
            f"impacting {affected_count} farms across the selected boundary."
        )
    else:
        shap_summary_text = "Microclimatic indicators within safe agronomic thresholds."

    return {
        "status": "success",
        "farm_count": len(farms_in_area),
        "risk_breakdown": risk_breakdown,
        "farms": farms_output,
        "dominant_threat": {
            "pest_or_disease": dominant_pest,
            "affected_farm_count": affected_count,
            "shap_summary": shap_summary_text
        }
    }


@router.post("/outbreak/scan-area/broadcast-advisory")
async def broadcast_scan_advisory(
    req: BroadcastScanAdvisoryRequest,
    current_user: MongoUser = Depends(require_roles(["agronomist", "admin"]))
):
    """
    Dispatches regional advisory alerts to all farm owners located inside the specified polygon.
    Guarded for Agronomists and Admins only.
    """
    ring = req.polygon.coordinates[0]
    if ring[0] != ring[-1]:
        ring.append(ring[0])

    poly_geometry = {
        "type": "Polygon",
        "coordinates": [ring]
    }

    farms_in_area = await MongoFarm.find({
        "location": {
            "$geoWithin": {
                "$geometry": poly_geometry
            }
        }
    }).to_list()

    if not farms_in_area:
        return {
            "status": "success",
            "notified_farms_count": 0,
            "message": "No registered farms found in the designated area to notify."
        }

    alert_docs = []
    for farm in farms_in_area:
        alert_msg = f"[{req.severity.upper()} REGIONAL ADVISORY] {req.title}: {req.message}"
        alert_docs.append(
            MongoAlert(
                farm_id=farm.id,
                type="regional_outbreak",
                message=alert_msg,
                read=False,
                created_at=datetime.utcnow()
            )
        )

    if alert_docs:
        await MongoAlert.insert_many(alert_docs)

    return {
        "status": "success",
        "notified_farms_count": len(alert_docs),
        "message": f"Regional advisory successfully dispatched to {len(alert_docs)} farms in the selected boundary."
    }
