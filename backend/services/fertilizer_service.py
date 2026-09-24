"""
CropShield / AgriGuard — Fertilizer Recommendation Service (NPK)
Compares crop nutrient requirements (ICAR/TNAU standards) against available soil nutrients,
and converts nutrient deficits into actual commercial fertilizer product quantities.

Standard commercial fertilizer product concentrations:
- Urea: 46% Nitrogen (N)
- DAP (Di-Ammonium Phosphate): 18% Nitrogen (N), 46% Phosphorus (P2O5)
- MOP (Muriate of Potash / Potassium Chloride): 60% Potassium (K2O)
"""
import logging
from datetime import datetime
from typing import Optional, Dict, Any
from beanie import PydanticObjectId

from backend.models.farm import Farm
from backend.models.crop_nutrient_requirement import CropNutrientRequirement
from backend.services.soil_service import get_soil_profile

logger = logging.getLogger("cropshield.fertilizer")

# Standard fertilizer product nutrient contents (Fixed agronomic constants)
UREA_N_PCT = 0.46
DAP_N_PCT = 0.18
DAP_P_PCT = 0.46
MOP_K_PCT = 0.60

# Conversion factor: 1 hectare = 2.47105 acres -> 1 kg/ha = ~0.4047 kg/acre
HA_TO_ACRE_NUTRIENT_FACTOR = 0.4047


