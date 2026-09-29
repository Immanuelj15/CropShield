"""
CropShield / AgriGuard — Fertilizer Recommendation API (NPK)
Compares ICAR/TNAU crop nutrient requirements against soil test / SoilGrids profiles
and outputs actionable commercial fertilizer product quantities (Urea, DAP, MOP).
"""
import logging
from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any, List
from pydantic import BaseModel, Field

from backend.services.fertilizer_service import get_fertilizer_recommendation
from backend.models.crop_nutrient_requirement import CropNutrientRequirement
from backend.models.user import User as MongoUser
from backend.utils.auth_utils import require_roles, get_owned_farm, parse_object_id

logger = logging.getLogger("cropshield.fertilizer_api")

router = APIRouter()


class NutrientRequirementPayload(BaseModel):
    crop_type: str = Field(..., min_length=1, max_length=100, description="Crop name")
    n_required_kg_per_acre: float = Field(..., ge=0, le=10000)
    p_required_kg_per_acre: float = Field(..., ge=0, le=10000)
    k_required_kg_per_acre: float = Field(..., ge=0, le=10000)
    application_split: List[Dict[str, Any]] = Field(default_factory=list)
    source_note: str = Field(..., min_length=5, description="Mandatory citable reference (e.g. ICAR Handbook / TNAU RDF Bulletin)")


@router.get("/fertilizer/{farm_id}", response_model=Dict[str, Any])
async def get_fertilizer_advisory(
    farm_id: str,
    current_user: MongoUser = Depends(require_roles(["farmer", "agronomist", "admin"])),
):
    """
    Returns tailored NPK fertilizer recommendation for the specified farm plot:
    - Required vs Available vs Deficit (kg/acre)
    - Commercial product quantities: Urea (46% N), DAP (18% N, 46% P), MOP (60% K)
    - 50kg bag conversions for the entire plot
    - Split application calendar (Basal & Top dressings)
    """
    farm = await get_owned_farm(farm_id, current_user, allow_staff_read=True)
    try:
        return await get_fertilizer_recommendation(str(farm.id))
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception:
        logger.exception("Fertilizer calculation failed for farm %s", farm.id)
        raise HTTPException(status_code=500, detail="Fertilizer calculation failed.")


@router.get("/fertilizer/requirements/all")
async def list_nutrient_requirements():
    """Returns all admin-managed ICAR/TNAU crop nutrient requirements."""
    return await CropNutrientRequirement.find_all().to_list()


@router.post("/fertilizer/requirements")
async def create_or_update_nutrient_requirement(
    payload: NutrientRequirementPayload,
    current_user: MongoUser = Depends(require_roles(["admin"])),
):
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
async def delete_nutrient_requirement(
    req_id: str,
    current_user: MongoUser = Depends(require_roles(["admin"])),
):
    """Admin deletes a crop nutrient requirement document."""
    obj_id = parse_object_id(req_id, "Nutrient requirement not found.")
    doc = await CropNutrientRequirement.get(obj_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Nutrient requirement not found.")
    await doc.delete()
    return {"message": "Nutrient requirement deleted successfully."}
