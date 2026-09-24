"""
CropShield / AgriGuard — Smart Irrigation Recommendation Service
Methodology: FAO-56 Penman-Monteith / Hargreaves Crop Water Requirement Approach
Equation:
    Crop Water Requirement (mm) = ET0 (Reference Evapotranspiration) * Kc (Crop Coefficient)
    Net Irrigation Need (mm)    = Crop Water Requirement - Effective Rainfall (USDA SCS Method)
Conversion:
    1 mm over 1 acre = 4,046.86 Liters
"""
import math
import logging
from datetime import datetime, date, timedelta
from typing import Optional, Dict, Any
from beanie import PydanticObjectId

from backend.models.farm import Farm
from backend.models.crop_water_coefficient import CropWaterCoefficient
from backend.models.farm_activity_plan import FarmActivityPlan
from backend.models.weather_snapshot import WeatherSnapshot

logger = logging.getLogger("cropshield.irrigation")


def compute_et0(t_max: float, t_min: float, solar_radiation: float) -> float:
    """
    Computes Reference Evapotranspiration (ET0 in mm/day) using the Hargreaves method.
    ET0 = 0.0023 * Ra * (Tmean + 17.8) * sqrt(Tmax - Tmin)
    NASA POWER fields:
    - T2M_MAX: maximum 2m air temp (°C)
    - T2M_MIN: minimum 2m air temp (°C)
    - ALLSKY_SFC_SW_DWN: all-sky surface shortwave downward irradiance (MJ/m^2/day or kW-hr/m^2/day)
    """
    try:
        t_max = float(t_max)
        t_min = float(t_min)
        sol = float(solar_radiation)
        
        # NASA POWER solar radiation is usually in MJ/m^2/day (approx 14 to 26 in tropical India).
        # If in kW-hr/m^2/day (e.g. 4.0 to 7.0), convert to MJ/m^2/day (* 3.6)
        if sol < 10.0:
            sol = sol * 3.6
        
        # Convert MJ/m^2/day to equivalent water depth in mm/day (approx factor 0.408)
        rad_mm = sol * 0.408
        
        t_mean = (t_max + t_min) / 2.0
        temp_diff = max(0.5, t_max - t_min)
        
        et0 = 0.0023 * rad_mm * (t_mean + 17.8) * math.sqrt(temp_diff)
        # Typical tropical Tamil Nadu ET0 ranges from 3.0 to 7.5 mm/day
        return max(1.5, min(10.0, round(et0, 2)))
    except Exception as e:
        logger.debug("Fallback ET0 computation due to: %s", e)
        return 4.5  # Standard tropical baseline (mm/day)


def compute_effective_rainfall(total_rainfall_mm: float) -> float:
    """
    Simplified USDA Soil Conservation Service (SCS) method for effective rainfall.
    Accounts for runoff and deep percolation loss.
    """
    rain = max(0.0, float(total_rainfall_mm or 0.0))
    if rain <= 0:
        return 0.0
    if rain <= 250.0:
        eff = rain * (125.0 - 0.2 * rain) / 125.0
    else:
        eff = 125.0 + 0.1 * rain
    return max(0.0, round(eff, 1))


def get_current_growth_stage(
    plan: Optional[FarmActivityPlan],
    water_coef: Optional[CropWaterCoefficient],
    today: Optional[date] = None,
) -> Dict[str, Any]:
    """
    Determines which FAO-56 growth stage (Initial / Development / Mid-season / Late-season)
    the crop is currently in, based on days elapsed since the sowing date.
    """
    if today is None:
        today = date.today()

    stages = water_coef.growth_stages if water_coef and water_coef.growth_stages else [
        {"stage_name": "Initial", "duration_days": 25, "kc": 0.40},
        {"stage_name": "Development", "duration_days": 35, "kc": 0.75},
        {"stage_name": "Mid-season", "duration_days": 45, "kc": 1.15},
        {"stage_name": "Late-season", "duration_days": 25, "kc": 0.65},
    ]

    if not plan or not plan.sowing_date:
        return {
            "stage_name": "Mid-season",
            "kc": 1.05,
            "days_since_sowing": 45,
            "days_remaining_in_stage": 15,
            "stage_progress_pct": 50,
        }

    try:
        sow_dt = datetime.strptime(str(plan.sowing_date).split("T")[0], "%Y-%m-%d").date()
        elapsed_days = max(0, (today - sow_dt).days)
    except Exception:
        elapsed_days = 30

    cum_days = 0
    for stage in stages:
        duration = stage.get("duration_days", 30)
        cum_days += duration
        if elapsed_days <= cum_days:
            stage_start = cum_days - duration
            days_in_stage = elapsed_days - stage_start
            rem_days = max(0, cum_days - elapsed_days)
            pct = round((days_in_stage / max(1, duration)) * 100, 1)
            return {
                "stage_name": stage.get("stage_name", "Vegetative"),
                "kc": stage.get("kc", 0.85),
                "duration_days": duration,
                "days_since_sowing": elapsed_days,
                "days_remaining_in_stage": rem_days,
                "stage_progress_pct": min(100, pct),
            }

    # If past total duration, classify as harvest / late-season
    last_stage = stages[-1]
    return {
        "stage_name": last_stage.get("stage_name", "Late-season (Maturity)"),
        "kc": last_stage.get("kc", 0.65),
        "duration_days": last_stage.get("duration_days", 25),
        "days_since_sowing": elapsed_days,
        "days_remaining_in_stage": 0,
        "stage_progress_pct": 100,
    }


