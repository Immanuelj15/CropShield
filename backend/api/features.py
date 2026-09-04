"""
CropShield — Features API (v2)
GET /api/v1/features — live engineered feature values for current day
"""

from fastapi import APIRouter, Query, HTTPException
from backend.models.schemas import (
    FeaturesResponse, WeatherFeatures, RollingFeatures, SoilFeatures
)
from backend.services import weather_service, soil_service

router = APIRouter()


@router.get("/features", response_model=FeaturesResponse, summary="Current Feature Values")
async def get_features(
    latitude:     float = Query(9.1728),
    longitude:    float = Query(77.8710),
    location:     str   = Query("Kovilpatti"),
    crop:         str   = Query("Cotton"),
    climate_zone: str   = Query("Dryland"),
):
    """
    Return today's engineered feature values: weather + rolling stats + soil profile.
    Useful for model explanation UI and feature debugging.
    """
    try:
        from ml.data.feature_engineering import engineer_features

        weather_df = await weather_service.fetch_latest_weather(
            latitude=latitude, longitude=longitude, days_back=35
        )
        fe_df = engineer_features(weather_df)
        w   = fe_df.iloc[-1].to_dict()
        raw = weather_service.get_today_weather_dict(weather_df)
        soil = soil_service.get_soil_profile(climate_zone)

        return FeaturesResponse(
            location=location, crop=crop, climate_zone=climate_zone,
            weather=WeatherFeatures(
                date=str(raw.get("date",""))[:10],
                t2m=round(float(raw.get("t2m",0)),2),
                t2m_max=round(float(raw.get("t2m_max",0)),2),
                t2m_min=round(float(raw.get("t2m_min",0)),2),
                rh2m=round(float(raw.get("rh2m",0)),2),
                ws2m=round(float(raw.get("ws2m",0)),2),
                prectotcorr=round(float(raw.get("prectotcorr",0)),2),
                allsky_sfc_sw_dwn=round(float(raw.get("allsky_sfc_sw_dwn",0)),2),
                et0=round(float(raw.get("et0",0)),2),
            ),
            rolling=RollingFeatures(
                t2m_rolling_3d=round(float(w.get("t2m_rolling_3d",0)),2),
                t2m_rolling_7d=round(float(w.get("t2m_rolling_7d",0)),2),
                t2m_rolling_14d=round(float(w.get("t2m_rolling_14d",0)),2),
                rh2m_rolling_3d=round(float(w.get("rh2m_rolling_3d",0)),2),
                rh2m_rolling_7d=round(float(w.get("rh2m_rolling_7d",0)),2),
                rh2m_rolling_14d=round(float(w.get("rh2m_rolling_14d",0)),2),
                rain_rolling_3d=round(float(w.get("rain_rolling_3d",0)),2),
                rain_rolling_7d=round(float(w.get("rain_rolling_7d",0)),2),
                rain_rolling_14d=round(float(w.get("rain_rolling_14d",0)),2),
            ),
            soil=SoilFeatures(
                soil_type=soil["soil_type"], ph=soil["ph"], ec=soil["ec"],
                organic_carbon=soil["organic_carbon"], nitrogen=soil["nitrogen"],
                phosphorus=soil["phosphorus"], potassium=soil["potassium"],
            ),
            derived={
                "temp_range":           round(float(w.get("temp_range",0)),2),
                "heat_index":           round(float(w.get("heat_index",0)),2),
                "vpd":                  round(float(w.get("vpd",0)),3),
                "consecutive_dry_days": int(w.get("consecutive_dry_days",0)),
                "consecutive_wet_days": int(w.get("consecutive_wet_days",0)),
                "rh_trend_7d":          round(float(w.get("rh_trend_7d",0)),3),
                "temp_trend_7d":        round(float(w.get("temp_trend_7d",0)),3),
                "rain_rolling_30d":     round(float(w.get("rain_rolling_30d",0)),2),
            },
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
