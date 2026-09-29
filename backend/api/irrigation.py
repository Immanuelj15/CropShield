"""
CropShield / AgriGuard — Smart Irrigation Recommendation API
FAO-56 Penman-Monteith / Hargreaves Crop Water Requirement Approach
"""
import logging
from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any, List
from pydantic import BaseModel, Field

from backend.services.irrigation_service import get_irrigation_recommendation
from backend.models.crop_water_coefficient import CropWaterCoefficient
from backend.models.user import User as MongoUser
from backend.utils.auth_utils import require_roles, get_owned_farm, parse_object_id

logger = logging.getLogger("cropshield.irrigation_api")

router = APIRouter()


class WaterCoefficientPayload(BaseModel):
    crop_type: str = Field(..., min_length=1, max_length=100, description="Crop name")
    growth_stages: List[Dict[str, Any]] = Field(..., max_length=20, description="Array of {stage_name, duration_days, kc}")
    source_note: str = Field(..., min_length=5, description="Mandatory citable reference (e.g. FAO-56 Table 12)")


@router.get("/irrigation/{farm_id}", response_model=Dict[str, Any])
async def get_irrigation_advisory(
    farm_id: str,
    current_user: MongoUser = Depends(require_roles(["farmer", "agronomist", "admin"])),
):
    """
    Returns real-time Smart Irrigation Recommendation for the specified farm plot:
    - Current FAO-56 growth stage & Kc coefficient
    - Hargreaves reference evapotranspiration (ET0)
    - Effective rainfall offset (USDA SCS method)
    - Net weekly irrigation need in mm and Liters/acre
    - Next recommended irrigation date & urgency rating
    """
    farm = await get_owned_farm(farm_id, current_user, allow_staff_read=True)
    try:
        return await get_irrigation_recommendation(str(farm.id))
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception:
        logger.exception("Irrigation calculation failed for farm %s", farm.id)
        raise HTTPException(status_code=500, detail="Irrigation calculation failed.")


@router.get("/irrigation/coefficients/all")
async def list_water_coefficients():
    """Returns all admin-managed FAO-56 crop water coefficients."""
    return await CropWaterCoefficient.find_all().to_list()


@router.post("/irrigation/coefficients")
async def create_or_update_water_coefficient(
    payload: WaterCoefficientPayload,
    current_user: MongoUser = Depends(require_roles(["admin"])),
):
    """Admin creates or updates a crop water coefficient rule."""
    if not payload.source_note or len(payload.source_note.strip()) < 5:
        raise HTTPException(status_code=400, detail="Mandatory citable source_note required (e.g. FAO-56 Table 12).")
    
    try:
        total_duration = sum(int(st.get("duration_days", 0)) for st in payload.growth_stages)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="growth_stages[].duration_days must be integers.")
    existing = await CropWaterCoefficient.find_one(CropWaterCoefficient.crop_type == payload.crop_type)
    if existing:
        existing.growth_stages = payload.growth_stages
        existing.total_duration_days = total_duration
        existing.source_note = payload.source_note
        await existing.save()
        return existing
    else:
        doc = CropWaterCoefficient(
            crop_type=payload.crop_type,
            growth_stages=payload.growth_stages,
            total_duration_days=total_duration,
            source_note=payload.source_note,
        )
        await doc.insert()
        return doc


@router.delete("/irrigation/coefficients/{coeff_id}")
async def delete_water_coefficient(
    coeff_id: str,
    current_user: MongoUser = Depends(require_roles(["admin"])),
):
    """Admin deletes a crop water coefficient document."""
    obj_id = parse_object_id(coeff_id, "Water coefficient not found.")
    doc = await CropWaterCoefficient.get(obj_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Water coefficient not found.")
    await doc.delete()
    return {"message": "Water coefficient deleted successfully."}
