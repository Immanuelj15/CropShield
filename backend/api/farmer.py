"""
CropShield / AgriGuard — Farmer Scoped API Router
Handles farmer self-service crop intelligence:
- Registered farm profile
- Historical detection timeline
- Treatment logging (chemical & organic)
- Digital advisory search repository
- Regional community outbreak alerts
- Agronomist support diagnostic inquiries
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from backend.utils.auth_utils import require_roles, get_optional_current_user
from backend.models.user import User as MongoUser
from backend.models.farm import Farm as MongoFarm
from backend.models.pest_warning_log import PestWarningLog as MongoWarningLog
from backend.models.treatment import Treatment as MongoTreatment
from backend.models.advisory import PestDiseaseAdvisory as MongoAdvisory
from backend.models.alert import Alert as MongoAlert
from backend.models.support_request import SupportRequest as MongoSupportRequest
from beanie import PydanticObjectId

router = APIRouter(tags=["Farmer Crop Intelligence"])


class TreatmentCreateRequest(BaseModel):
    treatment_date: str = Field(..., example="2026-09-09")
    treatment_type: str = Field("organic", example="organic")  # "organic" | "chemical" | "biological"
    product_name: str = Field(..., example="NeemAzal T/S 1%")
    target_pest: str = Field(..., example="Cotton Aphids")
    dosage: Optional[str] = Field(None, example="2.5 ml / Litre")
    notes: Optional[str] = Field(None, example="Applied across plot B with knapsack sprayer.")


class SupportRequestCreate(BaseModel):
    query_text: str = Field(..., min_length=5, example="Leaves exhibit yellow mosaic spots with downward curling.")
    crop_type: str = Field("Cotton", example="Cotton")
    image_url: Optional[str] = None


@router.get("/farms/me")
async def get_my_farm(
    current_user: MongoUser = Depends(require_roles(["farmer", "admin"]))
):
    """Returns the registered farm associated with the authenticated farmer."""
    farm = None
    if current_user.farm_id:
        farm = await MongoFarm.get(current_user.farm_id)
    if not farm:
        farm = await MongoFarm.find_one(MongoFarm.owner_id == current_user.id)
    if not farm:
        # Fallback to Kovilpatti demo farm
        farm = await MongoFarm.find_one()

    if not farm:
        raise HTTPException(status_code=404, detail="No registered farm found for user.")

    return {
        "farm_id": str(farm.id),
        "farm_name": farm.farm_name,
        "owner_id": str(farm.owner_id),
        "district": farm.district,
        "climate_zone": farm.climate_zone,
        "crop_type": farm.crop_type,
        "soil_type": farm.soil_type,
        "area_hectares": farm.area_hectares,
        "location": farm.location,
        "created_at": farm.created_at,
    }


@router.get("/farmer/profile")
async def get_farmer_profile(
    current_user: Optional[MongoUser] = Depends(get_optional_current_user)
):
    """Returns profile and farm details for auto-fill in Crop Recommendation and Planner."""
    farm = None
    if current_user:
        if current_user.farm_id:
            farm = await MongoFarm.get(current_user.farm_id)
        if not farm:
            farm = await MongoFarm.find_one(MongoFarm.owner_id == current_user.id)
    if not farm:
        farm = await MongoFarm.find_one()

    farm_data = None
    if farm:
        farm_data = {
            "id": str(farm.id),
            "farm_name": farm.farm_name,
            "district": farm.district,
            "soil_type": farm.soil_type,
            "crop_type": farm.crop_type,
            "area_hectares": farm.area_hectares,
            "water_availability": getattr(farm, "water_availability", "Medium"),
            "climate_zone": getattr(farm, "climate_zone", "Southern Semi-Arid"),
        }

    return {
        "status": "success",
        "user": {
            "email": current_user.email,
            "role": current_user.role,
            "full_name": getattr(current_user, "full_name", current_user.email.split("@")[0]),
        } if current_user else None,
        "farm": farm_data,
    }


@router.get("/farms")
@router.get("/farmer/farms")
async def list_user_farms(
    current_user: Optional[MongoUser] = Depends(get_optional_current_user)
):
    """Returns available farms for the user or platform demo farm."""
    farms = []
    if current_user:
        farms = await MongoFarm.find(MongoFarm.owner_id == current_user.id).to_list()
    if not farms:
        farms = await MongoFarm.find().limit(20).to_list()

    return [
        {
            "id": str(f.id),
            "_id": str(f.id),
            "farm_name": f.farm_name,
            "owner_id": str(f.owner_id),
            "district": f.district,
            "crop_type": f.crop_type,
            "soil_type": f.soil_type,
            "area_hectares": f.area_hectares,
            "water_availability": getattr(f, "water_availability", "Medium"),
            "location": f.location,
        }
        for f in farms
    ]


@router.get("/history/me")
async def get_my_history(
    limit: int = Query(20, ge=1, le=100),
    current_user: MongoUser = Depends(require_roles(["farmer", "admin"]))
):
    """Returns past risk predictions and diagnostic history for farmer's farm."""
    farm = await MongoFarm.find_one(MongoFarm.owner_id == current_user.id) or await MongoFarm.find_one()
    if not farm:
        return {"warnings": [], "total": 0}

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
    current_user: MongoUser = Depends(require_roles(["farmer", "admin"]))
):
    """Lists all chemical and organic treatments logged by the farmer."""
    treatments = await MongoTreatment.find(
        MongoTreatment.user_id == current_user.id
    ).sort(-MongoTreatment.created_at).to_list()

    if not treatments:
        # If none under user_id, check by farm_id
        if current_user.farm_id:
            treatments = await MongoTreatment.find(
                MongoTreatment.farm_id == current_user.farm_id
            ).sort(-MongoTreatment.created_at).to_list()
        else:
            treatments = await MongoTreatment.find().sort(-MongoTreatment.created_at).limit(5).to_list()

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
    """Records a new pesticide or organic treatment application."""
    farm = await MongoFarm.find_one(MongoFarm.owner_id == current_user.id) or await MongoFarm.find_one()
    farm_id = farm.id if farm else current_user.farm_id or PydanticObjectId()

    treatment = MongoTreatment(
        farm_id=farm_id,
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
    crop: Optional[str] = Query(None, description="Filter by crop name"),
    query: Optional[str] = Query(None, description="Search term for pest or symptoms"),
):
    """Search and browse digital advisory repository by crop and pest."""
    q_filter = {}
    if crop and crop.lower() != "all":
        q_filter["crop_type"] = {"$regex": f"^{crop}", "$options": "i"}
    if query:
        q_filter["$or"] = [
            {"pest_or_disease": {"$regex": query, "$options": "i"}},
            {"chemical_treatment": {"$regex": query, "$options": "i"}},
            {"organic_treatment": {"$regex": query, "$options": "i"}},
        ]

    advisories = await MongoAdvisory.find(q_filter).limit(50).to_list()

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
    """Returns active regional 5km risk-grid alerts for the farmer's farm."""
    farm = await MongoFarm.find_one(MongoFarm.owner_id == current_user.id) or await MongoFarm.find_one()
    alerts = []
    if farm:
        alerts = await MongoAlert.find(MongoAlert.farm_id == farm.id).sort(-MongoAlert.created_at).limit(10).to_list()

    if not alerts:
        alerts = await MongoAlert.find().sort(-MongoAlert.created_at).limit(5).to_list()

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
    farm = await MongoFarm.find_one(MongoFarm.owner_id == current_user.id) or await MongoFarm.find_one()
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
