"""
AgriGuard AI — Dynamic Daily Data Ingestion Pipeline (All 38 Tamil Nadu Districts)
Proactive scheduled climate ingestion from NASA POWER / Open-Meteo satellite reanalysis.
Runs daily at 5:00 AM IST (and on-demand via admin endpoint):
1. Trailing 7-day weather window retrieval with 2-3 day latency tolerance.
2. WeatherSnapshot upsert on compound key (farm_id, date).
3. Shared ML risk inference + Tree-SHAP + Counterfactual engine (in a worker thread).
4. PestWarningLog atomic upsert on (farm_id, date, source="daily_job").
5. State transitions into High risk trigger 5km community alert dispatch (deduped).
6. Writes comprehensive run metrics to job_run_logs collection and queues failed farms into retry_queue.
Concurrency: run_daily_ingestion_job and the retry worker share backend.jobs.locks.ingestion_lock;
an overlapping run is skipped (JobRunLog status "skipped").
"""

import asyncio
import logging
from datetime import datetime, date
from typing import Dict, Any, List, Optional
import pandas as pd

from beanie import PydanticObjectId

from backend.models.farm import Farm as MongoFarm
from backend.models.weather_snapshot import WeatherSnapshot as MongoWeatherSnapshot
from backend.models.pest_warning_log import PestWarningLog as MongoWarningLog, upsert_pest_warning_log
from backend.models.job_run_log import JobRunLog as MongoJobRunLog
from backend.models.retry_queue import RetryQueue as MongoRetryQueue
from backend.services import weather_service, soil_service, pest_service, inference_service
from backend.services.counterfactual_service import generate_counterfactual_prescription
from backend.services.geospatial_service import dispatch_5km_regional_alerts
from backend.db.mongo_helpers import get_collection, is_duplicate_key_error
from backend.jobs.locks import ingestion_lock
from ml.data.feature_engineering import engineer_features

logger = logging.getLogger("cropshield.daily_ingestion")

PEST_LOG_SOURCE = "daily_job"


def _compute_farm_risk_sync(weather_df: pd.DataFrame, crop_type: str, climate_zone: str) -> Dict[str, Any]:
    """
    CPU-bound part of the pipeline (XGBoost + SHAP, feature engineering, rule detection).
    Runs in a worker thread via asyncio.to_thread so it never blocks the shared event loop.
    """
    today_weather = weather_service.get_today_weather_dict(weather_df)
    soil = soil_service.get_soil_profile(climate_zone)
    soil_mult = soil_service.get_soil_risk_multiplier(soil, crop_type)

    risk_score, risk_level, top_features, model_version = inference_service.predict_today(
        weather_series=weather_df,
        soil=soil,
        crop=crop_type,
        climate_zone=climate_zone,
    )
    risk_score = min(1.0, risk_score * soil_mult)
    risk_level = inference_service.score_to_risk_level(risk_score)

    # Feature engineering for detection rules & environmental summary
    fe_df = engineer_features(weather_df)
    fe_row = fe_df.iloc[-1].to_dict()

    snapshot = {
        "temperature_c": round(float(today_weather.get("t2m", 28.0)), 1),
        "humidity_pct": round(float(today_weather.get("rh2m", 65.0)), 1),
        "rain_rolling_7d_mm": round(float(fe_row.get("rain_rolling_7d", 0.0)), 1),
        "consecutive_dry_days": int(fe_row.get("consecutive_dry_days", 0)),
    }

    # Counterfactual prescription if risk is non-low
    prescription = None
    if risk_level in ["Medium", "High"]:
        prescription = generate_counterfactual_prescription(
            crop=crop_type,
            risk_score=risk_score,
            risk_level=risk_level,
            weather_snapshot=snapshot,
            top_features=top_features
        )

    # Detected pests formatting
    detected = pest_service.detect_pests(
        crop=crop_type,
        weather_features=fe_row,
        soil_features=soil,
    )
    p_list = [{"pest_name": d["pest_name"], "confidence": d.get("confidence", 0.85)} for d in detected]
    if not p_list:
        default_pest = "Pink Bollworm" if crop_type == "Cotton" else "Stem Borer"
        p_list = [{"pest_name": default_pest, "confidence": 0.82}]

    return {
        "risk_score": risk_score,
        "risk_level": risk_level,
        "top_features": top_features,
        "model_version": model_version,
        "prescription": prescription,
        "p_list": p_list,
    }


