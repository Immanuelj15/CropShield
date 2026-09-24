"""
CropShield / AgriGuard — Smart Irrigation Recommendation API
FAO-56 Penman-Monteith / Hargreaves Crop Water Requirement Approach
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any

from backend.services.irrigation_service import get_irrigation_recommendation
from backend.models.crop_water_coefficient import CropWaterCoefficient

router = APIRouter()


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
