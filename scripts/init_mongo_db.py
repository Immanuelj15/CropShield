"""
CropShield / AgriGuard — MongoDB Database Initialization & Seeding Script (v3)
Creates all 8 collections, ensures indexes (including 2dsphere & compound unique),
and seeds initial reference data, demo users, farms, and advisories.

Run: python -m scripts.init_mongo_db
"""

import sys
import asyncio
from pathlib import Path
from datetime import datetime

# Configure UTF-8 encoding for Windows terminals
if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.db.mongodb import init_mongodb, close_mongodb
from backend.models import (
    User,
    Farm,
    WeatherSnapshot,
    PestWarningLog,
    DiseaseDetection,
    RegionalRiskGrid,
    PestDiseaseAdvisory,
    Alert,
    Treatment,
    SupportRequest,
    RetrainingLog,
)

from backend.utils.auth_utils import hash_password
from backend.services.pest_service import PEST_DATABASE
from backend.services.soil_service import SOIL_PROFILES


async def seed_users():
    """Seed initial system users (Farmer, Agronomist, Admin)"""
    demo_users = [
        {
            "name": "Ramanathan Farmer",
            "email": "farmer@cropshield.org",
            "password_hash": hash_password("farmer123"),
            "role": "farmer",
            "phone": "+91 98401 12345",
            "district": "Thoothukudi",
            "location": {"type": "Point", "coordinates": [77.8710, 9.1728]},  # Kovilpatti [lon, lat]
            "is_active": True,
        },
        {
            "name": "Dr. V. Sundaram (Agronomist)",
            "email": "agronomist@cropshield.org",
            "password_hash": hash_password("agro123"),
            "role": "agronomist",
            "phone": "+91 94432 67890",
            "district": "Coimbatore",
            "region_assigned": "Coimbatore",
            "location": {"type": "Point", "coordinates": [76.9558, 11.0168]},
            "is_active": True,
        },
        {
            "name": "AgriGuard Administrator",
            "email": "admin@cropshield.org",
            "password_hash": hash_password("admin123"),
            "role": "admin",
            "phone": "+91 94444 00000",
            "district": "Chennai",
            "location": {"type": "Point", "coordinates": [80.2707, 13.0827]},
            "is_active": True,
        },
    ]

    created = 0
    for u in demo_users:
        existing = await User.find_one(User.email == u["email"])
        if not existing:
            user_doc = User(**u)
            await user_doc.insert()
            created += 1
        else:
            # Ensure region_assigned or role is updated
            if "region_assigned" in u and not existing.region_assigned:
                existing.region_assigned = u["region_assigned"]
                await existing.save()
    print(f"[OK] Users ready. ({created} newly created, total: {await User.count()})")


async def seed_farms():
    """Seed demo farms located in Tamil Nadu agro-climatic zones"""
    farmer = await User.find_one(User.email == "farmer@cropshield.org")
    if not farmer:
        return

    demo_farms = [
        {
            "owner_id": farmer.id,
            "farm_name": "Kovilpatti Black Soil Cotton Farm",
            "location": {"type": "Point", "coordinates": [77.8710, 9.1728]},  # Kovilpatti [lon, lat]
            "district": "Thoothukudi",
            "climate_zone": "Dryland",
            "crop_type": "Cotton",
            "soil_type": "Black Soil (Vertisol)",
            "area_hectares": 2.5,
        },
        {
            "owner_id": farmer.id,
            "farm_name": "Kayathar Neighbor Farm A",
            "location": {"type": "Point", "coordinates": [77.8920, 9.1850]},  # ~2.5 km away, within 5km grid
            "district": "Thoothukudi",
            "climate_zone": "Dryland",
            "crop_type": "Cotton",
            "soil_type": "Black Soil (Vertisol)",
            "area_hectares": 1.8,
        },
        {
            "owner_id": farmer.id,
            "farm_name": "Thanjavur Cauvery Delta Rice Farm",
            "location": {"type": "Point", "coordinates": [79.1378, 10.7870]},  # Thanjavur [lon, lat]
            "district": "Thanjavur",
            "climate_zone": "Delta",
            "crop_type": "Rice",
            "soil_type": "Alluvial Clay Loam",
            "area_hectares": 3.2,
        },
    ]

    created = 0
    first_farm_id = None
    for f in demo_farms:
        existing = await Farm.find_one(Farm.farm_name == f["farm_name"])
        if not existing:
            farm_doc = Farm(**f)
            await farm_doc.insert()
            created += 1
            if not first_farm_id:
                first_farm_id = farm_doc.id
        else:
            if not first_farm_id:
                first_farm_id = existing.id

    # Link farmer's farm_id
    if first_farm_id and (not farmer.farm_id or farmer.farm_id != first_farm_id):
        farmer.farm_id = first_farm_id
        await farmer.save()
        print(f"[OK] Linked farmer farm_id: {first_farm_id}")

    print(f"[OK] Farms ready. ({created} newly created, total: {await Farm.count()})")