async def _upsert_weather_snapshot(farm_id: PydanticObjectId, date_str: str, source: str, row_dict: Dict[str, Any],
                                   t2m: float, rh2m: float, rain: float, ws2m: float) -> None:
    """Atomic upsert on the unique (farm_id, date) key — safe under concurrent writers."""
    coll = get_collection(MongoWeatherSnapshot)
    set_fields = {
        "source": source,
        "raw": row_dict,
        "temperature_c": t2m,
        "humidity_pct": rh2m,
        "rainfall_mm": rain,
        "wind_speed_ms": ws2m,
    }
    try:
        await coll.update_one(
            {"farm_id": farm_id, "date": date_str},
            {"$set": set_fields, "$setOnInsert": {"engineered": {}, "created_at": datetime.utcnow()}},
            upsert=True,
        )
    except Exception as e:
        if not is_duplicate_key_error(e):
            raise
        # Lost an upsert race: the row now exists, so a plain update succeeds.
        await coll.update_one({"farm_id": farm_id, "date": date_str}, {"$set": set_fields})


async def process_single_farm_ingestion(farm: MongoFarm, allow_synthetic: bool = False) -> Dict[str, Any]:
    """
    Processes daily weather ingestion and risk computation for one farm:
    - Pulls the 35-day trailing weather window (NASA POWER). Synthetic fallback weather raises
      weather_service.SyntheticWeatherError (unless allow_synthetic=True) so the farm is queued for
      retry instead of being stored as NASA data and triggering real alerts.
    - Upserts weather_snapshots on (farm_id, date) with the real `source`
    - Runs XGBoost + SHAP + Counterfactual inference in a worker thread
    - Atomically upserts pest_warning_logs on (farm_id, date, source="daily_job"); never overwrites verified rows
    - Triggers 5km alerts if newly entering High risk (alerts are deduped per origin/neighbour/day/type)
    Does NOT take the ingestion lock — callers (run_daily_ingestion_job / retry worker) hold it.
    """
    coords = farm.location.get("coordinates", [77.8710, 9.1728])
    lon, lat = float(coords[0]), float(coords[1])

    # 1. Fetch trailing weather window (NASA POWER / fallback)
    weather_df = await weather_service.fetch_latest_weather(
        latitude=lat,
        longitude=lon,
        days_back=35
    )

    if weather_df is None or weather_df.empty:
        raise ValueError(f"No weather records returned for coordinates ({lat}, {lon})")

    weather_source = weather_service.get_weather_source(weather_df)
    if weather_source == weather_service.SOURCE_SYNTHETIC and not allow_synthetic:
        reason = weather_df.attrs.get("fallback_reason") or "NASA POWER unavailable"
        raise weather_service.SyntheticWeatherError(
            f"Live weather unavailable ({reason}); synthetic fallback not stored - queued for retry"
        )

    data_date = weather_df["date"].max()
    if hasattr(data_date, "date"):
        data_date = data_date.date()

    # 2. Upsert trailing weather snapshots for this farm (updates backfilled records)
    recent_tail = weather_df.tail(7)
    for _, row in recent_tail.iterrows():
        row_dt = row.get("date")
        if isinstance(row_dt, (pd.Timestamp, datetime, date)):
            row_date_str = str(row_dt)[:10]
        else:
            row_date_str = str(data_date)[:10]

        t2m = round(float(row.get("t2m", 28.0)), 2)
        rh2m = round(float(row.get("rh2m", 65.0)), 2)
        rain = round(float(row.get("prectotcorr", row.get("rain", 0.0))), 2)
        ws2m = round(float(row.get("ws2m", 2.5)), 2)

        row_dict = {k: float(v) if isinstance(v, (int, float)) else str(v) for k, v in row.items()}
        await _upsert_weather_snapshot(farm.id, row_date_str, weather_source, row_dict, t2m, rh2m, rain, ws2m)

    # 3-5. ML risk prediction, counterfactual & pest detection — off the event loop
    risk = await asyncio.to_thread(_compute_farm_risk_sync, weather_df, farm.crop_type, farm.climate_zone)
    risk_score = risk["risk_score"]
    risk_level = risk["risk_level"]
    top_features = risk["top_features"]
    model_version = risk["model_version"]
    prescription = risk["prescription"]
    p_list = risk["p_list"]

    # 6. Check previous daily-job risk level to detect a NEW High-risk transition
    previous_log = await MongoWarningLog.find(
        {"farm_id": farm.id, "source": {"$in": [PEST_LOG_SOURCE, None]}}
    ).sort(-MongoWarningLog.created_at).first_or_none()

    was_already_high = (previous_log is not None and previous_log.risk_level == "High")

    # 7. Atomic upsert of pest_warning_log for (farm_id, date, source)
    warning_date_str = str(data_date)[:10]
    upsert_res = await upsert_pest_warning_log(
        farm_id=farm.id,
        date=warning_date_str,
        source=PEST_LOG_SOURCE,
        fields={
            "crop_type": farm.crop_type,
            "risk_score": round(risk_score, 4),
            "risk_level": risk_level,
            "model_name": "xgboost_multicrop_v2",
            "model_version": model_version,
            "shap_explanation": top_features,
            "counterfactual_prescription": prescription,
            "detected_pests": p_list,
        },
    )
    if upsert_res.get("status") == "verified_locked":
        logger.info("PestWarningLog for farm %s on %s already verified by an agronomist; left unchanged.",
                    farm.id, warning_date_str)

    # 8. Cross-farm 5km alert dispatch if NEWLY entered High risk
    alerts_dispatched = 0
    if risk_level == "High" and not was_already_high:
        threat_str = p_list[0]["pest_name"] if p_list else "Severe Pest Threat"
        alerts = await dispatch_5km_regional_alerts(
            origin_farm=farm,
            threat_name=threat_str,
            risk_level="High",
            radius_km=5.0,
            weather_source=weather_source,
        )
        alerts_dispatched = len(alerts)

        # Multi-Channel Alert Delivery: notify the farm owner (only real owners — never farm.id)
        owner_id = getattr(farm, "owner_id", None)
        if owner_id:
            try:
                from backend.services.notification_service import notify_farmer
                await notify_farmer(owner_id, "high_risk", {
                    "en": f"AgriGuard: High pest risk detected for your {farm.crop_type}. Open the app for details.",
                    "ta": f"AgriGuard: உங்கள் {farm.crop_type} பயிரில் அதிக ஆபத்து கண்டறியப்பட்டது. விவரங்களுக்கு பயன்பாட்டைத் திறக்கவும்.",
                    "hi": f"AgriGuard: आपकी {farm.crop_type} फसल में उच्च जोखिम पाया गया। विवरण के लिए ऐप खोलें।",
                    "te": f"AgriGuard: మీ {farm.crop_type} పంటలో అధిక తెగులు ప్రమాదం గుర్తించబడింది. వివరాల కోసం యాప్‌ని తెరవండి.",
                    "ml": f"AgriGuard: നിങ്ങളുടെ {farm.crop_type} വിളയിൽ ഉയർന്ന കീട സാധ്യത കണ്ടെത്തി. വിവരങ്ങൾക്കായി ആപ്പ് തുറക്കുക.",
                })
            except Exception as notif_err:
                logger.warning(f"Failed to dispatch high risk notification for farm {farm.id}: {notif_err}")
        else:
            logger.info("Farm %s has no owner_id; skipping owner high-risk notification.", farm.id)

    return {
        "status": "success",
        "farm_id": str(farm.id),
        "district": farm.district,
        "date": warning_date_str,
        "risk_level": risk_level,
        "risk_score": round(risk_score, 4),
        "alerts_dispatched": alerts_dispatched,
        "weather_source": weather_source,
    }


