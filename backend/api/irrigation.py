"""
CropShield / AgriGuard — Smart Irrigation Recommendation API
FAO-56 Penman-Monteith / Hargreaves Crop Water Requirement Approach
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any, List
from pydantic import BaseModel, Field
from beanie import PydanticObjectId

from backend.services.irrigation_service import get_irrigation_recommendation
from backend.models.crop_water_coefficient import CropWaterCoefficient

router = APIRouter()


class WaterCoefficientPayload(BaseModel):
    crop_type: str = Field(..., description="Crop name")
    growth_stages: List[Dict[str, Any]] = Field(..., description="Array of {stage_name, duration_days, kc}")
    source_note: str = Field(..., min_length=5, description="Mandatory citable reference (e.g. FAO-56 Table 12)")


@router.get("/irrigation/{farm_id}", response_model=Dict[str, Any])
async def get_irrigation_advisory(farm_id: str):
    """
    Returns real-time Smart Irrigation Recommendation for the specified farm plot:
    - Current FAO-56 growth stage & Kc coefficient
    - Hargreaves reference evapotranspiration (ET0)
    - Effective rainfall offset (USDA SCS method)
    - Net weekly irrigation need in mm and Liters/acre
    - Next recommended irrigation date & urgency rating
    """
    try:
        return await get_irrigation_recommendation(farm_id)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Irrigation calculation failed: {str(e)}")


@router.get("/irrigation/coefficients/all")
async def list_water_coefficients():
    """Returns all admin-managed FAO-56 crop water coefficients."""
    return await CropWaterCoefficient.find_all().to_list()


@router.post("/irrigation/coefficients")
async def create_or_update_water_coefficient(payload: WaterCoefficientPayload):
    """Admin creates or updates a crop water coefficient rule."""
    if not payload.source_note or len(payload.source_note.strip()) < 5:
        raise HTTPException(status_code=400, detail="Mandatory citable source_note required (e.g. FAO-56 Table 12).")
    
    total_duration = sum(int(st.get("duration_days", 0)) for st in payload.growth_stages)
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
async def delete_water_coefficient(coeff_id: str):
    """Admin deletes a crop water coefficient document."""
    obj_id = PydanticObjectId(coeff_id) if PydanticObjectId.is_valid(coeff_id) else coeff_id
    doc = await CropWaterCoefficient.get(obj_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Water coefficient not found.")
    await doc.delete()
    return {"message": "Water coefficient deleted successfully."}