async def seed_advisories():
    """Seed pest and disease knowledge base advisories"""
    count = 0
    for crop, pests in PEST_DATABASE.items():
        for p in pests:
            existing = await PestDiseaseAdvisory.find_one(
                PestDiseaseAdvisory.pest_or_disease == p["pest_name"],
                PestDiseaseAdvisory.crop_type == crop,
            )
            if not existing:
                advisory = PestDiseaseAdvisory(
                    pest_or_disease=p["pest_name"],
                    crop_type=crop,
                    season="All",
                    symptoms=[p.get("symptoms", "")],
                    chemical_treatment=p.get("management", ""),
                    organic_treatment="Neem oil extract 2% spray + biological predators",
                    prevention=p.get("description", ""),
                    favorable_temp_min=p.get("favorable_temp_min"),
                    favorable_temp_max=p.get("favorable_temp_max"),
                    favorable_rh_min=p.get("favorable_rh_min"),
                    favorable_rh_max=p.get("favorable_rh_max"),
                )
                await advisory.insert()
                count += 1
    print(f"[OK] Pest & Disease Advisories ready. ({count} newly seeded, total: {await PestDiseaseAdvisory.count()})")


async def seed_treatments_and_support():
    """Seed initial treatment log, support request, and retraining log"""
    farmer = await User.find_one(User.email == "farmer@cropshield.org")
    agronomist = await User.find_one(User.email == "agronomist@cropshield.org")
    admin = await User.find_one(User.email == "admin@cropshield.org")
    farm = await Farm.find_one(Farm.farm_name == "Kovilpatti Black Soil Cotton Farm")

    if farmer and farm and await Treatment.count() == 0:
        demo_treatments = [
            Treatment(
                farm_id=farm.id,
                user_id=farmer.id,
                treatment_date="2026-09-01",
                treatment_type="organic",
                product_name="NeemAzal T/S 1% (Azadirachtin)",
                target_pest="Cotton Aphids (Aphis gossypii)",
                dosage="2.5 ml / Litre",
                notes="Preventative foliar spray applied in early morning.",
            ),
            Treatment(
                farm_id=farm.id,
                user_id=farmer.id,
                treatment_date="2026-09-05",
                treatment_type="biological",
                product_name="Chrysoperla carnea predator release",
                target_pest="Pink Bollworm / Whiteflies",
                dosage="50,000 eggs / hectare",
                notes="Biocontrol agent release recommended by TNAU advisory.",
            ),
        ]
        for t in demo_treatments:
            await t.insert()
        print(f"[OK] Seeded {len(demo_treatments)} demo treatments.")

    if farmer and agronomist and await SupportRequest.count() == 0:
        req = SupportRequest(
            farmer_id=farmer.id,
            farmer_name=farmer.name,
            farmer_email=farmer.email,
            farm_id=farm.id if farm else None,
            district="Thoothukudi",
            crop_type="Cotton",
            query_text="Noticed slight yellowing on lower leaves and curled leaf tips on 2-month-old cotton. Need expert confirmation.",
            status="resolved",
            response_text="Symptoms indicate early stage Cotton Leaf Curl Virus or minor aphid sap sucking. Apply 2% neem extract and monitor for 48 hours.",
            responded_by=agronomist.id,
            agronomist_name=agronomist.name,
        )
        await req.insert()
        print("[OK] Seeded demo farmer support request.")

    if admin and await RetrainingLog.count() == 0:
        log = RetrainingLog(
            triggered_by=admin.id,
            triggered_by_role="admin",
            model_name="xgboost_multicrop_v2",
            dataset_rows=10000,
            verified_samples_ingested=24,
            accuracy=0.7845,
            auc_roc=0.7820,
            status="completed",
            metrics={"f1_weighted": 0.7220, "cv_score": 0.7274},
            notes="Initial training baseline on 10,000 multi-crop dataset with Wadhwani AI bollworm risk calibration.",
        )
        await log.insert()
        print("[OK] Seeded baseline model retraining log.")


async def inspect_indexes(db):
    """Inspect and report all created collection indexes"""
    collections = await db.list_collection_names()
    print("\n[INFO] MongoDB Collections & Index Status:")
    print("-" * 65)
    for col_name in sorted(collections):
        col = db[col_name]
        index_info = await col.index_information()
        doc_count = await col.count_documents({})
        idx_names = list(index_info.keys())
        print(f" * {col_name:<25} | Docs: {doc_count:<5} | Indexes ({len(idx_names)}): {', '.join(idx_names)}")
    print("-" * 65)


async def main():
    print("=" * 65)
    print("  AgriGuard / CropShield - MongoDB Setup & Initialization")
    print("=" * 65)
    db = await init_mongodb()
    print("Connected to MongoDB successfully.")

    await seed_users()
    await seed_farms()
    await seed_advisories()
    await seed_treatments_and_support()
    await inspect_indexes(db)

    await close_mongodb()
    print("\n[OK] MongoDB initialization and seed verification complete.")



if __name__ == "__main__":
    asyncio.run(main())