async def get_fertilizer_recommendation(farm_id: str) -> Dict[str, Any]:
    """
    Computes precise NPK fertilizer recommendation for a farm:
    1. Looks up crop nutrient requirements (ICAR / TNAU)
    2. Retrieves available soil nutrients (kg/ha) and converts to kg/acre
    3. Calculates elemental deficits (N, P, K)
    4. Computes commercial fertilizer bags / kg (Urea, DAP, MOP) accounting for DAP's dual N+P content
    5. Formulates split application schedule
    """
    farm_obj_id = PydanticObjectId(farm_id) if PydanticObjectId.is_valid(farm_id) else farm_id
    farm = await Farm.get(farm_obj_id)
    if not farm:
        raise ValueError(f"Farm not found with id: {farm_id}")

    crop_type = getattr(farm, "crop_type", "Cotton") or "Cotton"

    # 1. Fetch Crop Nutrient Requirement
    requirement = await CropNutrientRequirement.find_one(
        CropNutrientRequirement.crop_type == crop_type
    )
    if not requirement:
        # Fallback regex
        requirement = await CropNutrientRequirement.find_one(
            {"crop_type": {"$regex": f"^{crop_type}$", "$options": "i"}}
        )

    # If still not found, provide standard cash crop baseline
    if not requirement:
        n_req = 40.0
        p_req = 20.0
        k_req = 20.0
        splits = [
            {"stage": "Basal (at sowing)", "n_pct": 50.0, "p_pct": 100.0, "k_pct": 50.0, "days_after_sowing": 0},
            {"stage": "Top Dressing (Vegetative)", "n_pct": 50.0, "p_pct": 0.0, "k_pct": 50.0, "days_after_sowing": 35},
        ]
        source_note = "ICAR General Crop Nutrition Bulletin (Standard Cash Crop Dosage)"
    else:
        n_req = requirement.n_required_kg_per_acre
        p_req = requirement.p_required_kg_per_acre
        k_req = requirement.k_required_kg_per_acre
        splits = requirement.application_split
        source_note = requirement.source_note

    # 2. Retrieve Soil Nutrient Baseline
    climate_zone = getattr(farm, "climate_zone", "Dryland") or "Dryland"
    soil_profile = get_soil_profile(climate_zone)

    # Extract available nutrients (kg/ha)
    soil_n_ha = float(soil_profile.get("nitrogen", 220.0))
    soil_p_ha = float(soil_profile.get("phosphorus", 20.0))
    soil_k_ha = float(soil_profile.get("potassium", 190.0))

    # Convert available soil pool to kg/acre
    # Note: Only a fractional percentage of total soil reservoir is actively available to roots per season
    # Standard agronomic availability indices: ~10% for N, ~15% for P, ~12% for K
    n_avail_acre = round(soil_n_ha * HA_TO_ACRE_NUTRIENT_FACTOR * 0.12, 1)
    p_avail_acre = round(soil_p_ha * HA_TO_ACRE_NUTRIENT_FACTOR * 0.15, 1)
    k_avail_acre = round(soil_k_ha * HA_TO_ACRE_NUTRIENT_FACTOR * 0.12, 1)

    # 3. Calculate Deficits (kg/acre)
    n_deficit = max(0.0, round(n_req - n_avail_acre, 1))
    p_deficit = max(0.0, round(p_req - p_avail_acre, 1))
    k_deficit = max(0.0, round(k_req - k_avail_acre, 1))

    # 4. Convert Deficits into Commercial Fertilizer Products
    # DAP supplies all P deficit (at 46% P2O5)
    dap_kg_per_acre = round(p_deficit / DAP_P_PCT, 1) if p_deficit > 0 else 0.0
    # DAP also contributes 18% Nitrogen
    n_from_dap = dap_kg_per_acre * DAP_N_PCT
    remaining_n_deficit = max(0.0, n_deficit - n_from_dap)

    # Urea supplies the remaining Nitrogen deficit (at 46% N)
    urea_kg_per_acre = round(remaining_n_deficit / UREA_N_PCT, 1) if remaining_n_deficit > 0 else 0.0

    # MOP supplies Potassium deficit (at 60% K2O)
    mop_kg_per_acre = round(k_deficit / MOP_K_PCT, 1) if k_deficit > 0 else 0.0

    # Scale for entire farm plot
    area_acres = getattr(farm, "area_hectares", 1.0) * 2.47105
    total_urea_kg = round(urea_kg_per_acre * area_acres, 1)
    total_dap_kg = round(dap_kg_per_acre * area_acres, 1)
    total_mop_kg = round(mop_kg_per_acre * area_acres, 1)

    # Calculate 50kg standard bag counts
    urea_bags = round(total_urea_kg / 50.0, 1)
    dap_bags = round(total_dap_kg / 50.0, 1)
    mop_bags = round(total_mop_kg / 50.0, 1)

    # Format application schedule with actual product weights per stage
    application_schedule = []
    for s in splits:
        n_p = s.get("n_pct", 50.0) / 100.0
        p_p = s.get("p_pct", 100.0) / 100.0
        k_p = s.get("k_pct", 50.0) / 100.0
        application_schedule.append({
            "stage": s.get("stage", "Application"),
            "days_after_sowing": s.get("days_after_sowing", 0),
            "urea_kg_per_acre": round(urea_kg_per_acre * n_p, 1),
            "dap_kg_per_acre": round(dap_kg_per_acre * p_p, 1),
            "mop_kg_per_acre": round(mop_kg_per_acre * k_p, 1),
            "urea_total_kg": round(total_urea_kg * n_p, 1),
            "dap_total_kg": round(total_dap_kg * p_p, 1),
            "mop_total_kg": round(total_mop_kg * k_p, 1),
            "instructions": f"Apply {round(total_urea_kg * n_p, 1)}kg Urea + {round(total_dap_kg * p_p, 1)}kg DAP + {round(total_mop_kg * k_p, 1)}kg MOP",
        })

    reason_text = (
        f"For {crop_type} on your {soil_profile.get('soil_type', 'soil')}, "
        f"crop demands {n_req:.0f}-{p_req:.0f}-{k_req:.0f} kg/acre NPK. "
        f"Soil test yields {n_avail_acre:.1f}-{p_avail_acre:.1f}-{k_avail_acre:.1f} kg/acre available, "
        f"leaving net deficits of {n_deficit:.1f}kg N, {p_deficit:.1f}kg P, {k_deficit:.1f}kg K."
    )

    return {
        "farm_id": str(farm.id),
        "farm_name": getattr(farm, "farm_name", "Plot 1"),
        "crop_type": crop_type,
        "soil_type": soil_profile.get("soil_type", "Sandy Loam"),
        "farm_area_acres": round(area_acres, 2),
        "nutrient_comparison": {
            "nitrogen": {
                "required_kg_per_acre": n_req,
                "available_kg_per_acre": n_avail_acre,
                "deficit_kg_per_acre": n_deficit,
            },
            "phosphorus": {
                "required_kg_per_acre": p_req,
                "available_kg_per_acre": p_avail_acre,
                "deficit_kg_per_acre": p_deficit,
            },
            "potassium": {
                "required_kg_per_acre": k_req,
                "available_kg_per_acre": k_avail_acre,
                "deficit_kg_per_acre": k_deficit,
            },
        },
        "recommended_products_per_acre": {
            "urea_kg": urea_kg_per_acre,
            "dap_kg": dap_kg_per_acre,
            "mop_kg": mop_kg_per_acre,
        },
        "recommended_products_total_farm": {
            "urea_kg": total_urea_kg,
            "dap_kg": total_dap_kg,
            "mop_kg": total_mop_kg,
            "urea_bags_50kg": urea_bags,
            "dap_bags_50kg": dap_bags,
            "mop_bags_50kg": mop_bags,
        },
        "application_schedule": application_schedule,
        "source_note": source_note,
        "reason": reason_text,
        "evaluated_at": datetime.utcnow().isoformat(),
    }
