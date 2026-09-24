"""
CropShield / AgriGuard — Script to Seed Real FAO-56 Crop Water Coefficients
Reads crop_water_coefficients_REAL_FAO56.csv and seeds the crop_water_coefficients
MongoDB collection with 4-stage growth_stages array and citable source notes.

Approximated Crops:
Millets, Pulses, and Turmeric are tagged with:
" [APPROXIMATED from nearest FAO-56 category - needs verification]"
"""
import os
import sys
import csv
import asyncio
import logging
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.db.mongodb import init_mongodb, close_mongodb
from backend.models.crop_water_coefficient import CropWaterCoefficient

logger = logging.getLogger("cropshield.seed_kc")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

APPROXIMATED_CROPS = ["Millets", "Pulses", "Turmeric"]


async def seed_from_csv(csv_path: str = "crop_water_coefficients_REAL_FAO56.csv"):
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"CSV file not found at: {csv_path}")

    logger.info("Initializing MongoDB connection for FAO-56 Kc seeding...")
    await init_mongodb()

    seeded_count = 0
    updated_count = 0

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            crop_type = row["crop_type"].strip()
            kc_ini = float(row["kc_ini"])
            kc_mid = float(row["kc_mid"])
            kc_end = float(row["kc_end"])
            source_note = row["source"].strip()

            # Append approximation flag for non-exact crops
            if crop_type in APPROXIMATED_CROPS and "[APPROXIMATED" not in source_note:
                source_note += " [APPROXIMATED from nearest FAO-56 category - needs verification]"

            # Construct 4-stage growth_stages array
            # Note: duration_days (20, 30, 40, 25) are standard representative stage timings;
            # FAO-56 Table 11 provides regional duration breakdowns per climate zone.
            growth_stages = [
                {
                    "stage_name": "Initial",
                    "duration_days": 20,
                    "kc": round(kc_ini, 2),
                },
                {
                    "stage_name": "Development",
                    "duration_days": 30,
                    "kc": round((kc_ini + kc_mid) / 2.0, 2),
                },
                {
                    "stage_name": "Mid-season",
                    "duration_days": 40,
                    "kc": round(kc_mid, 2),
                },
                {
                    "stage_name": "Late-season",
                    "duration_days": 25,
                    "kc": round((kc_mid + kc_end) / 2.0, 2),
                },
            ]
            total_duration = sum(st["duration_days"] for st in growth_stages)

            existing = await CropWaterCoefficient.find_one(
                CropWaterCoefficient.crop_type == crop_type
            )

            if not existing:
                doc = CropWaterCoefficient(
                    crop_type=crop_type,
                    growth_stages=growth_stages,
                    total_duration_days=total_duration,
                    source_note=source_note,
                )
                await doc.insert()
                seeded_count += 1
                logger.info(f"Inserted new Kc document for: {crop_type}")
            else:
                existing.growth_stages = growth_stages
                existing.total_duration_days = total_duration
                existing.source_note = source_note
                await existing.save()
                updated_count += 1
                logger.info(f"Updated existing Kc document for: {crop_type}")

    logger.info(f"FAO-56 Seeding complete: {seeded_count} inserted, {updated_count} updated.")
    await close_mongodb()


if __name__ == "__main__":
    csv_file = sys.argv[1] if len(sys.argv) > 1 else "crop_water_coefficients_REAL_FAO56.csv"
    asyncio.run(seed_from_csv(csv_file))
