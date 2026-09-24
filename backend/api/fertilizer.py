"""
CropShield / AgriGuard — Fertilizer Recommendation API (NPK)
Compares ICAR/TNAU crop nutrient requirements against soil test / SoilGrids profiles
and outputs actionable commercial fertilizer product quantities (Urea, DAP, MOP).
"""
from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List
from pydantic import BaseModel, Field
from beanie import PydanticObjectId

from backend.services.fertilizer_service import get_fertilizer_recommendation
from backend.models.crop_nutrient_requirement import CropNutrientRequirement

router = APIRouter()


class NutrientRequirementPayload(BaseModel):
    crop_type: str = Field(..., description="Crop name")
    n_required_kg_per_acre: float = Field(..., ge=0)
    p_required_kg_per_acre: float = Field(..., ge=0)
    k_required_kg_per_acre: float = Field(..., ge=0)
    application_split: List[Dict[str, Any]] = Field(default_factory=list)
    source_note: str = Field(..., min_length=5, description="Mandatory citable reference (e.g. ICAR Handbook / TNAU RDF Bulletin)")


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


@router.post("/fertilizer/requirements")
async def create_or_update_nutrient_requirement(payload: NutrientRequirementPayload):
    """Admin creates or updates a crop nutrient requirement."""
    if not payload.source_note or len(payload.source_note.strip()) < 5:
        raise HTTPException(status_code=400, detail="Mandatory citable source_note required (e.g. TNAU Guide 2024).")

    existing = await CropNutrientRequirement.find_one(CropNutrientRequirement.crop_type == payload.crop_type)
    if existing:
        existing.n_required_kg_per_acre = payload.n_required_kg_per_acre
        existing.p_required_kg_per_acre = payload.p_required_kg_per_acre
        existing.k_required_kg_per_acre = payload.k_required_kg_per_acre
        existing.application_split = payload.application_split
        existing.source_note = payload.source_note
        await existing.save()
        return existing
    else:
        doc = CropNutrientRequirement(
            crop_type=payload.crop_type,
            n_required_kg_per_acre=payload.n_required_kg_per_acre,
            p_required_kg_per_acre=payload.p_required_kg_per_acre,
            k_required_kg_per_acre=payload.k_required_kg_per_acre,
            application_split=payload.application_split,
            source_note=payload.source_note,
        )
        await doc.insert()
        return doc


@router.delete("/fertilizer/requirements/{req_id}")
async def delete_nutrient_requirement(req_id: str):
    """Admin deletes a crop nutrient requirement document."""
    obj_id = PydanticObjectId(req_id) if PydanticObjectId.is_valid(req_id) else req_id
    doc = await CropNutrientRequirement.get(obj_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Nutrient requirement not found.")
    await doc.delete()
    return {"message": "Nutrient requirement deleted successfully."}
