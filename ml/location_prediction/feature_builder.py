"""
AgriGuard AI — Advanced Feature Engineering Pipeline
Generates 12+ biophysical features from weather time-series, soil profiles, and crop stage.
"""

import math
import numpy as np

def calculate_vpd(temp_c: float, rh_pct: float) -> float:
    """Calculates Vapor Pressure Deficit (VPD) in kPa."""
    es = 0.61078 * math.exp((17.27 * temp_c) / (temp_c + 237.3))
    ea = es * (rh_pct / 100.0)
    return round(es - ea, 3)

def calculate_heat_index(temp_c: float, rh_pct: float) -> float:
    """Calculates Steadman Heat Index in °C."""
    tf = (temp_c * 9.0 / 5.0) + 32.0
    hi_f = 0.5 * (tf + 61.0 + ((tf - 68.0) * 1.2) + (rh_pct * 0.094))
    if hi_f >= 80.0:
        hi_f = (-42.379 + 2.04901523*tf + 10.14333127*rh_pct 
                - 0.22475541*tf*rh_pct - 0.00683783*tf*tf 
                - 0.05481717*rh_pct*rh_pct + 0.00122874*tf*tf*rh_pct 
                + 0.00085282*tf*rh_pct*rh_pct - 0.00000199*tf*tf*rh_pct*rh_pct)
    return round((hi_f - 32.0) * 5.0 / 9.0, 2)

def derive_crop_growth_stage(sowing_date_str: str = None) -> str:
    """
    Derives crop growth stage based on sowing date or seasonal defaults.
    """
    if not sowing_date_str:
        return "Vegetative Stage (Active Growth)"
    try:
        from datetime import datetime
        sowing_dt = datetime.strptime(sowing_date_str, "%Y-%m-%d")
        days = (datetime.now() - sowing_dt).days
        if days < 25:
            return "Seedling / Early Vegetative"
        elif days < 60:
            return "Active Vegetative & Branching"
        elif days < 95:
            return "Flowering & Pod/Grain Formation"
        else:
            return "Maturity & Pre-Harvest"
    except Exception:
        return "Vegetative Stage (Active Growth)"

def build_advanced_feature_vector(weather_df, soil_dict: dict, crop: str, sowing_date: str = None):
    """
    Transforms raw weather DataFrame + soil + crop into a rich feature dictionary.
    """
    if weather_df is None or weather_df.empty:
        # Fallback values
        t2m, rh2m, rain = 32.0, 78.0, 5.0
        ws2m, solar, pressure = 2.5, 20.0, 1012.0
        et0, dew = 4.2, 24.0
    else:
        last_row = weather_df.iloc[-1]
        t2m = float(last_row.get("t2m", 32.0))
        rh2m = float(last_row.get("rh2m", 78.0))
        rain = float(last_row.get("prectotcorr", 5.0))
        ws2m = float(last_row.get("ws2m", 2.5))
        solar = float(last_row.get("allsky_sfc_sw_dwn", 20.0))
        pressure = float(last_row.get("ps", 1012.0))
        et0 = float(last_row.get("et0", 4.2))
        dew = float(last_row.get("t2m_min", 24.0))

    # Rolling calculations if DataFrame available
    if weather_df is not None and len(weather_df) >= 7:
        t2m_roll_3d = float(weather_df["t2m"].tail(3).mean())
        t2m_roll_7d = float(weather_df["t2m"].tail(7).mean())
        t2m_roll_14d = float(weather_df["t2m"].tail(14).mean())
        
        rh2m_roll_3d = float(weather_df["rh2m"].tail(3).mean())
        rh2m_roll_7d = float(weather_df["rh2m"].tail(7).mean())
        rh2m_roll_14d = float(weather_df["rh2m"].tail(14).mean())
        
        rain_roll_7d = float(weather_df["prectotcorr"].tail(7).sum())
        rain_roll_14d = float(weather_df["prectotcorr"].tail(14).sum())
        
        # Dry / Wet days
        rain_series = weather_df["prectotcorr"].tail(14).values
        consecutive_dry = 0
        for r in reversed(rain_series):
            if r < 1.0: consecutive_dry += 1
            else: break
            
        consecutive_wet = 0
        for r in reversed(rain_series):
            if r >= 1.0: consecutive_wet += 1
            else: break
    else:
        t2m_roll_3d, t2m_roll_7d, t2m_roll_14d = t2m, t2m, t2m
        rh2m_roll_3d, rh2m_roll_7d, rh2m_roll_14d = rh2m, rh2m, rh2m
        rain_roll_7d, rain_roll_14d = rain * 7, rain * 14
        consecutive_dry = 5
        consecutive_wet = 0

    vpd = calculate_vpd(t2m, rh2m)
    heat_index = calculate_heat_index(t2m, rh2m)
    
    # Soil Fertility Index
    n = soil_dict.get("nitrogen", 180.0)
    p = soil_dict.get("phosphorus", 45.0)
    k = soil_dict.get("potassium", 150.0)
    ph = soil_dict.get("ph", 6.5)
    oc = soil_dict.get("organic_carbon", 0.65)
    soil_fertility_index = round(min(100.0, (n/200.0*30 + p/50.0*25 + k/160.0*25 + oc/1.0*20)), 1)
    
    growth_stage = derive_crop_growth_stage(sowing_date)
    
    # Raw feature dict
    return {
        "temperature_c": round(t2m, 1),
        "humidity_pct": round(rh2m, 1),
        "rainfall_today_mm": round(rain, 1),
        "wind_speed_ms": round(ws2m, 1),
        "solar_rad_mj": round(solar, 1),
        "pressure_hpa": round(pressure, 1),
        "et0_mm": round(et0, 1),
        "dew_point_c": round(dew, 1),
        "rolling_temp_7d": round(t2m_roll_7d, 1),
        "rolling_humidity_7d": round(rh2m_roll_7d, 1),
        "rainfall_trend_7d": round(rain_roll_7d, 1),
        "temp_trend": round(t2m - t2m_roll_7d, 2),
        "consecutive_dry_days": consecutive_dry,
        "consecutive_wet_days": consecutive_wet,
        "heat_index_c": heat_index,
        "vpd_kpa": vpd,
        "soil_fertility_index": soil_fertility_index,
        "crop_growth_stage": growth_stage
    }
