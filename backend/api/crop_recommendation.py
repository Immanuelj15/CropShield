"""
CropShield / AgriGuard — Crop Recommendation & Pre-Season Decision Support API Router
Endpoints for generating crop suitability recommendations, profit ranges, and managing rules/cost templates.
"""
import csv
import logging
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Query, status, Depends
from pydantic import BaseModel, Field
from beanie import PydanticObjectId

from backend.models.crop_suitability import CropSuitabilityRule
from backend.models.crop_cost_template import CropCostTemplate
from backend.models.crop_recommendation import CropRecommendation
from backend.services.crop_recommendation_service import generate_crop_recommendations

logger = logging.getLogger("cropshield.crop_recommendation_api")

router = APIRouter(prefix="/crop-recommendation", tags=["AI Crop Recommendation & Profit Engine"])

ROOT_DIR = Path(__file__).resolve().parent.parent.parent


# ── Request / Response Schemas ──────────────────────────────────────────

class CropRecommendationRequest(BaseModel):
    farm_id: Optional[str] = None
    budget: float = Field(default=50000.0, ge=1000.0, description="Available cultivation budget in ₹")
    water_availability: Optional[str] = Field(default="Medium", description="Low | Medium | High")
    season: Optional[str] = Field(default=None, description="Kharif | Rabi | Summer")
    district: Optional[str] = None
    soil_type: Optional[str] = None
    land_area_acres: Optional[float] = Field(default=None, gt=0, description="Plot area in acres")


class CropSuitabilityRuleCreate(BaseModel):
    crop_type: str
    suitable_soil_types: List[str]
    water_requirement: str = "Medium"
    suitable_seasons: List[str]
    base_yield_per_acre_kg: float = 500.0
    yield_variance_pct: float = 20.0
    avoid_after_same_crop_seasons: int = 1
    source_note: str = Field(..., min_length=5, description="Citable source e.g. TNAU Agronomy Guide 2024")


class CropCostTemplateCreate(BaseModel):
    crop_type: str
    cost_breakdown_per_acre: Dict[str, float]
    total_cost_per_acre: float
    source_note: str = Field(..., min_length=5, description="Citable source e.g. CACP Cost of Cultivation")


# ── Recommendation Generation ─────────────────────────────────────────

@router.post("/generate", summary="Generate Ranked Pre-Season Crop Recommendations & Profit Ranges")
async def generate_recommendations(req: CropRecommendationRequest):
    """
    Evaluates candidate crops against farm soil, water tier, budget, and season.
    Returns top ranked crops with expected yield ranges, costs, revenue ranges, and profit ranges.
    """
    try:
        result = await generate_crop_recommendations(
            farm_id=req.farm_id,
            budget=req.budget,
            water_availability=req.water_availability,
            season=req.season,
            district=req.district,
            soil_type=req.soil_type,
            land_area_acres=req.land_area_acres,
        )
        return result
    except Exception as e:
        logger.error("Error generating crop recommendations: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Recommendation engine error: {str(e)}"
        )


@router.get("/history", summary="Get Recent Crop Recommendations History")
async def get_recommendation_history(
    farm_id: Optional[str] = None,
    limit: int = Query(default=10, le=50)
):
    """Retrieves previous recommendation runs for a farm or general history."""
    query = {}
    if farm_id:
        try:
            query["farm_id"] = PydanticObjectId(farm_id)
        except Exception:
            pass

    records = await CropRecommendation.find(query).sort(-CropRecommendation.generated_at).limit(limit).to_list()
    return records


# ── Presets & Demo Scenarios ──────────────────────────────────────────

@router.get("/demo-scenarios", summary="Get 10 Quick Demo Scenarios from Dataset")
async def get_demo_scenarios(limit: int = 10):
    """
    Loads sample scenarios from crop_recommendation_demo_scenarios_10000rows.csv
    for 1-click test simulation in the UI.
    """
    csv_path = ROOT_DIR / "crop_recommendation_demo_scenarios_10000rows.csv"
    scenarios = []
    if csv_path.exists():
        try:
            with open(csv_path, mode="r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                for i, row in enumerate(reader):
                    if i >= limit:
                        break
                    scenarios.append({
                        "scenario_id": row.get("scenario_id"),
                        "district": row.get("district"),
                        "soil_type": row.get("soil_type"),
                        "water_availability": row.get("water_availability"),
                        "season": row.get("season"),
                        "budget": float(row.get("budget", 50000)),
                        "land_area_acres": float(row.get("land_area_acres", 2.5)),
                        "recommended_crop": row.get("recommended_crop"),
                        "suitability_score": float(row.get("suitability_score", 85)),
                    })
        except Exception as e:
            logger.warning("Error reading demo scenarios CSV: %s", e)
    return scenarios


# ── Crop Suitability Rules CRUD (Admin Managed) ───────────────────────

@router.get("/rules", summary="List All Crop Suitability Rules")
async def list_suitability_rules():
    """Returns all 15 crop suitability rules with soil, water, and yield parameters."""
    rules = await CropSuitabilityRule.find_all().to_list()
    return rules


@router.post("/rules", status_code=status.HTTP_201_CREATED, summary="Create Crop Suitability Rule")
async def create_suitability_rule(payload: CropSuitabilityRuleCreate):
    """Creates a new crop suitability rule. source_note is mandatory."""
    if not payload.source_note or len(payload.source_note.strip()) < 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Valid source_note citation is required (e.g. TNAU Crop Production Guide / CACP Report)."
        )

    existing = await CropSuitabilityRule.find_one(CropSuitabilityRule.crop_type == payload.crop_type)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Suitability rule for '{payload.crop_type}' already exists. Use PUT to update."
        )

    rule = CropSuitabilityRule(
        crop_type=payload.crop_type,
        suitable_soil_types=payload.suitable_soil_types,
        water_requirement=payload.water_requirement,
        suitable_seasons=payload.suitable_seasons,
        base_yield_per_acre_kg=payload.base_yield_per_acre_kg,
        yield_variance_pct=payload.yield_variance_pct,
        avoid_after_same_crop_seasons=payload.avoid_after_same_crop_seasons,
        source_note=payload.source_note,
    )
    await rule.insert()
    return rule


