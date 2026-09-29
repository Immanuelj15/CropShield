"""
CropShield / AgriGuard — Farmer Scoped API Router
Handles farmer self-service crop intelligence:
- Registered farm profile
- Historical detection timeline
- Treatment logging (chemical & organic)
- Digital advisory search repository
- Regional community outbreak alerts
- Agronomist support diagnostic inquiries

Every route is scoped to the authenticated caller's own farm(s). There are no
"first farm in the DB" fallbacks: a user without a farm gets null / [] / 404.
"""
import re
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from backend.utils.auth_utils import (
    require_roles,
    get_current_user,
    get_owned_farm,
    get_user_primary_farm,
)
from backend.models.schemas import GeoJSONPoint, GeoJSONPolygon
from backend.models.user import User as MongoUser
from backend.models.farm import Farm as MongoFarm
from backend.models.pest_warning_log import PestWarningLog as MongoWarningLog
from backend.models.treatment import Treatment as MongoTreatment
from backend.models.advisory import PestDiseaseAdvisory as MongoAdvisory
from backend.models.alert import Alert as MongoAlert
from backend.models.support_request import SupportRequest as MongoSupportRequest

router = APIRouter(tags=["Farmer Crop Intelligence"])


class TreatmentCreateRequest(BaseModel):
    treatment_date: str = Field(..., max_length=32, example="2026-09-09")
    treatment_type: str = Field("organic", max_length=32, example="organic")  # "organic" | "chemical" | "biological"
    product_name: str = Field(..., min_length=1, max_length=200, example="NeemAzal T/S 1%")
    target_pest: str = Field(..., min_length=1, max_length=200, example="Cotton Aphids")
    dosage: Optional[str] = Field(None, max_length=200, example="2.5 ml / Litre")
    notes: Optional[str] = Field(None, max_length=2000, example="Applied across plot B with knapsack sprayer.")


class SupportRequestCreate(BaseModel):
    query_text: str = Field(..., min_length=5, max_length=4000, example="Leaves exhibit yellow mosaic spots with downward curling.")
    crop_type: str = Field("Cotton", max_length=100, example="Cotton")
    image_url: Optional[str] = Field(None, max_length=500)


def serialize_farm(f: MongoFarm) -> Dict[str, Any]:
    """Canonical farm shape (contract item 3). `id` / `_id` kept for backwards compatibility."""
    return {
        "farm_id": str(f.id),
        "id": str(f.id),
        "_id": str(f.id),
        "farm_name": f.farm_name,
        "owner_id": str(f.owner_id) if f.owner_id else None,
        "district": f.district,
        "climate_zone": getattr(f, "climate_zone", "Dryland"),
        "crop_type": f.crop_type,
        "soil_type": f.soil_type,
        "area_hectares": f.area_hectares,
        "water_availability": getattr(f, "water_availability", "Medium"),
        "location": f.location,
        "boundary_geojson": getattr(f, "boundary_geojson", None),
        "is_reference_point": getattr(f, "is_reference_point", False),
        "created_at": f.created_at,
    }


@router.get("/farms/me")
async def get_my_farm(
    current_user: MongoUser = Depends(require_roles(["farmer", "admin"]))
):
    """Returns the registered farm associated with the authenticated farmer (404 if none)."""
    farm = await get_user_primary_farm(current_user)
    if not farm:
        raise HTTPException(status_code=404, detail="No registered farm found for user.")
    return serialize_farm(farm)


@router.get("/farmer/profile")
async def get_farmer_profile(
    current_user: MongoUser = Depends(get_current_user)
):
    """Returns profile and the caller's own farm (or null) for auto-fill in Crop Recommendation and Planner."""
    farm = await get_user_primary_farm(current_user)
    return {
        "status": "success",
        "user": {
            "user_id": str(current_user.id),
            "email": current_user.email,
            "role": current_user.role,
            "full_name": current_user.name or current_user.email.split("@")[0],
        },
        "farm": serialize_farm(farm) if farm else None,
    }