async def get_irrigation_recommendation(farm_id: str) -> Dict[str, Any]:
    """
    Computes real-time smart irrigation advisory for a farm plot:
    1. Looks up farm & crop type
    2. Identifies current FAO-56 growth stage and corresponding Kc
    3. Retrieves latest NASA POWER weather telemetry (Tmax, Tmin, Solar, 7-day rain)
    4. Applies FAO-56 Hargreaves ET0 * Kc - USDA effective rainfall
    5. Converts net mm to Liters/acre and determines next watering date
    """
    farm_obj_id = PydanticObjectId(farm_id) if PydanticObjectId.is_valid(farm_id) else farm_id
    farm = await Farm.get(farm_obj_id)
    if not farm:
        raise ValueError(f"Farm not found with id: {farm_id}")

    crop_type = getattr(farm, "crop_type", "Cotton") or "Cotton"

    # 1. Fetch active activity plan
    active_plan = await FarmActivityPlan.find_one(
        FarmActivityPlan.farm_id == farm.id,
        FarmActivityPlan.is_active == True,
    )

    # 2. Fetch FAO-56 water coefficients
    water_coef = await CropWaterCoefficient.find_one(CropWaterCoefficient.crop_type == crop_type)
    if not water_coef:
        # Fallback search case-insensitive
        water_coef = await CropWaterCoefficient.find_one(
            {"crop_type": {"$regex": f"^{crop_type}$", "$options": "i"}}
        )

    # 3. Determine current growth stage & Kc
    today = date.today()
    stage_info = get_current_growth_stage(active_plan, water_coef, today)
    kc = stage_info["kc"]

    # 4. Fetch latest weather snapshot for this farm
    latest_weather = await WeatherSnapshot.find(
        WeatherSnapshot.farm_id == farm.id
    ).sort("-date").first_or_none()

    # Weather variables extraction with realistic agronomic fallbacks
    if latest_weather and latest_weather.raw:
        t_max = latest_weather.raw.get("T2M_MAX", latest_weather.temperature_c or 34.0)
        t_min = latest_weather.raw.get("T2M_MIN", 24.0)
        sol_rad = latest_weather.raw.get("ALLSKY_SFC_SW_DWN", 19.5)
        rain_7d = latest_weather.engineered.get("rain_sum_7d", latest_weather.rainfall_mm or 0.0)
    elif latest_weather:
        t_max = (latest_weather.temperature_c or 32.0) + 3.0
        t_min = max(18.0, (latest_weather.temperature_c or 32.0) - 5.0)
        sol_rad = 19.0
        rain_7d = latest_weather.rainfall_mm or 0.0
    else:
        # Default Tamil Nadu tropical conditions
        t_max, t_min, sol_rad, rain_7d = 34.5, 23.8, 19.8, 8.0

    # 5. Core calculations
    et0 = compute_et0(t_max, t_min, sol_rad)
    daily_crop_water_need_mm = round(et0 * kc, 2)
    weekly_crop_water_need_mm = round(daily_crop_water_need_mm * 7.0, 1)

    effective_rain_mm = compute_effective_rainfall(rain_7d)
    net_irrigation_mm = max(0.0, round(weekly_crop_water_need_mm - effective_rain_mm, 1))

    # 1 mm over 1 acre = 4,046.86 Liters
    liters_per_acre = round(net_irrigation_mm * 4046.86, 0)
    
    # Scale to farm land area if available
    area_acres = getattr(farm, "area_hectares", 1.0) * 2.47105
    total_farm_liters = round(liters_per_acre * area_acres, 0)

    # 6. Estimate next irrigation date & urgency
    if net_irrigation_mm > 25.0:
        urgency = "High"
        next_irrigation_date = (today + timedelta(days=1)).isoformat()
        status_note = "High moisture depletion: immediate irrigation recommended within 24-48 hours."
    elif net_irrigation_mm > 8.0:
        urgency = "Moderate"
        next_irrigation_date = (today + timedelta(days=3)).isoformat()
        status_note = "Normal weekly irrigation replenishment required."
    else:
        urgency = "Low"
        next_irrigation_date = (today + timedelta(days=7)).isoformat()
        status_note = f"Recent rainfall of {rain_7d:.1f}mm ({effective_rain_mm:.1f}mm effective) is sufficient. Postpone watering."

    source_citation = water_coef.source_note if water_coef else "FAO-56 Irrigation & Drainage Paper No. 56, Table 12"

    reason_text = (
        f"Based on {stage_info['stage_name']} growth stage (Kc = {kc}), "
        f"evapotranspiration demand of {daily_crop_water_need_mm:.1f}mm/day ({et0:.1f}mm ET₀), "
        f"offset by {effective_rain_mm:.1f}mm effective rainfall over the last 7 days."
    )

    return {
        "farm_id": str(farm.id),
        "farm_name": getattr(farm, "farm_name", "Plot 1"),
        "crop_type": crop_type,
        "current_growth_stage": stage_info["stage_name"],
        "stage_details": stage_info,
        "crop_coefficient_kc": kc,
        "reference_et0_mm_per_day": et0,
        "daily_crop_water_need_mm": daily_crop_water_need_mm,
        "weekly_crop_water_need_mm": weekly_crop_water_need_mm,
        "recent_7d_rainfall_mm": round(float(rain_7d), 1),
        "effective_rainfall_mm": effective_rain_mm,
        "recommended_irrigation_mm": net_irrigation_mm,
        "recommended_irrigation_liters_per_acre": liters_per_acre,
        "total_farm_liters": total_farm_liters,
        "farm_area_acres": round(area_acres, 2),
        "urgency": urgency,
        "next_irrigation_date": next_irrigation_date,
        "status_note": status_note,
        "reason": reason_text,
        "methodology": "FAO-56 Hargreaves ET0 * Kc - USDA SCS Effective Rainfall",
        "source_note": source_citation,
        "evaluated_at": datetime.utcnow().isoformat(),
    }