async def enqueue_retry(farm: MongoFarm, err_msg: str) -> None:
    """One open retry item per farm: atomic upsert (refreshes the error message on an existing item)."""
    now = datetime.utcnow()
    try:
        await get_collection(MongoRetryQueue).update_one(
            {"farm_id": farm.id, "status": {"$in": ["pending", "processing"]}},
            {
                "$set": {"error_message": err_msg, "district": farm.district},
                "$setOnInsert": {"status": "pending", "retry_count": 0, "created_at": now, "last_attempt_at": None},
            },
            upsert=True,
        )
    except Exception as e:
        if not is_duplicate_key_error(e):
            raise
        # A concurrent writer created the pending item already — nothing more to do.


def _skipped_result(is_manual: bool, job_run_id: Optional[str]) -> Dict[str, Any]:
    now = datetime.utcnow().isoformat()
    return {
        "status": "skipped",
        "message": "Daily ingestion skipped: another ingestion run is already in progress",
        "job_run_id": job_run_id,
        "run_at": now,
        "completed_at": now,
        "duration_seconds": 0.0,
        "farms_processed": 0,
        "success_count": 0,
        "failed_count": 0,
        "high_risk_count": 0,
        "alerts_dispatched": 0,
        "failures": [],
        "is_manual": is_manual,
    }


