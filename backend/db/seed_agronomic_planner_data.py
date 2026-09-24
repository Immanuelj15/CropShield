"""
CropShield / AgriGuard — Agronomic Seed Data for Irrigation & Fertilizer
Seeds FAO-56 Crop Water Coefficients (Kc) and ICAR/TNAU Crop Nutrient Requirements
for 15 Tamil Nadu crops into MongoDB with complete idempotency and valid citable source notes.
"""
import logging
from typing import List, Dict, Any
from backend.models.crop_water_coefficient import CropWaterCoefficient
from backend.models.crop_nutrient_requirement import CropNutrientRequirement

logger = logging.getLogger("cropshield.seed_agronomic")

FAO56_CROP_WATER_COEFFICIENTS: List[Dict[str, Any]] = [
    {
        "crop_type": "Cotton",
        "growth_stages": [
            {"stage_name": "Initial", "duration_days": 30, "kc": 0.35},
            {"stage_name": "Development", "duration_days": 50, "kc": 0.75},
            {"stage_name": "Mid-season", "duration_days": 60, "kc": 1.15},
            {"stage_name": "Late-season", "duration_days": 40, "kc": 0.65},
        ],
        "source_note": "FAO Irrigation and Drainage Paper No. 56, Table 12; TNAU Agritech Portal 2024 (Cotton Water Mgmt)",
    },
    {
        "crop_type": "Rice",
        "growth_stages": [
            {"stage_name": "Initial", "duration_days": 20, "kc": 1.05},
            {"stage_name": "Development", "duration_days": 30, "kc": 1.15},
            {"stage_name": "Mid-season", "duration_days": 40, "kc": 1.20},
            {"stage_name": "Late-season", "duration_days": 30, "kc": 0.90},
        ],
        "source_note": "FAO Irrigation and Drainage Paper No. 56, Table 12; TNAU Rice Production Guide 2024",
    },
    {
        "crop_type": "Sorghum",
        "growth_stages": [
            {"stage_name": "Initial", "duration_days": 20, "kc": 0.30},
            {"stage_name": "Development", "duration_days": 35, "kc": 0.75},
            {"stage_name": "Mid-season", "duration_days": 40, "kc": 1.05},
            {"stage_name": "Late-season", "duration_days": 25, "kc": 0.55},
        ],
        "source_note": "FAO Irrigation and Drainage Paper No. 56, Table 12; ICAR Millet Bulletin 2024",
    },
    {
        "crop_type": "Millets",
        "growth_stages": [
            {"stage_name": "Initial", "duration_days": 15, "kc": 0.30},
            {"stage_name": "Development", "duration_days": 25, "kc": 0.70},
            {"stage_name": "Mid-season", "duration_days": 35, "kc": 1.00},
            {"stage_name": "Late-season", "duration_days": 20, "kc": 0.50},
        ],
        "source_note": "FAO Irrigation and Drainage Paper No. 56, Table 12; TNAU Small Millets Guide 2024",
    },
    {
        "crop_type": "Sugarcane",
        "growth_stages": [
            {"stage_name": "Initial", "duration_days": 35, "kc": 0.40},
            {"stage_name": "Development", "duration_days": 70, "kc": 0.85},
            {"stage_name": "Mid-season", "duration_days": 180, "kc": 1.25},
            {"stage_name": "Late-season", "duration_days": 75, "kc": 0.75},
        ],
        "source_note": "FAO Irrigation and Drainage Paper No. 56, Table 12; TNAU Sugarcane Production Guide 2024",
    },
    {
        "crop_type": "Pulses",
        "growth_stages": [
            {"stage_name": "Initial", "duration_days": 15, "kc": 0.40},
            {"stage_name": "Development", "duration_days": 25, "kc": 0.75},
            {"stage_name": "Mid-season", "duration_days": 30, "kc": 1.10},
            {"stage_name": "Late-season", "duration_days": 20, "kc": 0.55},
        ],
        "source_note": "FAO Irrigation and Drainage Paper No. 56, Table 12; TNAU Pulses Agritech Bulletin 2024",
    },
    {
        "crop_type": "Groundnut",
        "growth_stages": [
            {"stage_name": "Initial", "duration_days": 20, "kc": 0.40},
            {"stage_name": "Development", "duration_days": 30, "kc": 0.80},
            {"stage_name": "Mid-season", "duration_days": 45, "kc": 1.15},
            {"stage_name": "Late-season", "duration_days": 25, "kc": 0.60},
        ],
        "source_note": "FAO Irrigation and Drainage Paper No. 56, Table 12; TNAU Oilseeds Production Guide 2024",
    },
    {
        "crop_type": "Maize",
        "growth_stages": [
            {"stage_name": "Initial", "duration_days": 20, "kc": 0.35},
            {"stage_name": "Development", "duration_days": 35, "kc": 0.80},
            {"stage_name": "Mid-season", "duration_days": 40, "kc": 1.20},
            {"stage_name": "Late-season", "duration_days": 30, "kc": 0.60},
        ],
        "source_note": "FAO Irrigation and Drainage Paper No. 56, Table 12; ICAR Maize Directorate 2024",
    },
    {
        "crop_type": "Sesamum",
        "growth_stages": [
            {"stage_name": "Initial", "duration_days": 15, "kc": 0.35},
            {"stage_name": "Development", "duration_days": 25, "kc": 0.75},
            {"stage_name": "Mid-season", "duration_days": 30, "kc": 1.05},
            {"stage_name": "Late-season", "duration_days": 20, "kc": 0.45},
        ],
        "source_note": "FAO Irrigation and Drainage Paper No. 56, Table 12; TNAU Oilseeds Advisory 2024",
    },
    {
        "crop_type": "Sunflower",
        "growth_stages": [
            {"stage_name": "Initial", "duration_days": 20, "kc": 0.35},
            {"stage_name": "Development", "duration_days": 30, "kc": 0.75},
            {"stage_name": "Mid-season", "duration_days": 35, "kc": 1.15},
            {"stage_name": "Late-season", "duration_days": 25, "kc": 0.50},
        ],
        "source_note": "FAO Irrigation and Drainage Paper No. 56, Table 12; TNAU Sunflower Guide 2024",
    },
    {
        "crop_type": "Banana",
        "growth_stages": [
            {"stage_name": "Initial", "duration_days": 60, "kc": 0.50},
            {"stage_name": "Development", "duration_days": 90, "kc": 0.85},
            {"stage_name": "Mid-season", "duration_days": 150, "kc": 1.10},
            {"stage_name": "Late-season", "duration_days": 60, "kc": 1.00},
        ],
        "source_note": "FAO Irrigation and Drainage Paper No. 56, Table 12; ICAR-NRCB Banana Package 2024",
    },
    {
        "crop_type": "Turmeric",
        "growth_stages": [
            {"stage_name": "Initial", "duration_days": 30, "kc": 0.50},
            {"stage_name": "Development", "duration_days": 60, "kc": 0.85},
            {"stage_name": "Mid-season", "duration_days": 120, "kc": 1.15},
            {"stage_name": "Late-season", "duration_days": 60, "kc": 0.75},
        ],
        "source_note": "FAO Irrigation and Drainage Paper No. 56, Table 12; TNAU Spices Production Guide 2024",
    },
    {
        "crop_type": "Chili",
        "growth_stages": [
            {"stage_name": "Initial", "duration_days": 25, "kc": 0.40},
            {"stage_name": "Development", "duration_days": 35, "kc": 0.75},
            {"stage_name": "Mid-season", "duration_days": 60, "kc": 1.05},
            {"stage_name": "Late-season", "duration_days": 30, "kc": 0.80},
        ],
        "source_note": "FAO Irrigation and Drainage Paper No. 56, Table 12; TNAU Vegetable Crops Portal 2024",
    },
    {
        "crop_type": "Onion",
        "growth_stages": [
            {"stage_name": "Initial", "duration_days": 20, "kc": 0.50},
            {"stage_name": "Development", "duration_days": 35, "kc": 0.80},
            {"stage_name": "Mid-season", "duration_days": 45, "kc": 1.05},
            {"stage_name": "Late-season", "duration_days": 25, "kc": 0.75},
        ],
        "source_note": "FAO Irrigation and Drainage Paper No. 56, Table 12; TNAU Onion Production Guide 2024",
    },
    {
        "crop_type": "Coconut",
        "growth_stages": [
            {"stage_name": "Initial (Vegetative)", "duration_days": 90, "kc": 0.80},
            {"stage_name": "Development (Inflorescence)", "duration_days": 90, "kc": 0.85},
            {"stage_name": "Mid-season (Nut Development)", "duration_days": 90, "kc": 0.90},
            {"stage_name": "Late-season (Maturation)", "duration_days": 95, "kc": 0.80},
        ],
        "source_note": "FAO Irrigation and Drainage Paper No. 56, Table 12; ICAR-CPCRI Coconut Production Manual 2024",
    },
]