class FarmCreateOrUpdateRequest(BaseModel):
    farm_name: str = Field(..., min_length=1, max_length=200, example="Kovilpatti North Field")
    district: str = Field("Thoothukudi", max_length=100, example="Thoothukudi")
    climate_zone: Optional[str] = Field("Dryland", max_length=100, example="Dryland")
    crop_type: Optional[str] = Field("Cotton", max_length=100, example="Cotton")
    soil_type: Optional[str] = Field("Black Cotton Soil", max_length=100, example="Black Cotton Soil")
    area_hectares: Optional[float] = Field(1.0, gt=0, le=100000, example=1.0)
    water_availability: Optional[str] = Field("Medium", max_length=20, example="Medium")
    location: Optional[GeoJSONPoint] = None  # GeoJSON Point [lon, lat]
    boundary_geojson: Optional[GeoJSONPolygon] = None  # GeoJSON Polygon (closed ring)


def _ring_centroid(boundary: GeoJSONPolygon) -> Dict[str, Any]:
    ring = boundary.coordinates[0][:-1] or boundary.coordinates[0]  # drop the closing vertex
    lon = sum(c[0] for c in ring) / len(ring)
    lat = sum(c[1] for c in ring) / len(ring)
    return {"type": "Point", "coordinates": [lon, lat]}


@router.get("/farms")
@router.get("/farmer/farms")
async def list_user_farms(
    limit: int = Query(100, ge=1, le=500),
    current_user: MongoUser = Depends(get_current_user)
):
    """Returns the caller's own farms (admins and agronomists see all farms). Never falls back to other users' farms."""
    if current_user.role in ("admin", "agronomist"):
        farms = await MongoFarm.find().limit(limit).to_list()
    else:
        farms = await MongoFarm.find(MongoFarm.owner_id == current_user.id).limit(limit).to_list()
        # Include an ownerless farm explicitly linked on the user record (seeded demo data)
        primary = await get_user_primary_farm(current_user)
        if primary and all(f.id != primary.id for f in farms):
            farms.insert(0, primary)
    return [serialize_farm(f) for f in farms]


@router.post("/farms", status_code=status.HTTP_201_CREATED)
async def create_user_farm(
    payload: FarmCreateOrUpdateRequest,
    current_user: MongoUser = Depends(require_roles(["farmer", "admin"]))
):
    """Creates a new registered farm (owned by the caller) with GPS centroid and boundary polygon."""
    if payload.location:
        location = payload.location.model_dump()
    elif payload.boundary_geojson:
        location = _ring_centroid(payload.boundary_geojson)
    else:
        location = {"type": "Point", "coordinates": [77.8710, 9.1728]}

    farm = MongoFarm(
        owner_id=current_user.id,
        farm_name=payload.farm_name,
        district=payload.district,
        climate_zone=payload.climate_zone or "Dryland",
        crop_type=payload.crop_type or "Cotton",
        soil_type=payload.soil_type or "Black Soil (Vertisol)",
        area_hectares=payload.area_hectares or 1.0,
        water_availability=payload.water_availability or "Medium",
        location=location,
        boundary_geojson=payload.boundary_geojson.model_dump() if payload.boundary_geojson else None,
    )
    await farm.insert()

    if not current_user.farm_id:
        current_user.farm_id = farm.id
        await current_user.save()

    return {
        "status": "success",
        "farm_id": str(farm.id),
        "farm": serialize_farm(farm),
    }


@router.put("/farms/{farm_id}")
async def update_user_farm(
    farm_id: str,
    payload: FarmCreateOrUpdateRequest,
    current_user: MongoUser = Depends(require_roles(["farmer", "admin"]))
):
    """Updates farm details, boundary polygon, or crop/soil configurations (owner or admin only)."""
    farm = await get_owned_farm(farm_id, current_user)

    # Only apply fields the client actually sent (defaults must not overwrite stored values)
    sent = payload.model_fields_set
    if "farm_name" in sent and payload.farm_name:
        farm.farm_name = payload.farm_name
    if "district" in sent and payload.district:
        farm.district = payload.district
    if "climate_zone" in sent and payload.climate_zone:
        farm.climate_zone = payload.climate_zone
    if "crop_type" in sent and payload.crop_type:
        farm.crop_type = payload.crop_type
    if "soil_type" in sent and payload.soil_type:
        farm.soil_type = payload.soil_type
    if "area_hectares" in sent and payload.area_hectares is not None:
        farm.area_hectares = payload.area_hectares
    if "water_availability" in sent and payload.water_availability:
        farm.water_availability = payload.water_availability
    if payload.boundary_geojson:
        farm.boundary_geojson = payload.boundary_geojson.model_dump()
        farm.location = _ring_centroid(payload.boundary_geojson)
    if payload.location:
        farm.location = payload.location.model_dump()

    await farm.save()
    return {
        "status": "success",
        "message": "Farm updated successfully.",
        "farm": serialize_farm(farm),
    }


