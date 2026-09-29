"""
AgriGuard AI — Crop Yield Forecasting Engine
Estimates crop yield (t/ha and kg/acre) as the official Tamil Nadu state-average yield
adjusted by transparent (uncalibrated) weather, soil and irrigation factors.
This is a formula, not a trained model.
"""

import numpy as np

# Base yields = OFFICIAL Tamil Nadu state average yields, 2022-23 (t/ha), from
# Department of Economics & Statistics, Govt. of Tamil Nadu, "Statistical Hand Book
# of Tamil Nadu 2022-23", Table 4.3 "Area, Production and Productivity of Principal
# Crops 2022-23" and Tables 4.20 D/E (tapioca, tomato):
#   https://www.des.tn.gov.in/sites/default/files/2025-07/4.%20AGRICULTURE.pdf
# Units are chosen to match the ₹/kg market prices used by economic_impact_service
# (paddy grain, seed cotton "kapas", cane, groundnut pods):
#   Rice      3,500 kg/ha "in terms of rice" → paddy = rice × 3/2 (DES rice:paddy = 2:3) = 5.25 t/ha
#   Cotton    319,248 bales × 170 kg lint / 173,270 ha = 313 kg lint/ha → seed cotton at a
#             typical ~34 % ginning out-turn ≈ 0.92 t/ha
#   Sugarcane 111 t/ha (cane) · Maize 7.007 · Groundnut 2.598 (pods)
#   Sorghum (Cholam) 0.813 · Millets = Cumbu+Ragi+Small millets, area-weighted 2.545
#   Pulses (total) 503,161 t / 791,119 ha = 0.636 · Tomato 19.19 · Cassava (Tapioca) 37.55
CROP_BASE_YIELDS = {
    "Rice": 5.25,
    "Cotton": 0.92,
    "Sugarcane": 111.0,
    "Maize": 7.0,
    "Groundnut": 2.6,
    "Tomato": 19.19,
    "Sorghum": 0.81,
    "Millets": 2.55,
    "Pulses": 0.64,
    "Cassava": 37.55,
}
YIELD_SOURCE = ("DES Tamil Nadu, Statistical Hand Book 2022-23, Table 4.3 "
                "(state average yields); heuristic adjustment factors are uncalibrated")

# The adjustment factors below are agronomic heuristics (not fitted to data). They are
# normalised so that TYPICAL Tamil Nadu conditions return exactly the state average:
# mean temp 28 °C, ~945 mm annual rainfall (TN normal), soil-test "medium" fertility
# (TNAU ratings: N 280, P 11-22 → 16, K 118-280 → 200 kg/ha), pH 7.2, OC 0.5 %,
# surface (flood/furrow) irrigation.
_REFERENCE_CONDITIONS = dict(temperature_c=28.0, rainfall_mm=945.0, soil_n=280.0, soil_p=16.0,
                             soil_k=200.0, soil_ph=7.2, organic_carbon=0.5, irrigation_type="Surface")


def _factors(temperature_c, rainfall_mm, soil_n, soil_p, soil_k, soil_ph, organic_carbon, irrigation_type):
    if 22.0 <= temperature_c <= 32.0:
        temp_factor = 1.05
    elif 18.0 <= temperature_c < 22.0 or 32.0 < temperature_c <= 38.0:
        temp_factor = 0.90
    else:
        temp_factor = 0.75
    if rainfall_mm >= 600.0:
        rain_factor = 1.08
    elif rainfall_mm >= 300.0:
        rain_factor = 0.95
    else:
        rain_factor = 0.78
    n_factor = min(1.10, max(0.80, soil_n / 160.0))
    p_factor = min(1.08, max(0.85, soil_p / 40.0))
    k_factor = min(1.08, max(0.85, soil_k / 140.0))
    ph_factor = 1.04 if 6.0 <= soil_ph <= 7.5 else 0.88
    oc_factor = 1.0 + (organic_carbon * 0.1)
    irr = 1.12 if irrigation_type == "Drip" else (1.05 if irrigation_type == "Sprinkler" else 0.95)
    return temp_factor, rain_factor, n_factor, p_factor, k_factor, ph_factor, oc_factor, irr


def _product(fs):
    out = 1.0
    for f in fs:
        out *= f
    return out


_REFERENCE_MULTIPLIER = _product(_factors(**_REFERENCE_CONDITIONS))


def predict_crop_yield(crop="Rice", temperature_c=28.5, humidity_pct=75.0,
                       rainfall_mm=850.0, soil_n=180.0, soil_p=45.0, soil_k=150.0,
                       soil_ph=6.5, organic_carbon=0.65, irrigation_type="Drip"):
    """
    Calculates expected yield (tons/ha and kg/acre) with biophysical factor breakdowns.
    """
    if crop not in CROP_BASE_YIELDS:
        raise ValueError(f"No official base yield for crop '{crop}'. Supported: {sorted(CROP_BASE_YIELDS)}")
    base_yield = CROP_BASE_YIELDS[crop]
    (temp_factor, rain_factor, n_factor, p_factor, k_factor,
     ph_factor, oc_factor, irrigation_multiplier) = _factors(
        temperature_c, rainfall_mm, soil_n, soil_p, soil_k, soil_ph, organic_carbon, irrigation_type)

    # Relative to typical TN conditions, so typical inputs return the official state average.
    total_multiplier = _product((temp_factor, rain_factor, n_factor, p_factor, k_factor,
                                 ph_factor, oc_factor, irrigation_multiplier)) / _REFERENCE_MULTIPLIER
    expected_yield_tons_ha = round(base_yield * total_multiplier, 2)
    expected_yield_kg_acre = round(expected_yield_tons_ha * 404.686, 1)

    # Factor Contribution Percentages for XAI UI
    factor_contributions = [
        {"factor": "Temperature Suitability", "impact_pct": round((temp_factor - 1.0) * 100, 1)},
        {"factor": "Rainfall & Hydration", "impact_pct": round((rain_factor - 1.0) * 100, 1)},
        {"factor": "Nitrogen (N) Availability", "impact_pct": round((n_factor - 1.0) * 100, 1)},
        {"factor": "Phosphorus (P) & Potash (K)", "impact_pct": round((p_factor * k_factor - 1.0) * 100, 1)},
        {"factor": "Soil pH & Organic Carbon", "impact_pct": round((ph_factor * oc_factor - 1.0) * 100, 1)},
        {"factor": "Irrigation Efficiency", "impact_pct": round((irrigation_multiplier - 1.0) * 100, 1)}
    ]
    
    return {
        "crop": crop,
        "base_yield_tons_ha": base_yield,
        "expected_yield_tons_ha": expected_yield_tons_ha,
        "expected_yield_kg_acre": expected_yield_kg_acre,
        "confidence_score": None,  # no validated confidence exists for this heuristic
        "is_heuristic": True,
        "method": "official TN state-average yield x uncalibrated agronomic adjustment factors",
        "source": YIELD_SOURCE,
        "total_multiplier": round(total_multiplier, 3),
        "factor_contributions": factor_contributions,
        "advice": (
            f"Estimate is the Tamil Nadu state-average yield for {crop} ({base_yield} t/ha, DES 2022-23) "
            f"adjusted x{round(total_multiplier, 2)} for the given weather, soil and irrigation inputs."
        ),
    }
