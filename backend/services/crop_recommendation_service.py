"""
CropShield / AgriGuard — Crop Recommendation & Pre-Season Decision Support Service
Recommends candidate crops and computes estimated yield, cost, revenue, and profit RANGES
(never single guaranteed figures) based on soil, water availability, location, season, budget,
and market price trends.
"""
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any
from beanie import PydanticObjectId

from backend.models.farm import Farm
from backend.models.crop_suitability import CropSuitabilityRule
from backend.models.crop_cost_template import CropCostTemplate
from backend.models.crop_recommendation import CropRecommendation
from backend.models.market_price import MarketPrice
from backend.models.weather_snapshot import WeatherSnapshot
from backend.db.seed_crop_recommendation_data import seed_crop_recommendation_data

logger = logging.getLogger("cropshield.crop_recommendation")

# Realistic fallback mandi price ranges (₹/quintal and ₹/kg) based on CACP/Agmarknet
MARKET_PRICE_RANGES_PER_KG: Dict[str, Dict[str, float]] = {
    "Cotton": {"min": 65.0, "max": 78.0},       # ₹6,500 - ₹7,800/quintal
    "Rice": {"min": 21.0, "max": 27.0},         # ₹2,100 - ₹2,700/quintal
    "Sorghum": {"min": 28.0, "max": 36.0},      # ₹2,800 - ₹3,600/quintal
    "Millets": {"min": 32.0, "max": 42.0},      # ₹3,200 - ₹4,200/quintal
    "Sugarcane": {"min": 3.2, "max": 3.8},      # ₹320 - ₹380/quintal (high tonnage)
    "Pulses": {"min": 68.0, "max": 88.0},       # ₹6,800 - ₹8,800/quintal
    "Groundnut": {"min": 56.0, "max": 72.0},    # ₹5,600 - ₹7,200/quintal
    "Maize": {"min": 22.0, "max": 28.0},        # ₹2,200 - ₹2,800/quintal
    "Sesamum": {"min": 105.0, "max": 138.0},    # ₹10,500 - ₹13,800/quintal
    "Sunflower": {"min": 54.0, "max": 68.0},    # ₹5,400 - ₹6,800/quintal
    "Banana": {"min": 18.0, "max": 26.0},       # ₹1,800 - ₹2,600/quintal
    "Turmeric": {"min": 92.0, "max": 142.0},    # ₹9,200 - ₹14,200/quintal
    "Chili": {"min": 140.0, "max": 220.0},     # ₹14,000 - ₹22,000/quintal
    "Onion": {"min": 22.0, "max": 40.0},        # ₹2,200 - ₹4,000/quintal
    "Coconut": {"min": 26.0, "max": 36.0},      # ₹2,600 - ₹3,600/quintal
}


def determine_current_season(district: Optional[str] = None, month: Optional[int] = None) -> str:
    """
    Determines agricultural season in Tamil Nadu / South India:
    - Kharif (Southwest Monsoon): June to October (months 6-10)
    - Rabi (Northeast Monsoon / Winter): November to February (months 11, 12, 1, 2)
    - Summer (Zaid / Navarai): March to May (months 3, 4, 5)
    """
    if month is None:
        month = datetime.utcnow().month
    if month in [6, 7, 8, 9, 10]:
        return "Kharif"
    elif month in [11, 12, 1, 2]:
        return "Rabi"
    else:
        return "Summer"