@router.delete("/farms/{farm_id}")
async def delete_user_farm(
    farm_id: str,
    current_user: MongoUser = Depends(require_roles(["farmer", "admin"]))
):
    """Deletes a registered farm (owner or admin only)."""
    farm = await get_owned_farm(farm_id, current_user)

    await farm.delete()
    if current_user.farm_id and str(current_user.farm_id) == str(farm.id):
        current_user.farm_id = None
        await current_user.save()
    return {"status": "success", "message": f"Farm {farm_id} deleted."}


@router.get("/history/me")
async def get_my_history(
    limit: int = Query(20, ge=1, le=100),
    current_user: MongoUser = Depends(require_roles(["farmer", "admin"]))
):
    """Returns past risk predictions and diagnostic history for the caller's own farm."""
    farm = await get_user_primary_farm(current_user)
    if not farm:
        return {"farm_name": None, "district": None, "warnings": [], "total": 0}

    logs = await MongoWarningLog.find(
        MongoWarningLog.farm_id == farm.id
    ).sort(-MongoWarningLog.created_at).limit(limit).to_list()

    return {
        "farm_name": farm.farm_name,
        "district": farm.district,
        "total": len(logs),
        "warnings": [
            {
                "id": str(log.id),
                "date": log.date,
                "crop_type": log.crop_type,
                "risk_score": log.risk_score,
                "risk_level": log.risk_level,
                "model_version": log.model_version,
                "shap_explanation": log.shap_explanation,
                "counterfactual_prescription": log.counterfactual_prescription,
                "verified_by": str(log.verified_by) if log.verified_by else None,
                "verified_at": log.verified_at,
                "created_at": log.created_at,
            }
            for log in logs
        ]
    }


@router.get("/treatments")
async def list_my_treatments(
    limit: int = Query(100, ge=1, le=500),
    current_user: MongoUser = Depends(require_roles(["farmer", "admin"]))
):
    """Lists chemical and organic treatments logged by the caller (or on the caller's farm)."""
    treatments = await MongoTreatment.find(
        MongoTreatment.user_id == current_user.id
    ).sort(-MongoTreatment.created_at).limit(limit).to_list()

    if not treatments:
        # If none under user_id, check by the caller's own farm (never other users' data)
        farm = await get_user_primary_farm(current_user)
        if farm:
            treatments = await MongoTreatment.find(
                MongoTreatment.farm_id == farm.id
            ).sort(-MongoTreatment.created_at).limit(limit).to_list()

    return [
        {
            "id": str(t.id),
            "farm_id": str(t.farm_id),
            "treatment_date": t.treatment_date,
            "treatment_type": t.treatment_type,
            "product_name": t.product_name,
            "target_pest": t.target_pest,
            "dosage": t.dosage,
            "notes": t.notes,
            "created_at": t.created_at,
        }
        for t in treatments
    ]


@router.post("/treatments", status_code=status.HTTP_201_CREATED)
async def log_treatment(
    req: TreatmentCreateRequest,
    current_user: MongoUser = Depends(require_roles(["farmer", "admin"]))
):
    """Records a new pesticide or organic treatment application against the caller's own farm."""
    farm = await get_user_primary_farm(current_user)
    if not farm:
        raise HTTPException(status_code=404, detail="No registered farm found for user. Register a farm first.")

    treatment = MongoTreatment(
        farm_id=farm.id,
        user_id=current_user.id,
        treatment_date=req.treatment_date,
        treatment_type=req.treatment_type,
        product_name=req.product_name,
        target_pest=req.target_pest,
        dosage=req.dosage,
        notes=req.notes,
    )
    await treatment.insert()

    return {
        "status": "success",
        "message": "Treatment application logged successfully.",
        "treatment_id": str(treatment.id),
        "product_name": treatment.product_name,
        "date": treatment.treatment_date,
    }


