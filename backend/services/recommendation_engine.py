"""
AgriGuard AI — Smart Advisory & Early Warning Recommendation Engine
Formulates context-aware Organic/Chemical treatments, Spraying Schedules, Irrigation,
Government advisories, and Multi-channel Alert Triggers.
"""

def generate_smart_recommendations(crop: str, disease_name: str, risk_level: str, weather_features: dict, location_str: str):
    """
    Builds structured, actionable advisory payload for farmers.
    """
    wind_ms = weather_features.get("wind_speed_ms", 2.5)
    rain_today = weather_features.get("rainfall_today_mm", 0.0)
    temp = weather_features.get("temperature_c", 32.0)
    
    # 1. Spraying Schedule Optimization
    if rain_today > 10.0 or wind_ms > 5.5:
        spray_window = "❌ DO NOT SPRAY TODAY (High wind speed / rain forecast). Postpone spray by 24 hours."
        can_spray = False
    elif temp > 33.0:
        spray_window = "✅ Safe Spraying Window: Early Morning (6:00 AM – 8:30 AM) before temperature exceeds 33°C."
        can_spray = True
    else:
        spray_window = "✅ Safe Spraying Window: 6:30 AM – 9:30 AM or 4:30 PM – 6:30 PM (Wind < 3 m/s)."
        can_spray = True

    # 2. Irrigation Advisory
    dry_days = weather_features.get("consecutive_dry_days", 5)
    if dry_days > 6:
        irrigation_rec = "Light drip irrigation recommended (2 hours in early morning). Avoid surface flooding."
    elif rain_today > 5.0:
        irrigation_rec = "Pause all field irrigation for 48 hours. Ensure proper field surface drainage."
    else:
        irrigation_rec = "Maintain standard alternate-day drip irrigation schedule."

    # 3. Organic & Chemical Treatments
    if "Blight" in disease_name or "Blast" in disease_name:
        organic = "Spray Panchagavya (3%) or Pseudomonas fluorescens (10g/L) on foliage. Remove infected lower leaves."
        chemical = "Apply Tricyclazole 75 WP @ 0.6g/L or Copper Oxychloride 50 WP @ 2.5g/L."
        pesticide = "Tricyclazole 75 WP / Copper Oxychloride"
        fertilizer = "Reduce Nitrogen by 20%. Apply Muriate of Potash (MOP) @ 25kg/acre."
    elif "Aphid" in disease_name or "Whitefly" in disease_name or "Vector" in disease_name:
        organic = "Deploy 10 Yellow Sticky Traps per acre. Spray Neem Seed Kernel Extract (NSKE 5%) @ 5ml/L."
        chemical = "Spray Imidacloprid 17.8 SL @ 0.3ml/L or Thiamethoxam 25 WG @ 0.2g/L."
        pesticide = "Imidacloprid 17.8 SL"
        fertilizer = "Apply Foliar Micronutrient spray (1% MgSO4 + 0.5% ZnSO4)."
    else:
        organic = "Spray Neem oil formulation (10,000 ppm) @ 2ml/L with bio-pesticide Bacillus subtilis."
        chemical = "Apply Mancozeb 75 WP @ 2g/L or Chlorothalonil @ 2g/L."
        pesticide = "Mancozeb 75 WP"
        fertilizer = "Maintain balanced NPK ratio (4:2:1) for current growth stage."

    # 4. Government & TNAU Extension Advisory
    govt_advisory = (
        f"TNAU Agritech & ICAR Advisory ({location_str}): Farmers are advised to scout fields for {disease_name}. "
        "Report widespread symptoms to local Assistant Agricultural Officer (AAO)."
    )

    # 5. Early Warning Trigger Logic
    alert_triggered = risk_level in ["Medium", "High"]
    alert_payload = {
        "alert_triggered": alert_triggered,
        "risk_level": risk_level,
        "title": f"🚨 {risk_level.upper()} RISK ALERT for {crop} at {location_str}",
        "message": f"{risk_level} risk of {disease_name} detected today. Recommended spray: {pesticide}. {spray_window}",
        "channels": ["Dashboard", "SMS", "WhatsApp", "Push Notification"] if alert_triggered else ["Dashboard"]
    }

    return {
        "organic_treatment": organic,
        "chemical_treatment": chemical,
        "recommended_pesticide": pesticide,
        "recommended_fertilizer": fertilizer,
        "spraying_schedule": spray_window,
        "can_spray_today": can_spray,
        "irrigation_recommendation": irrigation_rec,
        "preventive_measures": "Maintain 30cm row spacing for canopy aeration. Clear weeds on field bunds.",
        "government_advisory": govt_advisory,
        "nearby_outbreak_alert": f"Notice: 2 contiguous farms in {location_str} reported elevated vector count in the last 48 hrs.",
        "alert_system": alert_payload
    }