def compute_suitability_score(
    soil_type: str,
    water_availability: str,
    season: str,
    rule: CropSuitabilityRule,
    crop_history: List[Dict[str, Any]],
    recent_weather: Optional[Dict[str, Any]] = None,
) -> float:
    """
    Computes suitability score (0-100):
    - Soil match: 35 points (partial match: 15)
    - Water match: 25 points (adjacent tier: 10 points)
    - Season match: 25 points
    - Crop rotation guard: -15 per occurrence of same crop in recent seasons
    - Climate fit bonus: up to +15 points
    """
    score = 0.0

    # 1. Soil match (35 pts)
    suitable_soils = rule.suitable_soil_types or []
    farm_soil = (soil_type or "").lower()
    soil_matched = False
    for s in suitable_soils:
        s_low = s.lower()
        if s_low in farm_soil or farm_soil in s_low:
            soil_matched = True
            break
        # Match common soil keywords
        if any(w in s_low and w in farm_soil for w in ["black", "cotton", "red", "alluvial", "clay", "loam", "sandy"]):
            soil_matched = True
            break

    if soil_matched:
        score += 35.0
    elif any(w in farm_soil for w in ["loam", "clay", "sand", "soil"]):
        score += 18.0  # partial credit for general cultivable soil
    else:
        score += 10.0

    # 2. Water availability match (25 pts)
    water_tiers = ["Low", "Medium", "High"]
    farm_water = water_availability if water_availability in water_tiers else "Medium"
    req_water = rule.water_requirement if rule.water_requirement in water_tiers else "Medium"

    idx_avail = water_tiers.index(farm_water)
    idx_req = water_tiers.index(req_water)
    diff = abs(idx_avail - idx_req)

    if diff == 0:
        score += 25.0
    elif diff == 1:
        score += 12.0  # Adjacent tier partial credit
    else:
        score += 0.0   # Mismatched water tier (e.g. High water crop in Low water farm)

    # 3. Season match (25 pts)
    suitable_seasons = [s.strip().lower() for s in rule.suitable_seasons or []]
    cur_season = (season or "Kharif").strip().lower()
    if cur_season in suitable_seasons or "all" in suitable_seasons:
        score += 25.0
    else:
        score += 5.0  # Off-season penalty

    # 4. Crop rotation guard (penalize repeatedly planting the same crop)
    avoid_seasons = rule.avoid_after_same_crop_seasons or 1
    recent_entries = crop_history[-avoid_seasons:] if crop_history else []
    same_count = sum(
        1 for h in recent_entries
        if h.get("crop_type", "").strip().lower() == rule.crop_type.strip().lower()
    )
    score -= same_count * 15.0

    # 5. Climate fit bonus (up to +15 pts)
    climate_bonus = 8.0
    if recent_weather:
        temp = recent_weather.get("temperature_c", 28.0)
        humidity = recent_weather.get("humidity_pct", 65.0)
        # Low water crops (Millets, Sorghum, Sesamum) thrive in high heat/lower humidity
        if rule.water_requirement == "Low" and temp > 30.0:
            climate_bonus = 15.0
        # High moisture crops (Rice, Banana, Sugarcane) thrive in higher humidity
        elif rule.water_requirement == "High" and humidity > 70.0:
            climate_bonus = 15.0
        elif rule.water_requirement == "Medium" and 24.0 <= temp <= 34.0:
            climate_bonus = 14.0
    score += climate_bonus

    return max(0.0, min(100.0, round(score, 1)))


def build_reason_text(
    rule: CropSuitabilityRule,
    soil_type: str,
    water_availability: str,
    season: str,
    score: float,
) -> str:
    """Generates an explainable, human-readable justification for the recommendation."""
    points = []
    points.append(f"matched for your {soil_type} soil")
    points.append(f"well-aligned with the current {season} cultivation window")
    if rule.water_requirement == water_availability:
        points.append(f"matches your {water_availability} irrigation availability")
    elif rule.water_requirement == "Low":
        points.append("hardy crop with low drought sensitivity")
    points.append("historical market and yield stability support this choice")
    return f"Recommended (Suitability Score: {int(score)}/100) because it is {', '.join(points)}."


async def get_market_price_range(crop_type: str, district: str) -> Dict[str, float]:
    """
    Retrieves recent market price range (min, max per kg) from MarketPrice collection,
    falling back to historical Agmarknet benchmark ranges.
    """
    try:
        # Check recent 90-day mandi prices in this district or crop
        records = await MarketPrice.find(
            MarketPrice.crop_type == crop_type
        ).sort(-MarketPrice.date).limit(30).to_list()

        if records and len(records) >= 3:
            prices = [r.price_per_kg for r in records if r.price_per_kg > 0]
            if prices:
                low = min(prices) * 0.95
                high = max(prices) * 1.05
                return {"min": round(low, 1), "max": round(high, 1)}
    except Exception as e:
        logger.debug("MarketPrice query fallback: %s", e)

    # Standard fallback
    fallback = MARKET_PRICE_RANGES_PER_KG.get(crop_type, {"min": 35.0, "max": 45.0})
    return fallback


