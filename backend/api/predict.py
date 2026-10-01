"""
CropShield — /predict-today API Route (v2)
Generates today's pest warning using live NASA POWER weather
and the XGBoost model trained on 1980–2025 historical data.

Requires authentication. The prediction is attributed to the caller's own farm
(or to `farm_id`, which must be owned by the caller / admin). Blocking ML work
(feature engineering, XGBoost, SHAP, calibration, rule engine) runs in a worker
thread. When the weather is synthetic (NASA POWER unavailable) no neighbour
alerts or notifications are sent (contract item 8).
"""

import asyncio
import logging
from datetime import date
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.models.schemas import TodayWarningRequest, TodayWarningResponse, SHAPFeature, LikelyPest
from backend.models.db_models import PestWarningLog, RiskLevel, ClimateZone
from backend.models.user import User as MongoUser
from backend.services import weather_service, soil_service, pest_service, inference_service
from backend.services.calibration_service import calibrate_prediction
from backend.utils.auth_utils import get_current_user, resolve_user_farm, predict_rate_limiter
from backend.utils.serialization import sanitize_for_json

logger = logging.getLogger("cropshield.predict_api")

router = APIRouter()

SOURCE_NASA = "NASA_POWER"
SOURCE_SYNTHETIC = "synthetic"


def _weather_source(weather_df) -> str:
    """Reads the weather provenance set by weather_service (df.attrs['source']); defensive defaults."""
    getter = getattr(weather_service, "get_weather_source", None)
    if callable(getter):
        try:
            return str(getter(weather_df))
        except Exception:
            logger.debug("get_weather_source failed", exc_info=True)
    attrs = getattr(weather_df, "attrs", {}) or {}
    if attrs.get("is_synthetic") is True:
        return SOURCE_SYNTHETIC
    return str(attrs.get("source") or SOURCE_NASA)


def _run_models(weather_df, soil: Dict[str, Any], crop: str, climate_zone: str) -> Dict[str, Any]:
    """CPU-bound part of the pipeline (runs in a worker thread)."""
    soil_mult = soil_service.get_soil_risk_multiplier(soil, crop)

    risk_score, risk_level, top_features, model_version = inference_service.predict_today(
        weather_series=weather_df, soil=soil, crop=crop, climate_zone=climate_zone,
    )
    # Subtle soil modulation
    risk_score = min(1.0, risk_score * soil_mult)
    risk_level = inference_service.score_to_risk_level(risk_score)

    # Post-hoc Platt calibration — only for real model output. The rule fallback
    # (model_version == RULES_FALLBACK_VERSION) has no probabilities to calibrate.
    fallback_version = getattr(inference_service, "RULES_FALLBACK_VERSION", "rules-fallback-v2")
    if model_version == fallback_version:
        calibration_result = {
            "raw_confidence": None,
            "calibrated_confidence": None,
            "confidence_band": None,
            "model_calibration_version": None,
            "calibration_method": None,
        }
    else:
        try:
            # Same feature pipeline as predict_today (raises instead of zero-filling missing features)
            raw_probs, X_scaled_cal = inference_service.predict_proba_today(weather_df, soil, crop, climate_zone)
            calibration_result = calibrate_prediction(
                X_scaled=X_scaled_cal, raw_score=risk_score, risk_level=risk_level, raw_probs=raw_probs,
            )
        except Exception as cal_err:
            logger.warning("Calibration fallback: %s", cal_err)
            calibration_result = calibrate_prediction(X_scaled=None, raw_score=risk_score, risk_level=risk_level)

    # Rule-based pest detection
    from ml.data.feature_engineering import engineer_features
    fe_row = engineer_features(weather_df).iloc[-1].to_dict()
    detected = pest_service.detect_pests(crop=crop, weather_features=fe_row, soil_features=soil)
    interpretation = inference_service.build_shap_interpretation(top_features)

    return {
        "risk_score": risk_score,
        "risk_level": risk_level,
        "top_features": top_features,
        "model_version": model_version,
        "calibration": calibration_result,
        "fe_row": fe_row,
        "detected": detected,
        "interpretation": interpretation,
    }


