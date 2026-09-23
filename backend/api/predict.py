"""
CropShield — /predict-today API Route (v2)
Generates today's pest warning using live NASA POWER weather
and the XGBoost model trained on 1980–2025 historical data.
"""

from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.models.schemas import TodayWarningRequest, TodayWarningResponse, SHAPFeature, LikelyPest
from backend.models.db_models import PestWarningLog, RiskLevel, ClimateZone
from backend.services import weather_service, soil_service, pest_service, inference_service
from backend.services.calibration_service import calibrate_prediction
from backend.utils.serialization import sanitize_for_json

router = APIRouter()


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
):
    try:
        # ── 1. Fetch latest 35 days of weather ────────────────
        weather_df = await weather_service.fetch_latest_weather(
            latitude=request.latitude,
            longitude=request.longitude,
            days_back=35,
        )
        today_weather = weather_service.get_today_weather_dict(weather_df)
        data_date = weather_df["date"].max()
        if hasattr(data_date, "date"):
            data_date = data_date.date()

        # ── 2. Soil profile ───────────────────────────────────
        soil = soil_service.get_soil_profile(request.climate_zone)
        soil_mult = soil_service.get_soil_risk_multiplier(soil, request.crop)

        # ── 3. ML inference (today's warning) ─────────────────
        risk_score, risk_level, top_features, model_version = (
            inference_service.predict_today(
                weather_series=weather_df,
                soil=soil,
                crop=request.crop,
                climate_zone=request.climate_zone,
            )
        )
        # Subtle soil modulation
        risk_score = min(1.0, risk_score * soil_mult)
        risk_level = inference_service.score_to_risk_level(risk_score)

        # ── 3b. Post-hoc Platt calibration ────────────────────
        try:
            from ml.data.feature_engineering import build_live_feature_row
            mgr = inference_service.model_manager
            X_df_cal = build_live_feature_row(weather_df, soil, request.crop, request.climate_zone)
            for col in mgr.features:
                if col not in X_df_cal.columns:
                    X_df_cal[col] = 0.0
            X_df_cal = X_df_cal[mgr.features]
            import numpy as np
            X_scaled_cal = mgr.scaler.transform(X_df_cal.values.astype(np.float32))
            raw_probs = mgr.model.predict_proba(X_scaled_cal)[0]
            calibration_result = calibrate_prediction(
                X_scaled=X_scaled_cal,
                raw_score=risk_score,
                risk_level=risk_level,
                raw_probs=raw_probs,
            )
        except Exception as cal_err:
            print(f"[WARN] Calibration fallback: {cal_err}")
            calibration_result = calibrate_prediction(
                X_scaled=None,
                raw_score=risk_score,
                risk_level=risk_level,
            )
        is_warning = risk_level in ("Medium", "High")

        # ── 4. Rule-based pest detection ──────────────────────
        # Build weather dict for detection rules
        from ml.data.feature_engineering import engineer_features
        fe_df  = engineer_features(weather_df)
        fe_row = fe_df.iloc[-1].to_dict()

        detected = pest_service.detect_pests(
            crop=request.crop,
            weather_features=fe_row,
            soil_features=soil,
        )

        # ── 5. SHAP interpretation ────────────────────────────
        interpretation = inference_service.build_shap_interpretation(top_features)

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

        # ── 7. Persist warning ────────────────────────────────
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
            calibrated_confidence=calibration_result.get("calibrated_confidence") or (risk_score * 0.95),
            detected_pests=detected,
            weather_snapshot=weather_snapshot,
            soil=soil,
        )

        # ── 7d. Persist Warning in SQLite ─────────────────────
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
            weather_snapshot=today_weather,
            economic_impact=economic_impact_data,
            model_version=model_version,
        )
        db.add(warning)
        db.commit()
        db.refresh(warning)

        # ── 7e. Persist in MongoDB Beanie ──────────────────────
        try:
            from backend.models.pest_warning_log import PestWarningLog as MongoWarningLog
            from backend.models.farm import Farm as MongoFarm
            from backend.services.geospatial_service import dispatch_5km_regional_alerts
            farm_doc = await MongoFarm.find_one(MongoFarm.district == request.location) or await MongoFarm.find_one()
            if farm_doc:
                p_list = [{"pest_name": d["pest_name"], "confidence": d["confidence"]} for d in detected]
                mongo_log = MongoWarningLog(
                    farm_id=farm_doc.id,
                    date=str(data_date),
                    crop_type=request.crop,
                    risk_score=round(risk_score, 4),
                    risk_level=risk_level,
                    model_name="xgboost_multicrop_v2",
                    model_version=model_version,
                    shap_explanation=[f for f in top_features],
                    counterfactual_prescription=prescription,
                    detected_pests=p_list,
                    economic_impact=economic_impact_data,
                    raw_confidence=calibration_result.get("raw_confidence"),
                    calibrated_confidence=calibration_result.get("calibrated_confidence"),
                    confidence_band=calibration_result.get("confidence_band"),
                    model_calibration_version=calibration_result.get("model_calibration_version"),
                    verified_by=None,
                    verified_at=None,
                )
                await mongo_log.insert()

                # Cross-role automatic geospatial alert: If risk is High, notify neighboring farms within 5km
                if risk_level == "High":
                    threat = p_list[0]["pest_name"] if p_list else "High Pest Risk"
                    await dispatch_5km_regional_alerts(
                        origin_farm=farm_doc,
                        threat_name=threat,
                        risk_level="High",
                        radius_km=5.0
                    )
        except Exception as mongo_err:
            print(f"[WARN] MongoDB warning log / alert dispatch error: {mongo_err}")

        return TodayWarningResponse(
            warning_id=warning.id,
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
            data_date=data_date,
            model_version=model_version,
        )


    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")