ICAR_TNAU_NUTRIENT_REQUIREMENTS: List[Dict[str, Any]] = [
    {
        "crop_type": "Cotton",
        "n_required_kg_per_acre": 48.0,
        "p_required_kg_per_acre": 24.0,
        "k_required_kg_per_acre": 24.0,
        "application_split": [
            {"stage": "Basal (at sowing)", "n_pct": 50.0, "p_pct": 100.0, "k_pct": 50.0, "days_after_sowing": 0},
            {"stage": "First Top Dressing (Square formation)", "n_pct": 25.0, "p_pct": 0.0, "k_pct": 0.0, "days_after_sowing": 45},
            {"stage": "Second Top Dressing (Boll development)", "n_pct": 25.0, "p_pct": 0.0, "k_pct": 50.0, "days_after_sowing": 75},
        ],
        "source_note": "TNAU Crop Production Guide 2024 - Cotton (Table 3.4 Fertilizer Schedule)",
    },
    {
        "crop_type": "Rice",
        "n_required_kg_per_acre": 60.0,
        "p_required_kg_per_acre": 20.0,
        "k_required_kg_per_acre": 20.0,
        "application_split": [
            {"stage": "Basal (transplanting)", "n_pct": 25.0, "p_pct": 100.0, "k_pct": 50.0, "days_after_sowing": 0},
            {"stage": "Active Tillering", "n_pct": 50.0, "p_pct": 0.0, "k_pct": 0.0, "days_after_sowing": 25},
            {"stage": "Panicle Initiation", "n_pct": 25.0, "p_pct": 0.0, "k_pct": 50.0, "days_after_sowing": 50},
        ],
        "source_note": "TNAU Crop Production Guide 2024 - Wetland Rice (Medium Duration)",
    },
    {
        "crop_type": "Sorghum",
        "n_required_kg_per_acre": 36.0,
        "p_required_kg_per_acre": 18.0,
        "k_required_kg_per_acre": 18.0,
        "application_split": [
            {"stage": "Basal (at sowing)", "n_pct": 50.0, "p_pct": 100.0, "k_pct": 100.0, "days_after_sowing": 0},
            {"stage": "Top Dressing (Knee-high)", "n_pct": 50.0, "p_pct": 0.0, "k_pct": 0.0, "days_after_sowing": 30},
        ],
        "source_note": "ICAR-IIMR Sorghum Agronomy Handbook 2024",
    },
    {
        "crop_type": "Millets",
        "n_required_kg_per_acre": 25.0,
        "p_required_kg_per_acre": 15.0,
        "k_required_kg_per_acre": 15.0,
        "application_split": [
            {"stage": "Basal (at sowing)", "n_pct": 50.0, "p_pct": 100.0, "k_pct": 100.0, "days_after_sowing": 0},
            {"stage": "Top Dressing (Tillering)", "n_pct": 50.0, "p_pct": 0.0, "k_pct": 0.0, "days_after_sowing": 25},
        ],
        "source_note": "TNAU Small Millets Guide 2024",
    },
    {
        "crop_type": "Sugarcane",
        "n_required_kg_per_acre": 110.0,
        "p_required_kg_per_acre": 25.0,
        "k_required_kg_per_acre": 45.0,
        "application_split": [
            {"stage": "Basal (planting)", "n_pct": 25.0, "p_pct": 100.0, "k_pct": 0.0, "days_after_sowing": 0},
            {"stage": "First Top Dressing (Tillering)", "n_pct": 25.0, "p_pct": 0.0, "k_pct": 50.0, "days_after_sowing": 45},
            {"stage": "Second Top Dressing", "n_pct": 25.0, "p_pct": 0.0, "k_pct": 0.0, "days_after_sowing": 90},
            {"stage": "Earthing-up", "n_pct": 25.0, "p_pct": 0.0, "k_pct": 50.0, "days_after_sowing": 120},
        ],
        "source_note": "TNAU Sugarcane Production Guide 2024",
    },
    {
        "crop_type": "Pulses",
        "n_required_kg_per_acre": 10.0,
        "p_required_kg_per_acre": 20.0,
        "k_required_kg_per_acre": 10.0,
        "application_split": [
            {"stage": "Basal (at sowing)", "n_pct": 100.0, "p_pct": 100.0, "k_pct": 100.0, "days_after_sowing": 0},
        ],
        "source_note": "TNAU Pulses Guide 2024 - Rhizobium bio-fertilized basal dosage",
    },
    {
        "crop_type": "Groundnut",
        "n_required_kg_per_acre": 15.0,
        "p_required_kg_per_acre": 30.0,
        "k_required_kg_per_acre": 30.0,
        "application_split": [
            {"stage": "Basal (at sowing)", "n_pct": 50.0, "p_pct": 100.0, "k_pct": 50.0, "days_after_sowing": 0},
            {"stage": "Pegging / Flowering", "n_pct": 50.0, "p_pct": 0.0, "k_pct": 50.0, "days_after_sowing": 40},
        ],
        "source_note": "TNAU Oilseeds Advisory 2024 (Groundnut with Gypsum supplement)",
    },
    {
        "crop_type": "Maize",
        "n_required_kg_per_acre": 55.0,
        "p_required_kg_per_acre": 25.0,
        "k_required_kg_per_acre": 20.0,
        "application_split": [
            {"stage": "Basal (at sowing)", "n_pct": 25.0, "p_pct": 100.0, "k_pct": 50.0, "days_after_sowing": 0},
            {"stage": "Knee-high Stage", "n_pct": 50.0, "p_pct": 0.0, "k_pct": 0.0, "days_after_sowing": 25},
            {"stage": "Tasseling / Silking", "n_pct": 25.0, "p_pct": 0.0, "k_pct": 50.0, "days_after_sowing": 50},
        ],
        "source_note": "ICAR-IIMR Maize Package of Practices 2024",
    },
    {
        "crop_type": "Sesamum",
        "n_required_kg_per_acre": 15.0,
        "p_required_kg_per_acre": 10.0,
        "k_required_kg_per_acre": 10.0,
        "application_split": [
            {"stage": "Basal (at sowing)", "n_pct": 50.0, "p_pct": 100.0, "k_pct": 100.0, "days_after_sowing": 0},
            {"stage": "Flowering Top Dressing", "n_pct": 50.0, "p_pct": 0.0, "k_pct": 0.0, "days_after_sowing": 30},
        ],
        "source_note": "TNAU Oilseeds Extension Manual 2024",
    },
    {
        "crop_type": "Sunflower",
        "n_required_kg_per_acre": 25.0,
        "p_required_kg_per_acre": 35.0,
        "k_required_kg_per_acre": 20.0,
        "application_split": [
            {"stage": "Basal (at sowing)", "n_pct": 50.0, "p_pct": 100.0, "k_pct": 50.0, "days_after_sowing": 0},
            {"stage": "Button Stage", "n_pct": 50.0, "p_pct": 0.0, "k_pct": 50.0, "days_after_sowing": 30},
        ],
        "source_note": "TNAU Sunflower Guide 2024",
    },
    {
        "crop_type": "Banana",
        "n_required_kg_per_acre": 110.0,
        "p_required_kg_per_acre": 30.0,
        "k_required_kg_per_acre": 140.0,
        "application_split": [
            {"stage": "3rd Month After Planting", "n_pct": 30.0, "p_pct": 100.0, "k_pct": 30.0, "days_after_sowing": 90},
            {"stage": "5th Month (Shooting prep)", "n_pct": 40.0, "p_pct": 0.0, "k_pct": 40.0, "days_after_sowing": 150},
            {"stage": "7th Month (Bunch development)", "n_pct": 30.0, "p_pct": 0.0, "k_pct": 30.0, "days_after_sowing": 210},
        ],
        "source_note": "ICAR-NRCB Banana Package 2024; TNAU Horticulture Guide",
    },
    {
        "crop_type": "Turmeric",
        "n_required_kg_per_acre": 50.0,
        "p_required_kg_per_acre": 25.0,
        "k_required_kg_per_acre": 40.0,
        "application_split": [
            {"stage": "Basal (at planting)", "n_pct": 30.0, "p_pct": 100.0, "k_pct": 30.0, "days_after_sowing": 0},
            {"stage": "First Top Dressing", "n_pct": 35.0, "p_pct": 0.0, "k_pct": 35.0, "days_after_sowing": 60},
            {"stage": "Rhizome Bulking", "n_pct": 35.0, "p_pct": 0.0, "k_pct": 35.0, "days_after_sowing": 120},
        ],
        "source_note": "ICAR-IISR Spices Manual 2024; TNAU Turmeric Advisory",
    },
    {
        "crop_type": "Chili",
        "n_required_kg_per_acre": 48.0,
        "p_required_kg_per_acre": 24.0,
        "k_required_kg_per_acre": 24.0,
        "application_split": [
            {"stage": "Basal (transplanting)", "n_pct": 30.0, "p_pct": 100.0, "k_pct": 30.0, "days_after_sowing": 0},
            {"stage": "Vegetative / First Flush", "n_pct": 35.0, "p_pct": 0.0, "k_pct": 35.0, "days_after_sowing": 35},
            {"stage": "Fruit Development", "n_pct": 35.0, "p_pct": 0.0, "k_pct": 35.0, "days_after_sowing": 70},
        ],
        "source_note": "TNAU Vegetable Crops Guide 2024 - Chili Fertilizer Doses",
    },
    {
        "crop_type": "Onion",
        "n_required_kg_per_acre": 35.0,
        "p_required_kg_per_acre": 25.0,
        "k_required_kg_per_acre": 30.0,
        "application_split": [
            {"stage": "Basal (at planting)", "n_pct": 50.0, "p_pct": 100.0, "k_pct": 50.0, "days_after_sowing": 0},
            {"stage": "Bulb Initiation", "n_pct": 25.0, "p_pct": 0.0, "k_pct": 25.0, "days_after_sowing": 30},
            {"stage": "Bulb Development", "n_pct": 25.0, "p_pct": 0.0, "k_pct": 25.0, "days_after_sowing": 45},
        ],
        "source_note": "TNAU Onion Production Guide 2024",
    },
    {
        "crop_type": "Coconut",
        "n_required_kg_per_acre": 45.0,
        "p_required_kg_per_acre": 25.0,
        "k_required_kg_per_acre": 90.0,
        "application_split": [
            {"stage": "Pre-Monsoon Split (May-June)", "n_pct": 50.0, "p_pct": 50.0, "k_pct": 50.0, "days_after_sowing": 90},
            {"stage": "Post-Monsoon Split (Sep-Oct)", "n_pct": 50.0, "p_pct": 50.0, "k_pct": 50.0, "days_after_sowing": 240},
        ],
        "source_note": "ICAR-CPCRI Coconut Production Manual 2024",
    },
]