@router.get("/advisories")
async def list_advisories(
    crop: Optional[str] = Query(None, max_length=100, description="Filter by crop name"),
    query: Optional[str] = Query(None, max_length=200, description="Search term for pest or symptoms"),
    limit: int = Query(50, ge=1, le=100),
):
    """Search and browse the public digital advisory repository by crop and pest."""
    q_filter = {}
    if crop and crop.lower() != "all":
        q_filter["crop_type"] = {"$regex": f"^{re.escape(crop)}", "$options": "i"}
    if query:
        safe_q = re.escape(query)
        q_filter["$or"] = [
            {"pest_or_disease": {"$regex": safe_q, "$options": "i"}},
            {"chemical_treatment": {"$regex": safe_q, "$options": "i"}},
            {"organic_treatment": {"$regex": safe_q, "$options": "i"}},
        ]

    advisories = await MongoAdvisory.find(q_filter).limit(limit).to_list()

    return [
        {
            "id": str(a.id),
            "pest_or_disease": a.pest_or_disease,
            "crop_type": a.crop_type,
            "season": a.season,
            "symptoms": a.symptoms,
            "chemical_treatment": a.chemical_treatment,
            "organic_treatment": a.organic_treatment,
            "prevention": a.prevention,
            "favorable_temp_range": f"{a.favorable_temp_min}°C – {a.favorable_temp_max}°C" if a.favorable_temp_min else "N/A",
            "favorable_humidity_range": f"{a.favorable_rh_min}% – {a.favorable_rh_max}%" if a.favorable_rh_min else "N/A",
        }
        for a in advisories
    ]


@router.get("/alerts/me")
async def get_my_alerts(
    current_user: MongoUser = Depends(require_roles(["farmer", "admin"]))
):
    """Returns active regional 5km risk-grid alerts for the caller's own farm ([] if none)."""
    farm = await get_user_primary_farm(current_user)
    alerts = []
    if farm:
        alerts = await MongoAlert.find(MongoAlert.farm_id == farm.id).sort(-MongoAlert.created_at).limit(10).to_list()

    return [
        {
            "id": str(a.id),
            "type": a.type,
            "message": a.message,
            "read": a.read,
            "created_at": a.created_at,
        }
        for a in alerts
    ]


@router.post("/support/requests", status_code=status.HTTP_201_CREATED)
async def submit_support_request(
    req: SupportRequestCreate,
    current_user: MongoUser = Depends(require_roles(["farmer", "admin"]))
):
    """Submits a diagnostic support inquiry to regional agronomists."""
    farm = await get_user_primary_farm(current_user)
    support = MongoSupportRequest(
        farmer_id=current_user.id,
        farmer_name=current_user.name,
        farmer_email=current_user.email,
        farm_id=farm.id if farm else None,
        district=farm.district if farm else (current_user.district or "Tamil Nadu"),
        crop_type=req.crop_type,
        query_text=req.query_text,
        image_url=req.image_url,
        status="pending",
    )
    await support.insert()
    return {
        "status": "submitted",
        "message": "Support request routed to regional agronomists.",
        "request_id": str(support.id),
    }


@router.get("/support/requests/me")
async def get_my_support_requests(
    current_user: MongoUser = Depends(require_roles(["farmer", "admin"]))
):
    """Lists submitted diagnostic queries and received agronomist responses."""
    requests = await MongoSupportRequest.find(
        MongoSupportRequest.farmer_id == current_user.id
    ).sort(-MongoSupportRequest.created_at).to_list()

    return [
        {
            "id": str(r.id),
            "crop_type": r.crop_type,
            "query_text": r.query_text,
            "status": r.status,
            "response_text": r.response_text,
            "agronomist_name": r.agronomist_name,
            "responded_at": r.responded_at,
            "created_at": r.created_at,
        }
        for r in requests
    ]
