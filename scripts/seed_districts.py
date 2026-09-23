"""
AgriGuard AI — Tamil Nadu 38 District Centroid Seeding Script
Populates reference centroid stations across all 38 Tamil Nadu districts idempotently.
Ensures state-wide geospatial risk grid and climate ingestion coverage from day one.
"""

import asyncio
from pathlib import Path
import sys

# Ensure project root is in sys.path
ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.db.mongodb import init_mongodb, close_mongodb
from backend.models.farm import Farm as MongoFarm

TAMIL_NADU_DISTRICTS = {
    "Ariyalur":         (11.1401, 79.0782),
    "Chengalpattu":     (12.6819, 79.9888),
    "Chennai":          (13.0827, 80.2707),
    "Coimbatore":       (11.0168, 76.9558),
    "Cuddalore":        (11.7480, 79.7714),
    "Dharmapuri":       (12.1211, 78.1582),
    "Dindigul":         (10.3624, 77.9695),
    "Erode":            (11.3410, 77.7172),
    "Kallakurichi":     (11.7401, 78.9597),
    "Kanchipuram":      (12.8342, 79.7036),
    "Kanyakumari":      ( 8.0883, 77.5385),
    "Karur":            (10.9601, 78.0766),
    "Krishnagiri":      (12.5186, 78.2137),
    "Madurai":          ( 9.9252, 78.1198),
    "Mayiladuthurai":   (11.1085, 79.6522),
    "Nagapattinam":     (10.7661, 79.8420),
    "Namakkal":         (11.2189, 78.1677),
    "Nilgiris":         (11.4916, 76.7337),
    "Perambalur":       (11.2342, 78.8807),
    "Pudukkottai":      (10.3833, 78.8001),
    "Ramanathapuram":   ( 9.3639, 78.8395),
    "Ranipet":          (12.9249, 79.3308),
    "Salem":            (11.6643, 78.1460),
    "Sivaganga":        ( 9.8433, 78.4809),
    "Tenkasi":          ( 8.9598, 77.3152),
    "Thanjavur":        (10.7870, 79.1378),
    "Theni":            (10.0104, 77.4768),
    "Thoothukudi":      ( 8.7642, 78.1348),
    "Tiruchirappalli":  (10.7905, 78.7047),
    "Tirunelveli":      ( 8.7139, 77.7567),
    "Tirupathur":       (12.4950, 78.5678),
    "Tiruppur":         (11.1085, 77.3411),
    "Tiruvallur":       (13.1231, 79.9089),
    "Tiruvannamalai":   (12.2253, 79.0747),
    "Tiruvarur":        (10.7661, 79.6345),
    "Vellore":          (12.9165, 79.1325),
    "Viluppuram":       (11.9401, 79.4861),
    "Virudhunagar":     ( 9.5851, 77.9581),
}

DISTRICT_ZONES = {
    "Thanjavur": ("Delta", "Rice"),
    "Tiruvarur": ("Delta", "Rice"),
    "Nagapattinam": ("Delta", "Rice"),
    "Mayiladuthurai": ("Delta", "Rice"),
    "Nilgiris": ("Hills", "Potato"),
    "Dindigul": ("Hills", "Vegetables"),
    "Coimbatore": ("Western", "Cotton"),
    "Tiruppur": ("Western", "Cotton"),
    "Erode": ("Western", "Sugarcane"),
    "Kovilpatti": ("Dryland", "Cotton"),
    "Virudhunagar": ("Dryland", "Cotton"),
    "Thoothukudi": ("Dryland", "Millets"),
    "Tirunelveli": ("Dryland", "Cotton"),
    "Tenkasi": ("Dryland", "Rice"),
    "Madurai": ("Irrigated", "Rice"),
    "Tiruchirappalli": ("Irrigated", "Sugarcane"),
    "Karur": ("Irrigated", "Sugarcane"),
    "Salem": ("Semi-arid", "Millets"),
    "Dharmapuri": ("Semi-arid", "Millets"),
    "Krishnagiri": ("Semi-arid", "Tomato"),
    "Vellore": ("Semi-arid", "Groundnut"),
}


async def seed_tamil_nadu_districts(close_db: bool = False):
    """Seeds reference stations for all 38 districts if not already present."""
    from backend.db.mongodb import motor_client
    if motor_client is None:
        await init_mongodb()

    print("Seeding Tamil Nadu 38 District Centroids...")
    inserted = 0
    already_present = 0

    for district_name, (lat, lon) in TAMIL_NADU_DISTRICTS.items():
        # Check by district name and is_reference_point
        existing = await MongoFarm.find_one({
            "district": district_name,
            "is_reference_point": True
        })

        if existing:
            already_present += 1
            continue

        zone, crop = DISTRICT_ZONES.get(district_name, ("Dryland", "Cotton"))

        doc = MongoFarm(
            farm_name=f"{district_name} District Reference Station",
            location={
                "type": "Point",
                "coordinates": [lon, lat]
            },
            district=district_name,
            climate_zone=zone,
            crop_type=crop,
            soil_type="Vertisol / Red Loam",
            area_hectares=10.0,
            is_reference_point=True
        )
        await doc.insert()
        inserted += 1

    print(f"Districts Seeding Complete: {inserted} inserted, {already_present} already present (Total: {len(TAMIL_NADU_DISTRICTS)}).")
    if close_db:
        await close_mongodb()
    return inserted, already_present


if __name__ == "__main__":
    asyncio.run(seed_tamil_nadu_districts(close_db=True))
