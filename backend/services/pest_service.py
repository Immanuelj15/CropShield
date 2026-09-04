"""
CropShield — Pest Detection Service
Rule-based pest detection engine with crop-specific pest profiles.
Covers: Cotton, Sorghum, Millets, Rice, Sugarcane, Pulses
"""

from typing import Dict, List, Tuple, Any
import math


# ── Pest Reference Database ──────────────────────────────────
# Each pest entry defines:
#   - Favorable temperature range (°C)
#   - Favorable humidity range (%)
#   - Weekly rainfall thresholds
#   - Consecutive dry days threshold (for sucking pests)
#   - Weighted detection rules

PEST_DATABASE: Dict[str, List[Dict]] = {
    "Cotton": [
        {
            "pest_name": "American Bollworm",
            "scientific_name": "Helicoverpa armigera",
            "pest_type": "Insect",
            "favorable_temp_min": 25.0,
            "favorable_temp_max": 38.0,
            "favorable_rh_min": 40.0,
            "favorable_rh_max": 75.0,
            "favorable_rain_max_7d": 20.0,   # low rain favors
            "dry_spell_days": 5,
            "detection_weight": 0.30,
            "description": "Major cotton pest; larvae bore into bolls.",
            "symptoms": "Entry holes in bolls, premature boll shedding, frass near entry points.",
            "management": "Use pheromone traps, spray Bt (Bacillus thuringiensis), NPV at dusk. Avoid excessive N fertilization.",
        },
        {
            "pest_name": "Cotton Whitefly",
            "scientific_name": "Bemisia tabaci",
            "pest_type": "Insect",
            "favorable_temp_min": 26.0,
            "favorable_temp_max": 40.0,
            "favorable_rh_min": 30.0,
            "favorable_rh_max": 65.0,
            "favorable_rain_max_7d": 10.0,
            "dry_spell_days": 7,
            "detection_weight": 0.25,
            "description": "Sucking pest; vector of cotton leaf curl virus.",
            "symptoms": "Yellowing leaves, honeydew secretion, sooty mold.",
            "management": "Neem oil spray (2%), yellow sticky traps, imidacloprid seed treatment.",
        },
        {
            "pest_name": "Thrips",
            "scientific_name": "Thrips tabaci",
            "pest_type": "Insect",
            "favorable_temp_min": 28.0,
            "favorable_temp_max": 42.0,
            "favorable_rh_min": 25.0,
            "favorable_rh_max": 60.0,
            "favorable_rain_max_7d": 8.0,
            "dry_spell_days": 6,
            "detection_weight": 0.20,
            "description": "Tiny sucking insects; worst in hot dry spells.",
            "symptoms": "Silvery streaks on leaves, leaf curl, stunted growth.",
            "management": "Spinosad spray, reflective mulch, avoid water stress.",
        },
        {
            "pest_name": "Aphid",
            "scientific_name": "Aphis gossypii",
            "pest_type": "Insect",
            "favorable_temp_min": 20.0,
            "favorable_temp_max": 30.0,
            "favorable_rh_min": 60.0,
            "favorable_rh_max": 90.0,
            "favorable_rain_min_7d": 10.0,
            "dry_spell_days": 0,
            "detection_weight": 0.25,
            "description": "Colony-forming sucking pest on tender parts.",
            "symptoms": "Leaf curl, honeydew, stunted growth.",
            "management": "Dimethoate spray, conserve natural enemies (ladybird beetles).",
        },
    ],

    "Sorghum": [
        {
            "pest_name": "Stem Borer",
            "scientific_name": "Chilo partellus",
            "pest_type": "Insect",
            "favorable_temp_min": 25.0,
            "favorable_temp_max": 35.0,
            "favorable_rh_min": 50.0,
            "favorable_rh_max": 85.0,
            "favorable_rain_min_7d": 15.0,
            "dry_spell_days": 0,
            "detection_weight": 0.35,
            "description": "Most destructive sorghum pest; bores into stem.",
            "symptoms": "Dead hearts at vegetative stage, shot holes in leaves.",
            "management": "Carbofuran granules in whorl, Trichogramma release, resistant varieties.",
        },
        {
            "pest_name": "Shoot Fly",
            "scientific_name": "Atherigona soccata",
            "pest_type": "Insect",
            "favorable_temp_min": 22.0,
            "favorable_temp_max": 30.0,
            "favorable_rh_min": 65.0,
            "favorable_rh_max": 95.0,
            "favorable_rain_min_7d": 20.0,
            "dry_spell_days": 0,
            "detection_weight": 0.30,
            "description": "Early-stage pest; maggots cut the growing point.",
            "symptoms": "Dead hearts in early seedling stage.",
            "management": "Early sowing, seed treatment with imidacloprid, remove dead hearts.",
        },
        {
            "pest_name": "Aphid",
            "scientific_name": "Melanaphis sacchari",
            "pest_type": "Insect",
            "favorable_temp_min": 18.0,
            "favorable_temp_max": 28.0,
            "favorable_rh_min": 60.0,
            "favorable_rh_max": 90.0,
            "favorable_rain_min_7d": 5.0,
            "dry_spell_days": 0,
            "detection_weight": 0.25,
            "description": "Sugary aphid; colonizes lower leaf surfaces.",
            "symptoms": "Yellowing, honeydew, sooty mold on panicles.",
            "management": "Neem extract spray, conserve parasitoids.",
        },
    ],

    "Millets": [
        {
            "pest_name": "Earhead Bug",
            "scientific_name": "Calocoris angustatus",
            "pest_type": "Insect",
            "favorable_temp_min": 26.0,
            "favorable_temp_max": 36.0,
            "favorable_rh_min": 55.0,
            "favorable_rh_max": 85.0,
            "favorable_rain_max_7d": 25.0,
            "dry_spell_days": 3,
            "detection_weight": 0.40,
            "description": "Sucks developing grain; major yield-loss pest.",
            "symptoms": "Chaffy grains, shrivelled earheads.",
            "management": "Malathion spray at milky stage, light traps.",
        },
        {
            "pest_name": "Blister Beetle",
            "scientific_name": "Mylabris pustulata",
            "pest_type": "Insect",
            "favorable_temp_min": 28.0,
            "favorable_temp_max": 38.0,
            "favorable_rh_min": 40.0,
            "favorable_rh_max": 70.0,
            "favorable_rain_max_7d": 15.0,
            "dry_spell_days": 4,
            "detection_weight": 0.35,
            "description": "Defoliates flowering heads.",
            "symptoms": "Eaten-out florets, shiny black-red beetles visible.",
            "management": "Hand collection, spray quinalphos.",
        },
    ],

    "Rice": [
        {
            "pest_name": "Brown Planthopper",
            "scientific_name": "Nilaparvata lugens",
            "pest_type": "Insect",
            "favorable_temp_min": 24.0,
            "favorable_temp_max": 32.0,
            "favorable_rh_min": 80.0,
            "favorable_rh_max": 100.0,
            "favorable_rain_min_7d": 30.0,
            "dry_spell_days": 0,
            "detection_weight": 0.35,
            "description": "Most serious rice pest; causes hopper burn.",
            "symptoms": "Circular burnt patches (hopper burn), honeydew on leaves.",
            "management": "Drain fields intermittently, avoid excess N, spray buprofezin.",
        },
        {
            "pest_name": "Leaf Folder",
            "scientific_name": "Cnaphalocrocis medinalis",
            "pest_type": "Insect",
            "favorable_temp_min": 26.0,
            "favorable_temp_max": 34.0,
            "favorable_rh_min": 75.0,
            "favorable_rh_max": 95.0,
            "favorable_rain_min_7d": 25.0,
            "dry_spell_days": 0,
            "detection_weight": 0.30,
            "description": "Larvae fold and feed inside leaf tissue.",
            "symptoms": "White papery streaks, folded leaves tied with silk.",
            "management": "Release Trichogramma, spray chlorpyrifos.",
        },
        {
            "pest_name": "Rice Blast",
            "scientific_name": "Pyricularia oryzae",
            "pest_type": "Fungal",
            "favorable_temp_min": 22.0,
            "favorable_temp_max": 28.0,
            "favorable_rh_min": 85.0,
            "favorable_rh_max": 100.0,
            "favorable_rain_min_7d": 40.0,
            "dry_spell_days": 0,
            "detection_weight": 0.35,
            "description": "Highly destructive fungal disease.",
            "symptoms": "Diamond-shaped grey lesions with brown borders on leaves and neck.",
            "management": "Resistant varieties, tricyclazole spray, balanced nutrition.",
        },
    ],

    "Sugarcane": [
        {
            "pest_name": "Early Shoot Borer",
            "scientific_name": "Chilo infuscatellus",
            "pest_type": "Insect",
            "favorable_temp_min": 25.0,
            "favorable_temp_max": 36.0,
            "favorable_rh_min": 50.0,
            "favorable_rh_max": 80.0,
            "favorable_rain_max_7d": 20.0,
            "dry_spell_days": 4,
            "detection_weight": 0.35,
            "description": "Bores into young shoots causing dead hearts.",
            "symptoms": "Dead hearts in 1–3 month old crop.",
            "management": "Carbofuran 3G application, Trichogramma release.",
        },
        {
            "pest_name": "Pyrilla",
            "scientific_name": "Pyrilla perpusilla",
            "pest_type": "Insect",
            "favorable_temp_min": 28.0,
            "favorable_temp_max": 38.0,
            "favorable_rh_min": 40.0,
            "favorable_rh_max": 75.0,
            "favorable_rain_max_7d": 15.0,
            "dry_spell_days": 5,
            "detection_weight": 0.30,
            "description": "Sugarcane leafhopper; stunts growth.",
            "symptoms": "Yellowing of midrib, hopper nymphs on leaf undersides.",
            "management": "Spray malathion, conserve Epipyrops parasitoid.",
        },
    ],

    "Pulses": [
        {
            "pest_name": "Pod Borer",
            "scientific_name": "Helicoverpa armigera",
            "pest_type": "Insect",
            "favorable_temp_min": 24.0,
            "favorable_temp_max": 36.0,
            "favorable_rh_min": 45.0,
            "favorable_rh_max": 75.0,
            "favorable_rain_max_7d": 18.0,
            "dry_spell_days": 4,
            "detection_weight": 0.35,
            "description": "Bores into pods and feeds on developing seeds.",
            "symptoms": "Circular holes in pods, caterpillar frass.",
            "management": "Pheromone traps, HaNPV spray, intercrop with sorghum.",
        },
        {
            "pest_name": "Aphid",
            "scientific_name": "Aphis craccivora",
            "pest_type": "Insect",
            "favorable_temp_min": 18.0,
            "favorable_temp_max": 28.0,
            "favorable_rh_min": 65.0,
            "favorable_rh_max": 90.0,
            "favorable_rain_min_7d": 10.0,
            "dry_spell_days": 0,
            "detection_weight": 0.25,
            "description": "Dense colonies on tender shoots; virus vector.",
            "symptoms": "Leaf curl, black colonies on stem tips.",
            "management": "Neem oil spray, predator conservation.",
        },
        {
            "pest_name": "Whitefly",
            "scientific_name": "Bemisia tabaci",
            "pest_type": "Insect",
            "favorable_temp_min": 26.0,
            "favorable_temp_max": 40.0,
            "favorable_rh_min": 30.0,
            "favorable_rh_max": 65.0,
            "favorable_rain_max_7d": 8.0,
            "dry_spell_days": 6,
            "detection_weight": 0.20,
            "description": "Vector of yellow mosaic virus in pulses.",
            "symptoms": "Yellowing, mosaic patches, honeydew.",
            "management": "Remove virus-affected plants, reflective mulch, imidacloprid.",
        },
    ],
}


