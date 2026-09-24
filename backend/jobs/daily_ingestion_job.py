"""
AgriGuard AI — Dynamic Daily Data Ingestion Pipeline (All 38 Tamil Nadu Districts)
Proactive scheduled climate ingestion from NASA POWER / Open-Meteo satellite reanalysis.
Runs daily at 5:00 AM IST (and on-demand via admin endpoint):
1. Trailing 7-day weather window retrieval with 2-3 day latency tolerance.
2. WeatherSnapshot upsert on compound key (farm_id, date).
3. Shared ML risk inference + Tree-SHAP + Counterfactual engine.
4. PestWarningLog upsert on (farm_id, date).
5. State transitions into High risk trigger 5km community alert dispatch.
6. Writes comprehensive run metrics to job_run_logs collection and queues failed farms into retry_queue.
"""

import asyncio
import logging
from datetime import datetime, date
from typing import Dict, Any, List, Optional
import pandas as pd

from beanie import PydanticObjectId

from backend.models.farm import Farm as MongoFarm
from backend.models.weather_snapshot import WeatherSnapshot as MongoWeatherSnapshot
from backend.models.pest_warning_log import PestWarningLog as MongoWarningLog
from backend.models.job_run_log import JobRunLog as MongoJobRunLog
from backend.models.retry_queue import RetryQueue as MongoRetryQueue
from backend.services import weather_service, soil_service, pest_service, inference_service
from backend.services.counterfactual_service import generate_counterfactual_prescription
from backend.services.geospatial_service import dispatch_5km_regional_alerts
from ml.data.feature_engineering import engineer_features

logger = logging.getLogger("cropshield.daily_ingestion")