async def run_daily_ingestion_job(is_manual: bool = False) -> Dict[str, Any]:
    """
    Orchestrates daily ingestion across all farms and 38 district centroids.
    Serialized by the shared ingestion lock: if a run (scheduled, manual or retry sweep) is already
    in progress, this call returns immediately with status "skipped" (and logs a JobRunLog).
    """
    if ingestion_lock.locked():
        logger.warning("Daily ingestion (is_manual=%s) skipped: another ingestion run is in progress.", is_manual)
        job_run_id = None
        try:
            skip_log = MongoJobRunLog(
                job_name="daily_ingestion_job",
                status="skipped",
                run_at=datetime.utcnow(),
                completed_at=datetime.utcnow(),
                is_manual=is_manual,
                failures=[{"reason": "another ingestion run in progress"}],
            )
            await skip_log.insert()
            job_run_id = str(skip_log.id)
        except Exception as e:
            logger.warning("Could not persist skipped JobRunLog: %s", e)
        return _skipped_result(is_manual, job_run_id)

    async with ingestion_lock:
        return await _run_daily_ingestion(is_manual)


async def _run_daily_ingestion(is_manual: bool) -> Dict[str, Any]:
    """
    - Iterates over all registered farms with rate-limiting
    - Catches exceptions per farm and enqueues failed items to retry_queue (one pending item per farm)
    - Logs run telemetry to job_run_logs
    """
    start_time = datetime.utcnow()
    logger.info(f"Starting AgriGuard Daily Ingestion Pipeline (is_manual={is_manual}) at {start_time.isoformat()}")

    farms = await MongoFarm.find_all().to_list()
    results = {
        "success_count": 0,
        "failed_count": 0,
        "failures": [],
        "high_risk_count": 0,
        "medium_risk_count": 0,
        "alerts_dispatched": 0,
    }

    for farm in farms:
        try:
            res = await process_single_farm_ingestion(farm)
            results["success_count"] += 1
            results["alerts_dispatched"] += int(res.get("alerts_dispatched", 0) or 0)
            if res.get("risk_level") == "High":
                results["high_risk_count"] += 1
            elif res.get("risk_level") == "Medium":
                results["medium_risk_count"] += 1
        except Exception as e:
            err_msg = str(e)
            logger.warning(f"Ingestion failed for farm {farm.farm_name} ({farm.district}): {err_msg}")
            results["failed_count"] += 1
            results["failures"].append({
                "farm_id": str(farm.id),
                "district": farm.district,
                "farm_name": farm.farm_name,
                "error": err_msg
            })

            # Enqueue into retry queue (one pending item per farm)
            try:
                await enqueue_retry(farm, err_msg)
            except Exception as q_err:
                logger.error(f"Failed to enqueue retry item for {farm.id}: {q_err}")

        # Rate-limiting between external weather queries
        await asyncio.sleep(0.08)

    end_time = datetime.utcnow()
    duration = round((end_time - start_time).total_seconds(), 2)

    status_str = "success"
    if results["failed_count"] > 0:
        status_str = "partial_failure" if results["success_count"] > 0 else "failed"

    # Persist JobRunLog
    job_run_id = None
    try:
        job_log = MongoJobRunLog(
            job_name="daily_ingestion_job",
            status=status_str,
            run_at=start_time,
            completed_at=end_time,
            duration_seconds=duration,
            farms_processed=len(farms),
            success_count=results["success_count"],
            failed_count=results["failed_count"],
            failures=results["failures"],
            is_manual=is_manual
        )
        await job_log.insert()
        job_run_id = str(job_log.id)
    except Exception as e:
        logger.error("Could not persist JobRunLog for daily ingestion: %s", e)

    logger.info(
        f"Daily Ingestion Pipeline Finished: {results['success_count']}/{len(farms)} succeeded, "
        f"{results['failed_count']} failed ({duration}s). Status: {status_str}"
    )

    return {
        "status": status_str,
        "job_run_id": job_run_id,
        "run_at": start_time.isoformat(),
        "completed_at": end_time.isoformat(),
        "duration_seconds": duration,
        "farms_processed": len(farms),
        "success_count": results["success_count"],
        "failed_count": results["failed_count"],
        "high_risk_count": results["high_risk_count"],
        "medium_risk_count": results["medium_risk_count"],
        "alerts_dispatched": results["alerts_dispatched"],
        "failures": results["failures"],
        "is_manual": is_manual
    }