@router.put("/rules/{rule_id}", summary="Update Crop Suitability Rule")
async def update_suitability_rule(rule_id: str, payload: CropSuitabilityRuleCreate):
    """Updates an existing crop suitability rule with verified source citation."""
    try:
        rule = await CropSuitabilityRule.get(PydanticObjectId(rule_id))
    except Exception:
        rule = None

    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found.")

    rule.crop_type = payload.crop_type
    rule.suitable_soil_types = payload.suitable_soil_types
    rule.water_requirement = payload.water_requirement
    rule.suitable_seasons = payload.suitable_seasons
    rule.base_yield_per_acre_kg = payload.base_yield_per_acre_kg
    rule.yield_variance_pct = payload.yield_variance_pct
    rule.avoid_after_same_crop_seasons = payload.avoid_after_same_crop_seasons
    rule.source_note = payload.source_note
    rule.updated_at = datetime.utcnow()
    await rule.save()
    return rule


@router.delete("/rules/{rule_id}", summary="Delete Crop Suitability Rule")
async def delete_suitability_rule(rule_id: str):
    """Deletes a crop suitability rule."""
    try:
        rule = await CropSuitabilityRule.get(PydanticObjectId(rule_id))
    except Exception:
        rule = None

    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found.")

    await rule.delete()
    return {"status": "deleted", "id": rule_id}


# ── Crop Cost Templates CRUD (Admin Managed) ──────────────────────────

@router.get("/cost-templates", summary="List All Crop Cost Templates")
async def list_cost_templates():
    """Returns cost templates per acre with seed, fertilizer, labor, irrigation breakdown."""
    templates = await CropCostTemplate.find_all().to_list()
    return templates


@router.post("/cost-templates", status_code=status.HTTP_201_CREATED, summary="Create Crop Cost Template")
async def create_cost_template(payload: CropCostTemplateCreate):
    """Creates a new cultivation cost template. source_note is mandatory."""
    if not payload.source_note or len(payload.source_note.strip()) < 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Valid source_note citation is required (e.g. CACP Cost of Cultivation Report)."
        )

    existing = await CropCostTemplate.find_one(CropCostTemplate.crop_type == payload.crop_type)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cost template for '{payload.crop_type}' already exists. Use PUT to update."
        )

    template = CropCostTemplate(
        crop_type=payload.crop_type,
        cost_breakdown_per_acre=payload.cost_breakdown_per_acre,
        total_cost_per_acre=payload.total_cost_per_acre,
        source_note=payload.source_note,
        last_updated=datetime.utcnow(),
    )
    await template.insert()
    return template


@router.put("/cost-templates/{template_id}", summary="Update Crop Cost Template")
async def update_cost_template(template_id: str, payload: CropCostTemplateCreate):
    """Updates an existing crop cost template."""
    try:
        template = await CropCostTemplate.get(PydanticObjectId(template_id))
    except Exception:
        template = None

    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cost template not found.")

    template.crop_type = payload.crop_type
    template.cost_breakdown_per_acre = payload.cost_breakdown_per_acre
    template.total_cost_per_acre = payload.total_cost_per_acre
    template.source_note = payload.source_note
    template.last_updated = datetime.utcnow()
    await template.save()
    return template


@router.delete("/cost-templates/{template_id}", summary="Delete Crop Cost Template")
async def delete_cost_template(template_id: str):
    """Deletes a crop cost template."""
    try:
        template = await CropCostTemplate.get(PydanticObjectId(template_id))
    except Exception:
        template = None

    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cost template not found.")

    await template.delete()
    return {"status": "deleted", "id": template_id}