def detect_pests(
    crop: str,
    weather_features: Dict[str, Any],
    soil_features: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """
    Rule-based pest detection engine.

    Evaluates each pest's favorable conditions against current
    weather and soil data. Returns list of detected/suspected pests
    with confidence scores and supporting evidence.
    """
    crop_title = crop.strip().title()
    pest_list = PEST_DATABASE.get(crop_title, PEST_DATABASE.get(crop, []))
    if not pest_list:
        return []

    t2m = weather_features.get("t2m", 30)
    rh2m = weather_features.get("rh2m", 60)
    rain_7d = weather_features.get("rain_rolling_7d", 10)
    consec_dry = weather_features.get("consecutive_dry_days", 0)

    detected = []

    for pest in pest_list:
        rules_triggered = []
        score = 0.0

        # Rule 1: Temperature in favorable range
        if pest["favorable_temp_min"] <= t2m <= pest["favorable_temp_max"]:
            rules_triggered.append(
                f"Temperature {t2m:.1f}°C in favorable range "
                f"({pest['favorable_temp_min']}–{pest['favorable_temp_max']}°C)"
            )
            score += 0.30

        # Rule 2: Humidity in favorable range
        rh_min = pest.get("favorable_rh_min", 0)
        rh_max = pest.get("favorable_rh_max", 100)
        if rh_min <= rh2m <= rh_max:
            rules_triggered.append(
                f"Humidity {rh2m:.1f}% in favorable range ({rh_min}–{rh_max}%)"
            )
            score += 0.25

        # Rule 3: Rainfall condition
        if "favorable_rain_max_7d" in pest:
            if rain_7d <= pest["favorable_rain_max_7d"]:
                rules_triggered.append(
                    f"7-day rainfall {rain_7d:.1f}mm ≤ {pest['favorable_rain_max_7d']}mm (dry = favorable)"
                )
                score += 0.20
        if "favorable_rain_min_7d" in pest:
            if rain_7d >= pest["favorable_rain_min_7d"]:
                rules_triggered.append(
                    f"7-day rainfall {rain_7d:.1f}mm ≥ {pest['favorable_rain_min_7d']}mm (wet = favorable)"
                )
                score += 0.20

        # Rule 4: Consecutive dry days
        dry_threshold = pest.get("dry_spell_days", 0)
        if dry_threshold > 0 and consec_dry >= dry_threshold:
            rules_triggered.append(
                f"{consec_dry} consecutive dry days ≥ threshold {dry_threshold}"
            )
            score += 0.15

        # Rule 5: Soil pH stress factor
        ph = soil_features.get("ph", 7.0)
        if ph > 8.0 or ph < 5.5:
            rules_triggered.append(f"Soil pH {ph} outside optimal range — plant stress factor")
            score += 0.05

        # Only include if any rules triggered
        if not rules_triggered:
            continue

        # Normalise score
        score = min(1.0, score)

        # Determine detection status
        if score >= 0.65:
            status = "Confirmed"
        elif score >= 0.35:
            status = "Suspected"
        else:
            status = "None"
            continue  # Skip low-confidence

        detected.append({
            "pest_name": pest["pest_name"],
            "scientific_name": pest["scientific_name"],
            "pest_type": pest["pest_type"],
            "detection_status": status,
            "confidence": round(score, 3),
            "rules_triggered": rules_triggered,
            "evidence": {
                "temperature": t2m,
                "humidity": rh2m,
                "rainfall_7d": rain_7d,
                "consecutive_dry_days": consec_dry,
                "soil_ph": ph,
            },
            "symptoms": pest["symptoms"],
            "management_advice": pest["management"],
        })

    # Sort by confidence descending
    detected.sort(key=lambda x: x["confidence"], reverse=True)
    return detected


def get_pest_list(crop: str) -> List[str]:
    """Return list of pest names monitored for a crop."""
    crop_title = crop.strip().title()
    return [p["pest_name"] for p in PEST_DATABASE.get(crop_title, [])]


def get_overall_detection_status(detected_pests: List[Dict]) -> str:
    """Derive overall detection status from list of individual pest detections."""
    if not detected_pests:
        return "None"
    statuses = [p["detection_status"] for p in detected_pests]
    if "Confirmed" in statuses:
        return "Confirmed"
    if "Suspected" in statuses:
        return "Suspected"
    return "None"
