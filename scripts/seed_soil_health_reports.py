"""
scripts/seed_soil_health_reports.py
-----------------------------------
Seeds sample preliminary soil health reports from soil_health_preliminary_reports_demo_10000rows.csv
into MongoDB collection `soil_health_reports`.
"""
import sys
import csv
import asyncio
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.db.mongodb import init_mongodb, close_mongodb
from backend.models.soil_health_report import SoilHealthReport
from backend.models.farm import Farm


DISTRICT_CENTROIDS = {
    "Krishnagiri": [78.2137, 12.5186],
    "Nilgiris": [76.7337, 11.4916],
    "Madurai": [78.1198, 9.9252],
    "Thanjavur": [79.1378, 10.7870],
    "Nagapattinam": [79.8420, 10.7661],
    "Tirunelveli": [77.7567, 8.7139],
    "Vellore": [79.1325, 12.9165],
    "Trichy": [78.7047, 10.7905],
    "Coimbatore": [76.9558, 11.0168],
    "Kovilpatti": [77.9803, 9.1768],
}


def make_box_polygon(lon: float, lat: float, spread: float = 0.003):
    return {
        "type": "Polygon",
        "coordinates": [[
            [round(lon - spread, 5), round(lat - spread, 5)],
            [round(lon + spread, 5), round(lat - spread, 5)],
            [round(lon + spread, 5), round(lat + spread, 5)],
            [round(lon - spread, 5), round(lat + spread, 5)],
            [round(lon - spread, 5), round(lat - spread, 5)],
        ]]
    }


async def seed_soil_reports(max_rows: int = 50):
    await init_mongodb()
    csv_path = ROOT / "soil_health_preliminary_reports_demo_10000rows.csv"
    if not csv_path.exists():
        print(f"[ERROR] CSV not found at {csv_path}")
        await close_mongodb()
        return

    # Fetch existing farms to bind real farm_ids where possible
    farms = await Farm.find_all().to_list()
    farm_ids = [str(f.id) for f in farms]

    inserted = 0
    with open(csv_path, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            if i >= max_rows:
                break

            dist = row.get("district", "Thoothukudi")
            centroid = DISTRICT_CENTROIDS.get(dist, [77.8710, 9.1728])
            boundary = make_box_polygon(centroid[0], centroid[1])

            # Assign to an existing farm for first few rows
            assigned_farm_id = farm_ids[i % len(farm_ids)] if farm_ids else f"demo_farm_{row.get('report_id', i)}"

            ph_m = float(row.get("ph_mean", 7.0))
            ph_low = float(row.get("ph_range_low", round(ph_m - 0.25, 2)))
            ph_high = float(row.get("ph_range_high", round(ph_m + 0.25, 2)))

            report = SoilHealthReport(
                farm_id=assigned_farm_id,
                boundary_geojson=boundary,
                area_acres=float(row.get("area_acres", 2.5)),
                report_type="preliminary",
                soil_type_declared=row.get("soil_type_declared", "Alluvial Clay"),
                district=dist,
                estimated_properties={
                    "ph": {
                        "mean": ph_m,
                        "value_range": [ph_low, ph_high],
                        "confidence_pct": float(row.get("ph_confidence_pct", 88.0)),
                    },
                    "nitrogen": {
                        "level": row.get("nitrogen_level", "Medium"),
                        "confidence_pct": float(row.get("nitrogen_confidence_pct", 60.0)),
                    },
                    "phosphorus": {
                        "level": row.get("phosphorus_level", "Not available (SoilGrids does not model phosphorus)"),
                        "confidence_pct": None,
                        "note": "SoilGrids v2.0 satellite ML models do not directly estimate available P2O5.",
                    },
                    "potassium": {
                        "level": row.get("potassium_level", "Medium"),
                        "confidence_pct": float(row.get("potassium_confidence_pct", 55.0)),
                    },
                    "organic_carbon": {
                        "level": row.get("organic_carbon_level", "Medium"),
                        "confidence_pct": float(row.get("organic_carbon_confidence_pct", 45.0)),
                    },
                },
                overall_confidence_pct=float(row.get("overall_confidence_pct", 60.0)),
                elevation_m=float(row.get("elevation_m", 150.0)),
                terrain_slope_pct=float(row.get("terrain_slope_pct", 1.0)),
                data_sources=[
                    "ISRIC SoilGrids v2.0 (Uncertainty Quantiles)",
                    "NASA POWER Agro-climatology",
                    "SRTM (via Google Earth Engine)",
                ],
                generated_at=datetime.utcnow(),
            )
            await report.insert()
            inserted += 1

    print(f"[OK] Successfully seeded {inserted} preliminary soil health reports into MongoDB.")
    await close_mongodb()


if __name__ == "__main__":
    asyncio.run(seed_soil_reports(30))