async def process_single_farm_ingestion(farm: MongoFarm) -> Dict[str, Any]:
    """
    Processes daily weather ingestion and risk computation for one farm:
    - Pulls 14-35 day trailing weather window (NASA POWER / Open-Meteo)
    - Upserts weather_snapshots on (farm_id, date)
    - Runs XGBoost + SHAP + Counterfactual inference
    - Upserts pest_warning_logs on (farm_id, date)
    - Triggers 5km alert if newly entering High risk
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

    today_weather = weather_service.get_today_weather_dict(weather_df)
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

        existing_snapshot = await MongoWeatherSnapshot.find_one({
            "farm_id": farm.id,
            "date": row_date_str
        })

        row_dict = {k: float(v) if isinstance(v, (int, float)) else str(v) for k, v in row.items()}

        if existing_snapshot:
            existing_snapshot.temperature_c = t2m
            existing_snapshot.humidity_pct = rh2m
            existing_snapshot.rainfall_mm = rain
            existing_snapshot.wind_speed_ms = ws2m
            existing_snapshot.raw = row_dict
            await existing_snapshot.save()
        else:
            new_snap = MongoWeatherSnapshot(
                farm_id=farm.id,
                date=row_date_str,
                source="NASA_POWER",
                raw=row_dict,
                temperature_c=t2m,
                humidity_pct=rh2m,
                rainfall_mm=rain,
                wind_speed_ms=ws2m,
                created_at=datetime.utcnow()
            )
            await new_snap.insert()

    # 3. Execute ML Risk Prediction Pipeline
    soil = soil_service.get_soil_profile(farm.climate_zone)
    soil_mult = soil_service.get_soil_risk_multiplier(soil, farm.crop_type)

    risk_score, risk_level, top_features, model_version = inference_service.predict_today(
        weather_series=weather_df,
        soil=soil,
        crop=farm.crop_type,
        climate_zone=farm.climate_zone,
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

    # 4. Counterfactual prescription if risk is non-low
    prescription = None
    if risk_level in ["Medium", "High"]:
        prescription = generate_counterfactual_prescription(
            crop=farm.crop_type,
            risk_score=risk_score,
            risk_level=risk_level,
            weather_snapshot=snapshot,
            top_features=top_features
        )

    # 5. Detected pests formatting
    detected = pest_service.detect_pests(
        crop=farm.crop_type,
        weather_features=fe_row,
        soil_features=soil,
    )
    p_list = [{"pest_name": d["pest_name"], "confidence": d.get("confidence", 0.85)} for d in detected]
    if not p_list:
        default_pest = "Pink Bollworm" if farm.crop_type == "Cotton" else "Stem Borer"
        p_list = [{"pest_name": default_pest, "confidence": 0.82}]

    # 6. Check previous risk level to detect new High-risk transition
    previous_log = await MongoWarningLog.find(
        {"farm_id": farm.id}
    ).sort(-MongoWarningLog.created_at).first_or_none()

    was_already_high = (previous_log is not None and previous_log.risk_level == "High")

    # 7. Upsert pest_warning_log for (farm_id, date)
    warning_date_str = str(data_date)[:10]
    existing_log = await MongoWarningLog.find_one({
        "farm_id": farm.id,
        "date": warning_date_str
    })

    if existing_log:
        existing_log.risk_score = round(risk_score, 4)
        existing_log.risk_level = risk_level
        existing_log.model_name = "xgboost_multicrop_v2"
        existing_log.model_version = model_version
        existing_log.shap_explanation = top_features
        existing_log.counterfactual_prescription = prescription
        existing_log.detected_pests = p_list
        await existing_log.save()
    else:
        new_log = MongoWarningLog(
            farm_id=farm.id,
            date=warning_date_str,
            crop_type=farm.crop_type,
            risk_score=round(risk_score, 4),
            risk_level=risk_level,
            model_name="xgboost_multicrop_v2",
            model_version=model_version,
            shap_explanation=top_features,
            counterfactual_prescription=prescription,
            detected_pests=p_list,
            verified_by=None,
            verified_at=None,
            created_at=datetime.utcnow()
        )
        await new_log.insert()

    # 8. Cross-farm 5km alert dispatch if NEWLY entered High risk
    alerts_dispatched = 0
    if risk_level == "High" and not was_already_high:
        threat_str = p_list[0]["pest_name"] if p_list else "Severe Pest Threat"
        alerts = await dispatch_5km_regional_alerts(
            origin_farm=farm,
            threat_name=threat_str,
            risk_level="High",
            radius_km=5.0
        )
        alerts_dispatched = len(alerts)

        # Multi-Channel Alert Delivery: Notify farm owner immediately
        try:
            from backend.services.notification_service import notify_farmer
            target_owner = getattr(farm, "owner_id", None) or farm.id
            await notify_farmer(target_owner, "high_risk", {
                "en": f"AgriGuard: High pest risk detected for your {farm.crop_type}. Open the app for details.",
                "ta": f"AgriGuard: உங்கள் {farm.crop_type} பயிரில் அதிக ஆபத்து கண்டறியப்பட்டது. விவரங்களுக்கு பயன்பாட்டைத் திறக்கவும்.",
                "hi": f"AgriGuard: आपकी {farm.crop_type} फसल में उच्च जोखिम पाया गया। विवरण के लिए ऐप खोलें।",
                "te": f"AgriGuard: మీ {farm.crop_type} పంటలో అధిక తెగులు ప్రమాదం గుర్తించబడింది. వివరాల కోసం యాప్‌ని తెరవండి.",
                "ml": f"AgriGuard: നിങ്ങളുടെ {farm.crop_type} വിളയിൽ ഉയർന്ന കീട സാധ്യത കണ്ടെത്തി. വിവരങ്ങൾക്കായി ആപ്പ് തുറക്കുക.",
            })
        except Exception as notif_err:
            logger.warning(f"Failed to dispatch high risk notification for farm {farm.id}: {notif_err}")

    return {
        "status": "success",
        "farm_id": str(farm.id),
        "district": farm.district,
        "date": warning_date_str,
        "risk_level": risk_level,
        "risk_score": round(risk_score, 4),
        "alerts_dispatched": alerts_dispatched
    }


async def run_daily_ingestion_job(is_manual: bool = False) -> Dict[str, Any]:
    """
    Orchestrates daily ingestion across all farms and 38 district centroids:
    - Iterates over all registered farms with rate-limiting
    - Catches exceptions per farm and enqueues failed items to retry_queue
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
    }

    for farm in farms:
        try:
            res = await process_single_farm_ingestion(farm)
            results["success_count"] += 1
            if res.get("risk_level") == "High":
                results["high_risk_count"] += 1
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

            # Enqueue into retry queue
            try:
                await MongoRetryQueue(
                    farm_id=farm.id,
                    district=farm.district,
                    error_message=err_msg,
                    status="pending",
                    created_at=datetime.utcnow()
                ).insert()
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

    logger.info(
        f"Daily Ingestion Pipeline Finished: {results['success_count']}/{len(farms)} succeeded, "
        f"{results['failed_count']} failed ({duration}s). Status: {status_str}"
    )

    return {
        "status": status_str,
        "job_run_id": str(job_log.id),
        "run_at": start_time.isoformat(),
        "completed_at": end_time.isoformat(),
        "duration_seconds": duration,
        "farms_processed": len(farms),
        "success_count": results["success_count"],
        "failed_count": results["failed_count"],
        "failures": results["failures"],
        "is_manual": is_manual
    }
