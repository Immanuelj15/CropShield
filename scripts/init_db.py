"""
CropShield — Database Initialization & Seeding (v2)
Updated for new schema: pest_warning_logs replaces pest_predictions.

Run: python -m scripts.init_db
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.db.database import engine, Base, SessionLocal
from backend.models.db_models import SoilProfile, PestReference, ClimateZone
from backend.services.soil_service import SOIL_PROFILES
from backend.services.pest_service import PEST_DATABASE


def init_db():
    print("Creating / updating database tables…")
    Base.metadata.create_all(bind=engine)
    print("✅ Tables ready.")


def seed_soil_profiles():
    db = SessionLocal()
    try:
        if db.query(SoilProfile).count() > 0:
            print("Soil profiles already seeded, skipping.")
            return
        for zone_name, profile in SOIL_PROFILES.items():
            try:
                zone_enum = ClimateZone(zone_name)
            except ValueError:
                continue
            for district in profile.get("districts", [zone_name]):
                db.add(SoilProfile(
                    location=district, district=district, climate_zone=zone_enum,
                    soil_type=profile["soil_type"], ph=profile["ph"], ec=profile["ec"],
                    organic_carbon=profile["organic_carbon"], nitrogen=profile["nitrogen"],
                    phosphorus=profile["phosphorus"], potassium=profile["potassium"],
                    sand_pct=profile["sand_pct"], silt_pct=profile["silt_pct"],
                    clay_pct=profile["clay_pct"], bulk_density=profile["bulk_density"],
                    field_capacity=profile["field_capacity"], year=2023,
                    source=profile["source"],
                ))
        db.commit()
        print(f"✅ Seeded {db.query(SoilProfile).count()} soil profiles.")
    finally:
        db.close()


def seed_pest_references():
    db = SessionLocal()
    try:
        if db.query(PestReference).count() > 0:
            print("Pest references already seeded, skipping.")
            return
        for crop, pests in PEST_DATABASE.items():
            for p in pests:
                db.add(PestReference(
                    pest_name=p["pest_name"], crop=crop, pest_type=p["pest_type"],
                    scientific_name=p.get("scientific_name", ""),
                    favorable_temp_min=p["favorable_temp_min"],
                    favorable_temp_max=p["favorable_temp_max"],
                    favorable_rh_min=p["favorable_rh_min"],
                    favorable_rh_max=p["favorable_rh_max"],
                    favorable_rain_threshold=p.get("favorable_rain_max_7d",
                                                    p.get("favorable_rain_min_7d", 0)),
                    dry_spell_days=p.get("dry_spell_days", 0),
                    description=p.get("description", ""),
                    symptoms=p.get("symptoms", ""),
                    management=p.get("management", ""),
                ))
        db.commit()
        print(f"✅ Seeded {db.query(PestReference).count()} pest references.")
    finally:
        db.close()


if __name__ == "__main__":
    print("=" * 52)
    print("  CropShield v2 — Database Setup")
    print("=" * 52)
    init_db()
    seed_soil_profiles()
    seed_pest_references()
    print("\n✅ Database setup complete.")
