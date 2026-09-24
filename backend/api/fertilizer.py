"""
CropShield / AgriGuard — Fertilizer Recommendation API (NPK)
Compares ICAR/TNAU crop nutrient requirements against soil test / SoilGrids profiles
and outputs actionable commercial fertilizer product quantities (Urea, DAP, MOP).
"""
from fastapi import APIRouter, HTTPException
from typing import Dict, Any

from backend.services.fertilizer_service import get_fertilizer_recommendation
from backend.models.crop_nutrient_requirement import CropNutrientRequirement

router = APIRouter()


@router.get("/fertilizer/{farm_id}", response_model=Dict[str, Any])
async def get_fertilizer_advisory(farm_id: str):
    """
    Returns tailored NPK fertilizer recommendation for the specified farm plot:
    - Required vs Available vs Deficit (kg/acre)
    - Commercial product quantities: Urea (46% N), DAP (18% N, 46% P), MOP (60% K)
    - 50kg bag conversions for the entire plot
    - Split application calendar (Basal & Top dressings)
    """
    try:
        return await get_fertilizer_recommendation(farm_id)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Fertilizer calculation failed: {str(e)}")


@router.get("/fertilizer/requirements/all")
async def list_nutrient_requirements():
    """Returns all admin-managed ICAR/TNAU crop nutrient requirements."""
    return await CropNutrientRequirement.find_all().to_list()
