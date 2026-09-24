"""
CropShield / AgriGuard — Crop Recommendation & Pre-Season Decision Support Seeder
Seeds the 15 real crops from CSV files into MongoDB:
- crop_suitability_rules_REAL_15crops.csv -> CropSuitabilityRule collection
- crop_cost_templates_REAL_15crops.csv -> CropCostTemplate collection
"""
import csv
import logging
from pathlib import Path
from datetime import datetime
from backend.models.crop_suitability import CropSuitabilityRule
from backend.models.crop_cost_template import CropCostTemplate

logger = logging.getLogger("cropshield.seed_crop_recommendation")

ROOT_DIR = Path(__file__).resolve().parent.parent.parent


async def seed_crop_recommendation_data(force: bool = False):
    """
    Seeds CropSuitabilityRule and CropCostTemplate collections from CSVs if empty or force=True.
    """
    suitability_csv = ROOT_DIR / "crop_suitability_rules_REAL_15crops.csv"
    cost_csv = ROOT_DIR / "crop_cost_templates_REAL_15crops.csv"

    # 1. Seed Suitability Rules
    rule_count = await CropSuitabilityRule.count()
    if rule_count == 0 or force:
        if suitability_csv.exists():
            logger.info("Seeding crop suitability rules from %s", suitability_csv)
            with open(suitability_csv, mode="r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    crop = row["crop_type"].strip()
                    soil_types = [s.strip() for s in row["suitable_soil_types"].split(",") if s.strip()]
                    seasons = [s.strip() for s in row["suitable_seasons"].split(",") if s.strip()]
                    water_req = row.get("water_requirement", "Medium").strip()
                    base_yield = float(row.get("base_yield_per_acre_kg", 500))
                    variance = float(row.get("yield_variance_pct", 20))
                    avoid_seasons = int(row.get("avoid_after_same_crop_seasons", 1))
                    source_note = row.get("source_note", "INDICATIVE - verify against TNAU guides").strip()

                    existing = await CropSuitabilityRule.find_one(CropSuitabilityRule.crop_type == crop)
                    if existing:
                        existing.suitable_soil_types = soil_types
                        existing.water_requirement = water_req
                        existing.suitable_seasons = seasons
                        existing.base_yield_per_acre_kg = base_yield
                        existing.yield_variance_pct = variance
                        existing.avoid_after_same_crop_seasons = avoid_seasons
                        existing.source_note = source_note
                        existing.updated_at = datetime.utcnow()
                        await existing.save()
                    else:
                        rule = CropSuitabilityRule(
                            crop_type=crop,
                            suitable_soil_types=soil_types,
                            water_requirement=water_req,
                            suitable_seasons=seasons,
                            base_yield_per_acre_kg=base_yield,
                            yield_variance_pct=variance,
                            avoid_after_same_crop_seasons=avoid_seasons,
                            source_note=source_note,
                        )
                        await rule.insert()
            logger.info("Crop suitability rules seeded successfully.")
        else:
            logger.warning("Suitability CSV not found at %s", suitability_csv)

    # 2. Seed Cost Templates
    cost_count = await CropCostTemplate.count()
    if cost_count == 0 or force:
        if cost_csv.exists():
            logger.info("Seeding crop cost templates from %s", cost_csv)
            with open(cost_csv, mode="r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    crop = row["crop_type"].strip()
                    seeds = float(row.get("seeds", 0))
                    fertilizer = float(row.get("fertilizer", 0))
                    labor = float(row.get("labor", 0))
                    irrigation = float(row.get("irrigation", 0))
                    pesticides = float(row.get("pesticides", 0))
                    total_cost = float(row.get("total_cost_per_acre", seeds + fertilizer + labor + irrigation + pesticides))
                    source_note = row.get("source_note", "INDICATIVE - verify against CACP reports").strip()

                    breakdown = {
                        "seeds": seeds,
                        "fertilizer": fertilizer,
                        "labor": labor,
                        "irrigation": irrigation,
                        "pesticides": pesticides,
                    }

                    existing = await CropCostTemplate.find_one(CropCostTemplate.crop_type == crop)
                    if existing:
                        existing.cost_breakdown_per_acre = breakdown
                        existing.total_cost_per_acre = total_cost
                        existing.source_note = source_note
                        existing.last_updated = datetime.utcnow()
                        await existing.save()
                    else:
                        template = CropCostTemplate(
                            crop_type=crop,
                            cost_breakdown_per_acre=breakdown,
                            total_cost_per_acre=total_cost,
                            source_note=source_note,
                        )
                        await template.insert()
            logger.info("Crop cost templates seeded successfully.")
        else:
            logger.warning("Cost CSV not found at %s", cost_csv)