async def seed_agronomic_planner_data():
    """Seeds FAO-56 crop water coefficients and ICAR/TNAU nutrient requirements."""
    try:
        # 1. Seed FAO-56 Crop Water Coefficients
        for item in FAO56_CROP_WATER_COEFFICIENTS:
            total_duration = sum(st["duration_days"] for st in item["growth_stages"])
            existing = await CropWaterCoefficient.find_one(CropWaterCoefficient.crop_type == item["crop_type"])
            if not existing:
                doc = CropWaterCoefficient(
                    crop_type=item["crop_type"],
                    growth_stages=item["growth_stages"],
                    total_duration_days=total_duration,
                    source_note=item["source_note"],
                )
                await doc.insert()
            else:
                # Update duration & citation if modified
                existing.growth_stages = item["growth_stages"]
                existing.total_duration_days = total_duration
                existing.source_note = item["source_note"]
                await existing.save()

        # 2. Seed ICAR/TNAU Nutrient Requirements
        for item in ICAR_TNAU_NUTRIENT_REQUIREMENTS:
            existing = await CropNutrientRequirement.find_one(CropNutrientRequirement.crop_type == item["crop_type"])
            if not existing:
                doc = CropNutrientRequirement(
                    crop_type=item["crop_type"],
                    n_required_kg_per_acre=item["n_required_kg_per_acre"],
                    p_required_kg_per_acre=item["p_required_kg_per_acre"],
                    k_required_kg_per_acre=item["k_required_kg_per_acre"],
                    application_split=item["application_split"],
                    source_note=item["source_note"],
                )
                await doc.insert()
            else:
                existing.n_required_kg_per_acre = item["n_required_kg_per_acre"]
                existing.p_required_kg_per_acre = item["p_required_kg_per_acre"]
                existing.k_required_kg_per_acre = item["k_required_kg_per_acre"]
                existing.application_split = item["application_split"]
                existing.source_note = item["source_note"]
                await existing.save()

        logger.info(f"Successfully seeded/updated {len(FAO56_CROP_WATER_COEFFICIENTS)} FAO-56 water coefficients and {len(ICAR_TNAU_NUTRIENT_REQUIREMENTS)} nutrient requirements.")
    except Exception as e:
        logger.warning(f"Error seeding agronomic planner data: {e}")
