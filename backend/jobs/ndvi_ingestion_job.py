"""
AgriGuard AI — NDVI Satellite Ingestion Job
Scheduled background job executing every 3 days to pull Sentinel-2 satellite vegetation
indices for registered farms and district reference centroids.
Computes multi-pass NDVI trends and refreshes the multi-modal fused health score.
"""

import asyncio
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from beanie import PydanticObjectId

from backend.models.farm import Farm as MongoFarm
from backend.models.vegetation_snapshot import VegetationSnapshot as MongoVegSnapshot
from backend.models.pest_warning_log import PestWarningLog as MongoWarningLog
from backend.models.disease_detection import DiseaseDetection as MongoDiseaseDetection
from backend.services.ndvi_service import fetch_ndvi_for_farm_async, derive_vegetation_status
from backend.services.fusion_service import compute_fused_health_score
from backend.db.mongo_helpers import get_collection, is_duplicate_key_error

logger = logging.getLogger("cropshield.ndvi_ingestion")


async def process_single_farm_ndvi(farm: MongoFarm) -> Optional[Dict[str, Any]]:
    """
    Ingests latest Sentinel-2 NDVI for one farm:
    - Extracts GPS coordinates
    - Queries Earth Engine (or certified Sentinel-2 proxy)
    - Computes delta trend vs previous pass
    - Upserts vegetation_snapshots on (farm_id, date)
    - Refreshes fused_health_score on farm's latest PestWarningLog
    """
    coords = farm.location.get("coordinates", [78.0, 11.0])
    lon, lat = float(coords[0]), float(coords[1])

    # Earth Engine getInfo() calls are blocking network round-trips: run off the event loop
    ndvi_data = await fetch_ndvi_for_farm_async(lat=lat, lon=lon)
    if not ndvi_data or ndvi_data.get("ndvi_value") is None:
        logger.info("No cloud-free Sentinel-2 pass available for farm %s", farm.farm_name)
        return None

    current_val = float(ndvi_data["ndvi_value"])
    cloud_pct = float(ndvi_data.get("cloud_cover_pct", 10.0))
    image_date = str(ndvi_data.get("image_date_actual", datetime.utcnow().strftime("%Y-%m-%d")))
    pass_date_str = str(datetime.utcnow().strftime("%Y-%m-%d"))

    # 1. Compute trend vs previous pass
    previous_snap = await MongoVegSnapshot.find(
        MongoVegSnapshot.farm_id == farm.id
    ).sort(-MongoVegSnapshot.date).first_or_none()

    trend = 0.0
    if previous_snap and previous_snap.ndvi_value is not None:
        trend = round(current_val - previous_snap.ndvi_value, 4)

    # 2. Upsert VegetationSnapshot on (farm_id, date)
    # Atomic upsert on the unique (farm_id, date) key
    veg_fields = {
        "ndvi_value": round(current_val, 4),
        "ndvi_trend": trend,
        "cloud_cover_pct": cloud_pct,
        "image_date_actual": image_date,
        "source": ndvi_data.get("source", "sentinel2"),
    }
    veg_coll = get_collection(MongoVegSnapshot)
    try:
        await veg_coll.update_one(
            {"farm_id": farm.id, "date": pass_date_str},
            {"$set": veg_fields, "$setOnInsert": {"created_at": datetime.utcnow()}},
            upsert=True,
        )
    except Exception as e:
        if not is_duplicate_key_error(e):
            raise
        await veg_coll.update_one({"farm_id": farm.id, "date": pass_date_str}, {"$set": veg_fields})

    # 3. Refresh Fused Health Score on latest warning log
    latest_warning = await MongoWarningLog.find(
        MongoWarningLog.farm_id == farm.id
    ).sort(-MongoWarningLog.created_at).first_or_none()

    latest_disease = await MongoDiseaseDetection.find(
        MongoDiseaseDetection.farm_id == farm.id
    ).sort(-MongoDiseaseDetection.created_at).first_or_none()

    climate_risk = latest_warning.risk_score if latest_warning else 0.25
    # Only real model predictions count as an image signal (legacy heuristic rows carried a
    # fixed 0.924 confidence and are excluded) — same rule as api/vegetation.py.
    image_available = bool(
        latest_disease is not None
        and latest_disease.confidence is not None
        and latest_disease.model_name
        and abs(float(latest_disease.confidence) - 0.924) > 1e-9
    )

    fused_score = compute_fused_health_score(
        climate_risk_score=climate_risk,
        image_diagnosis_confidence=latest_disease.confidence if image_available else None,
        ndvi_value=current_val,
        image_predicted_class=latest_disease.predicted_class if image_available else None,
        image_model_available=image_available,
    )

    if latest_warning:
        # Targeted $set (a whole-document save could clobber a concurrent agronomist verification)
        await get_collection(MongoWarningLog).update_one(
            {"_id": latest_warning.id},
            {"$set": {"fused_health_score": fused_score}},
        )

    status_str = derive_vegetation_status(current_val, trend)

    return {
        "farm_id": str(farm.id),
        "district": farm.district,
        "ndvi_value": round(current_val, 4),
        "ndvi_trend": trend,
        "status": status_str,
        "fused_health_value": fused_score["value"]
    }


async def run_ndvi_ingestion_job() -> Dict[str, Any]:
    """
    Cycles across all farms every 3 days with rate-limiting and failure insulation.
    """
    start_time = datetime.utcnow()
    logger.info("Starting AgriGuard NDVI Satellite Ingestion Job at %s", start_time.isoformat())

    farms = await MongoFarm.find_all().to_list()
    results = {
        "total_farms": len(farms),
        "processed": 0,
        "skipped": 0,
        "failed": 0,
        "failures": []
    }

    for farm in farms:
        try:
            res = await process_single_farm_ndvi(farm)
            if res:
                results["processed"] += 1
            else:
                results["skipped"] += 1
        except Exception as e:
            results["failed"] += 1
            results["failures"].append({"farm_id": str(farm.id), "error": str(e)})
            logger.warning("NDVI ingestion error for farm %s: %s", farm.id, e)

        # Rate-limiting between calls
        await asyncio.sleep(0.05)

    duration = round((datetime.utcnow() - start_time).total_seconds(), 2)
    logger.info(
        "NDVI Ingestion Job Finished in %ss: %s processed, %s skipped, %s failed.",
        duration, results["processed"], results["skipped"], results["failed"]
    )
    return {
        "status": "success" if results["failed"] == 0 else "partial_failure",
        "duration_seconds": duration,
        **results
    }