@router.post(
    "/predict-today",
    response_model=TodayWarningResponse,
    summary="Today's Pest Warning",
    description=(
        "Fetches the latest available NASA POWER weather data, "
        "engineers rolling/lag features, runs the XGBoost model trained "
        "on 1980–2025 historical data, and returns **today's** pest risk warning."
    ),
)
async def predict_today(
    request: TodayWarningRequest,
    db: Session = Depends(get_db),
    current_user: MongoUser = Depends(get_current_user),
):
    predict_rate_limiter.check(str(current_user.id), "predict")
    predict_rate_limiter.record_failure(str(current_user.id), "predict")  # counts every call

    # Farm attribution: explicit farm_id must be owned (403/404), else the caller's own farm (or None)
    farm_doc = await resolve_user_farm(request.farm_id, current_user)

    try:
        # ── 1. Fetch latest 35 days of weather ────────────────
        weather_df = await weather_service.fetch_latest_weather(
            latitude=request.latitude,
            longitude=request.longitude,
            days_back=35,
        )
        weather_source = _weather_source(weather_df)
        is_synthetic = weather_source == SOURCE_SYNTHETIC
        data_quality = {"weather_source": weather_source, "is_synthetic": is_synthetic}

        today_weather = weather_service.get_today_weather_dict(weather_df)
        data_date = weather_df["date"].max()
        if hasattr(data_date, "date"):
            data_date = data_date.date()

        # ── 2–5. Soil + ML inference + calibration + pest rules (off the event loop) ──
        soil = soil_service.get_soil_profile(request.climate_zone)
        m = await asyncio.to_thread(_run_models, weather_df, soil, request.crop, request.climate_zone)
        risk_score = m["risk_score"]
        risk_level = m["risk_level"]
        top_features = m["top_features"]
        model_version = m["model_version"]
        calibration_result = m["calibration"]
        fe_row = m["fe_row"]
        detected = m["detected"]
        interpretation = m["interpretation"]
        is_warning = risk_level in ("Medium", "High")

        # ── 6. Alert message ──────────────────────────────────
        today_str = date.today().isoformat()
        if risk_level == "High":
            alert = (
                f"🚨 HIGH PEST RISK today ({today_str}) for {request.crop} "
                f"at {request.location}. Immediate field scouting required."
            )
        elif risk_level == "Medium":
            alert = (
                f"⚠️ MODERATE pest risk today ({today_str}) for {request.crop} "
                f"at {request.location}. Scout fields within 24 hours."
            )
        else:
            alert = (
                f"✅ LOW pest risk today ({today_str}) for {request.crop} "
                f"at {request.location}. Continue regular monitoring."
            )
        if is_synthetic:
            alert += " (Estimated weather — live NASA POWER data unavailable.)"

        # ── 7. Build weather snapshot ─────────────────────────
        weather_snapshot = {
            "temperature_c":        round(float(today_weather.get("t2m",   0)), 1),
            "max_temp_c":           round(float(today_weather.get("t2m_max",0)), 1),
            "min_temp_c":           round(float(today_weather.get("t2m_min",0)), 1),
            "humidity_pct":         round(float(today_weather.get("rh2m",  0)), 1),
            "rainfall_today_mm":    round(float(today_weather.get("prectotcorr",0)), 1),
            "wind_speed_ms":        round(float(today_weather.get("ws2m",  0)), 1),
            "solar_rad_mj":         round(float(today_weather.get("allsky_sfc_sw_dwn",0)), 1),
            "et0_mm":               round(float(today_weather.get("et0",   0)), 1),
            "rain_rolling_7d_mm":   round(float(fe_row.get("rain_rolling_7d",0)), 1),
            "rain_rolling_14d_mm":  round(float(fe_row.get("rain_rolling_14d",0)), 1),
            "consecutive_dry_days": int(fe_row.get("consecutive_dry_days", 0)),
            "heat_index_c":         round(float(fe_row.get("heat_index", 0)), 1),
            "humidity_trend_7d":    round(float(fe_row.get("rh_trend_7d", 0)), 2),
            "weather_source":       weather_source,
        }

        # ── 7b. Counterfactual Agronomic Optimization ─────────
        from backend.services.counterfactual_service import generate_counterfactual_prescription
        prescription = generate_counterfactual_prescription(
            crop=request.crop,
            risk_score=risk_score,
            risk_level=risk_level,
            weather_snapshot=weather_snapshot,
            top_features=top_features,
        )

        # ── 7c. Economic Impact Advisor (₹ Optimization) ──────
        from backend.services.economic_impact_service import get_economic_impact_for_prediction
        economic_impact_data = await get_economic_impact_for_prediction(
            crop=request.crop,
            location=request.location,
            risk_level=risk_level,
            calibrated_confidence=(
                calibration_result.get("calibrated_confidence")
                if calibration_result.get("calibrated_confidence") is not None
                else risk_score
            ),
            detected_pests=detected,
            weather_snapshot=weather_snapshot,
            soil=soil,
        )

        # ── 7d. Persist Warning in SQLite (legacy /history store) ──
        zone_enum = None
        try:
            zone_enum = ClimateZone(request.climate_zone)
        except ValueError:
            pass

        likely_pests_data = sanitize_for_json([
            {
                "pest_name":   d["pest_name"],
                "confidence":  d["confidence"],
                "status":      d["detection_status"],
            }
            for d in detected
        ])

        def _persist_sqlite() -> int:
            warning = PestWarningLog(
                warning_date=data_date,
                location=request.location,
                latitude=request.latitude,
                longitude=request.longitude,
                crop=request.crop,
                climate_zone=zone_enum,
                risk_score=risk_score,
                risk_level=RiskLevel(risk_level),
                likely_pests=likely_pests_data,
                shap_values={f["feature"]: f["shap_value"] for f in top_features},
                shap_interpretation=interpretation,
                weather_snapshot=sanitize_for_json(today_weather),
                economic_impact=economic_impact_data,
                model_version=model_version,
            )
            try:
                db.add(warning)
                db.commit()
                db.refresh(warning)
                return warning.id
            except Exception:
                db.rollback()
                raise

        warning_id = 0
        try:
            warning_id = await asyncio.to_thread(_persist_sqlite)
        except Exception:
            logger.exception("SQLite pest warning log write failed")

        # ── 7e. Persist in MongoDB (idempotent per farm/day) + alerts ──
        if farm_doc is not None:
            try:
                from backend.models.pest_warning_log import upsert_pest_warning_log
                p_list = [{"pest_name": d["pest_name"], "confidence": d["confidence"]} for d in detected]
                await upsert_pest_warning_log(
                    farm_id=farm_doc.id,
                    date=str(data_date),
                    source="predict_today",
                    fields=sanitize_for_json({
                        "crop_type": request.crop,
                        "risk_score": round(risk_score, 4),
                        "risk_level": risk_level,
                        "model_name": "xgboost_multicrop_v2",
                        "model_version": model_version,
                        "shap_explanation": [f for f in top_features],
                        "counterfactual_prescription": prescription,
                        "detected_pests": p_list,
                        "economic_impact": economic_impact_data,
                        "raw_confidence": calibration_result.get("raw_confidence"),
                        "calibrated_confidence": calibration_result.get("calibrated_confidence"),
                        "confidence_band": calibration_result.get("confidence_band"),
                        "model_calibration_version": calibration_result.get("model_calibration_version"),
                    }),
                )
            except Exception:
                logger.exception("MongoDB pest warning log upsert failed (farm=%s)", farm_doc.id)

            if is_synthetic:
                logger.info("Synthetic weather for farm %s: skipping neighbour alerts and notifications", farm_doc.id)
            else:
                # Cross-role geospatial alert: High risk → neighbours within 5 km (idempotent per day)
                if risk_level == "High":
                    try:
                        from backend.services.geospatial_service import dispatch_5km_regional_alerts
                        threat = detected[0]["pest_name"] if detected else "High Pest Risk"
                        await dispatch_5km_regional_alerts(
                            origin_farm=farm_doc,
                            threat_name=threat,
                            risk_level="High",
                            radius_km=5.0,
                            weather_source=weather_source,
                        )
                    except Exception:
                        logger.exception("Neighbour alert dispatch failed (farm=%s)", farm_doc.id)

                # Multi-Channel Alert Delivery: "Treat Now" → notify the farm OWNER only
                owner_id = getattr(farm_doc, "owner_id", None)
                if (
                    owner_id is not None
                    and economic_impact_data
                    and economic_impact_data.get("recommendation") == "Treat Now"
                ):
                    try:
                        from backend.services.notification_service import notify_farmer
                        net_benefit = economic_impact_data.get("net_benefit", 0) or 0
                        await notify_farmer(owner_id, "treat_now_recommendation", {
                            "en": f"AgriGuard Advisory: 'Treat Now' recommended for your {request.crop}. Estimated net benefit of treating now: ₹{net_benefit:,.0f}.",
                            "ta": f"அக்ரிகார்ட் ஆலோசனைக் குறிப்பு: உங்கள் {request.crop} பயிருக்கு உடனடியாக சிகிச்சையளிக்க பரிந்துரைக்கப்படுகிறது. எதிர்பார்க்கப்படும் நிகர லாபம்: ₹{net_benefit:,.0f}.",
                            "hi": f"एग्रीगार्ड सलाह: आपकी {request.crop} फसल के लिए 'अभी उपचार करें' अनुशंसित है। कुल अनुमानित लाभ: ₹{net_benefit:,.0f}।",
                            "te": f"అగ్రిగార్డ్ సలహా: మీ {request.crop} పంటకు 'ఇప్పుడే చికిత్స చేయండి' అని సిఫార్సు చేయబడింది. అంచనా నికర ప్రయోజనం: ₹{net_benefit:,.0f}.",
                            "ml": f"അഗ്രിഗാർഡ് ഉപദേശം: നിങ്ങളുടെ {request.crop} വിളയ്ക്ക് 'ഉടൻ ചികിത്സിക്കുക' എന്ന് ശുപാർശ ചെയ്യുന്നു. പ്രതീക്ഷിക്കുന്ന അറ്റാദായം: ₹{net_benefit:,.0f}.",
                        })
                    except Exception:
                        logger.exception("Failed to deliver Treat Now notification (farm=%s)", farm_doc.id)

        return TodayWarningResponse(
            warning_id=warning_id or 0,
            warning_date=data_date,
            location=request.location,
            crop=request.crop,
            climate_zone=request.climate_zone,
            is_warning=is_warning,
            risk_score=round(risk_score, 4),
            risk_level=risk_level,
            alert_message=alert,
            likely_pests=[
                LikelyPest(
                    pest_name=d["pest_name"],
                    pest_type=d["pest_type"],
                    detection_status=d["detection_status"],
                    confidence=d["confidence"],
                    management_advice=d["management_advice"],
                )
                for d in detected
            ],
            top_features=[SHAPFeature(**f) for f in top_features],
            shap_interpretation=interpretation,
            shap_explanation=[f for f in top_features],
            counterfactual_prescription=prescription,
            economic_impact=economic_impact_data,
            weather_snapshot=weather_snapshot,
            raw_confidence=calibration_result.get("raw_confidence"),
            calibrated_confidence=calibration_result.get("calibrated_confidence"),
            confidence_band=calibration_result.get("confidence_band"),
            model_calibration_version=calibration_result.get("model_calibration_version"),
            calibration_method=calibration_result.get("calibration_method"),
            is_rule_fallback=(model_version == getattr(inference_service, "RULES_FALLBACK_VERSION", "rules-fallback-v2")),
            data_date=data_date,
            model_version=model_version,
            data_source="Synthetic climatology (NASA POWER unavailable)" if is_synthetic else "NASA POWER",
            data_quality=data_quality,
            farm_id=str(farm_doc.id) if farm_doc is not None else None,
        )

    except HTTPException:
        raise
    except Exception:
        logger.exception("Prediction failed")
        raise HTTPException(status_code=500, detail="Prediction failed. Please try again later.")