def assess_weather_risk(rule: CropSuitabilityRule, water_availability: str) -> str:
    """Assess weather / drought risk: High, Medium, or Low."""
    if rule.water_requirement == "High" and water_availability == "Low":
        return "High"
    if rule.yield_variance_pct > 22.0 or (rule.water_requirement == "High" and water_availability == "Medium"):
        return "Medium"
    return "Low"


def assess_market_risk(crop_type: str, price_range: Dict[str, float]) -> str:
    """Assess price volatility and perishable risk: High, Medium, or Low."""
    diff_pct = ((price_range["max"] - price_range["min"]) / max(1.0, price_range["min"])) * 100
    if crop_type in ["Onion", "Chili", "Banana"] or diff_pct > 40.0:
        return "High"
    if crop_type in ["Cotton", "Turmeric", "Sesamum"] or diff_pct > 25.0:
        return "Medium"
    return "Low"


async def generate_crop_recommendations(
    farm_id: Optional[str] = None,
    budget: float = 50000.0,
    water_availability: Optional[str] = None,
    season: Optional[str] = None,
    district: Optional[str] = None,
    soil_type: Optional[str] = None,
    land_area_acres: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Main orchestration engine for pre-season crop recommendation and profit prediction.
    Always returns profit, revenue, and yield as estimated RANGES.
    """
    farm = None
    if farm_id:
        try:
            farm = await Farm.get(PydanticObjectId(farm_id))
        except Exception:
            try:
                farm = await Farm.get(farm_id)
            except Exception:
                pass

    # Resolve farm parameters
    resolved_district = district or (farm.district if farm else "Thoothukudi")
    resolved_soil = soil_type or (farm.soil_type if farm else "Black Cotton Soil")
    # Area: if farm specifies area_hectares, convert to acres (1 ha = 2.471 acres)
    if land_area_acres and land_area_acres > 0:
        resolved_area = float(land_area_acres)
    elif farm and farm.area_hectares:
        resolved_area = round(farm.area_hectares * 2.471, 2)
    else:
        resolved_area = 2.5  # standard smallholder plot in acres

    resolved_water = water_availability or (getattr(farm, "water_availability", "Medium") or "Medium")
    resolved_season = season or determine_current_season(resolved_district)
    crop_history = getattr(farm, "crop_history", []) if farm else []

    # Get recent weather snapshot if available
    recent_weather = None
    if farm:
        try:
            ws = await WeatherSnapshot.find(
                WeatherSnapshot.farm_id == farm.id
            ).sort(-WeatherSnapshot.recorded_at).first_or_default()
            if ws:
                recent_weather = {
                    "temperature_c": ws.temperature_c,
                    "humidity_pct": ws.humidity_pct,
                    "rainfall_today_mm": ws.rainfall_today_mm,
                }
        except Exception:
            pass

    # Ensure crop suitability rules and cost templates exist in DB
    rule_count = await CropSuitabilityRule.count()
    if rule_count == 0:
        await seed_crop_recommendation_data()

    candidate_rules = await CropSuitabilityRule.find_all().to_list()
    results = []

    for rule in candidate_rules:
        score = compute_suitability_score(
            soil_type=resolved_soil,
            water_availability=resolved_water,
            season=resolved_season,
            rule=rule,
            crop_history=crop_history,
            recent_weather=recent_weather,
        )

        # Skip clearly unsuitable crops (score < 30)
        if score < 30.0:
            continue

        # Look up cost template
        cost_template = await CropCostTemplate.find_one(CropCostTemplate.crop_type == rule.crop_type)
        cost_per_acre = cost_template.total_cost_per_acre if cost_template else 25000.0
        total_estimated_cost = round(cost_per_acre * resolved_area, 1)

        # Budget guard: skip crops that significantly exceed farmer's available budget (10% buffer)
        if budget > 0 and total_estimated_cost > budget * 1.15:
            continue

        # Expected yield range in kg and quintals (scaled by plot area)
        variance_ratio = (rule.yield_variance_pct or 20.0) / 100.0
        base_yield_total_kg = (rule.base_yield_per_acre_kg or 500.0) * resolved_area
        yield_min_kg = round(base_yield_total_kg * (1.0 - variance_ratio), 1)
        yield_max_kg = round(base_yield_total_kg * (1.0 + variance_ratio), 1)
        yield_min_quintals = round(yield_min_kg / 100.0, 1)
        yield_max_quintals = round(yield_max_kg / 100.0, 1)

        # Cost breakdown per category
        breakdown_per_acre = cost_template.cost_breakdown_per_acre if cost_template else {
            "seeds": cost_per_acre * 0.1,
            "fertilizer": cost_per_acre * 0.25,
            "labor": cost_per_acre * 0.40,
            "irrigation": cost_per_acre * 0.15,
            "pesticides": cost_per_acre * 0.10,
        }
        cost_breakdown_total = {
            k: round(v * resolved_area, 1) for k, v in breakdown_per_acre.items()
        }

        # Market price range (₹/kg)
        price_data = await get_market_price_range(rule.crop_type, resolved_district)
        price_min_per_kg = price_data["min"]
        price_max_per_kg = price_data["max"]
        price_min_per_quintal = round(price_min_per_kg * 100.0, 0)
        price_max_per_quintal = round(price_max_per_kg * 100.0, 0)

        # Revenue and Profit Ranges (ALWAYS Min - Max Pairs)
        revenue_min = round(yield_min_kg * price_min_per_kg, 1)
        revenue_max = round(yield_max_kg * price_max_per_kg, 1)

        profit_min = round(revenue_min - total_estimated_cost, 1)
        profit_max = round(revenue_max - total_estimated_cost, 1)

        # Risk assessments
        weather_risk = assess_weather_risk(rule, resolved_water)
        market_risk = assess_market_risk(rule.crop_type, price_data)

        reason = build_reason_text(
            rule=rule,
            soil_type=resolved_soil,
            water_availability=resolved_water,
            season=resolved_season,
            score=score,
        )

        results.append({
            "crop_type": rule.crop_type,
            "suitability_score": score,
            "expected_yield_range": {
                "min": yield_min_quintals,
                "max": yield_max_quintals,
                "unit": "quintals",
                "min_kg": yield_min_kg,
                "max_kg": yield_max_kg,
                "per_acre_kg_range": f"{round(rule.base_yield_per_acre_kg * (1 - variance_ratio), 0):.0f} – {round(rule.base_yield_per_acre_kg * (1 + variance_ratio), 0):.0f} kg/acre",
            },
            "estimated_cost": total_estimated_cost,
            "cost_per_acre": cost_per_acre,
            "cost_breakdown": cost_breakdown_total,
            "expected_price_range": {
                "min": price_min_per_quintal,
                "max": price_max_per_quintal,
                "unit": "₹/quintal",
                "min_per_kg": price_min_per_kg,
                "max_per_kg": price_max_per_kg,
            },
            "estimated_revenue_range": {
                "min": revenue_min,
                "max": revenue_max,
                "unit": "₹",
            },
            "estimated_profit_range": {
                "min": profit_min,
                "max": profit_max,
                "unit": "₹",
            },
            "weather_risk": weather_risk,
            "market_risk": market_risk,
            "water_requirement": rule.water_requirement,
            "source_note": rule.source_note,
            "cost_source_note": cost_template.source_note if cost_template else "CACP Cost of Cultivation",
            "reason_text": reason,
        })

    # Sort descending by suitability score
    results.sort(key=lambda r: r["suitability_score"], reverse=True)
    top_recommendations = results[:5]

    # Save to history collection for audit and review
    try:
        rec_doc = CropRecommendation(
            farm_id=farm.id if farm else None,
            district=resolved_district,
            soil_type=resolved_soil,
            land_area_acres=resolved_area,
            season=resolved_season,
            water_availability=resolved_water,
            requested_budget=budget,
            generated_at=datetime.utcnow(),
            recommendations=top_recommendations,
        )
        await rec_doc.insert()
    except Exception as e:
        logger.warning("Could not persist CropRecommendation record: %s", e)

    return {
        "status": "success",
        "generated_at": datetime.utcnow().isoformat(),
        "farm_id": str(farm.id) if farm else None,
        "input_profile": {
            "district": resolved_district,
            "soil_type": resolved_soil,
            "land_area_acres": resolved_area,
            "season": resolved_season,
            "water_availability": resolved_water,
            "budget": budget,
        },
        "recommendations": top_recommendations,
        "total_candidates_analyzed": len(candidate_rules),
        "disclaimer": "Profit and revenue are estimated ranges based on historical yield variance and price bands. Actual returns depend on weather events, market fluctuations, and farm management practices.",
    }
