"""
CropShield — Weather API (v2)
GET /api/v1/weather/current — latest NASA POWER observation
"""

from fastapi import APIRouter, Query, HTTPException
from backend.models.schemas import WeatherResponse
from backend.services.weather_service import fetch_latest_weather, get_today_weather_dict

router = APIRouter()


@router.get("/weather/current", response_model=WeatherResponse, summary="Latest Weather")
async def get_current_weather(
    latitude:  float = Query(9.1728),
    longitude: float = Query(77.8710),
    location:  str   = Query("Kovilpatti"),
):
    """Return the latest available daily weather from NASA POWER."""
    try:
        df = await fetch_latest_weather(latitude=latitude, longitude=longitude, days_back=5)
        w  = get_today_weather_dict(df)
        return WeatherResponse(
            location=location, latitude=latitude, longitude=longitude,
            date=str(w.get("date",""))[:10],
            t2m=round(float(w.get("t2m",0)),2),
            t2m_max=round(float(w.get("t2m_max",0)),2),
            t2m_min=round(float(w.get("t2m_min",0)),2),
            rh2m=round(float(w.get("rh2m",0)),2),
            ws2m=round(float(w.get("ws2m",0)),2),
            prectotcorr=round(float(w.get("prectotcorr",0)),2),
            allsky_sfc_sw_dwn=round(float(w.get("allsky_sfc_sw_dwn",0)),2),
            et0=round(float(w.get("et0",0)),2),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
