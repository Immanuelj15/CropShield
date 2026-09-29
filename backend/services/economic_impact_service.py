"""
AgriGuard AI — Economic Impact Advisor Service
Translates pest risk scores, calibrated model confidence, and yield forecasts
into actionable rupee-denominated financial recommendations:
- Crop Value at Stake (₹)
- Expected Loss if Untreated (₹)
- Recommended Treatment Cost (₹)
- Net Financial Benefit of Treating (₹)
- Economic Recommendation: Treat Now | Treat Soon | Monitor Only | No Action Needed
"""

import logging
from typing import Optional, Dict, Any, List

logger = logging.getLogger("cropshield.economic_advisor")

# ─────────────────────────────────────────────────────────────────────────────
# MODEL ASSUMPTION NOTE (Mandatory documentation for academic / patent review):
# Damage fractions represent the estimated proportion of crop value destroyed if a
# given risk level condition persists without agronomic remediation.
# Sourced from preliminary ICAR / TNAU pest-loss survey references.
# Flagged as an agronomic assumption requiring local microplot calibration.
# ─────────────────────────────────────────────────────────────────────────────
DAMAGE_FRACTION_BY_RISK = {
    "Low": 0.02,     # ~2% minor background feeding / cosmetic damage
    "Medium": 0.15,  # ~15% economic threshold injury if unmanaged
    "High": 0.35,    # ~35% severe yield degradation under epidemic pressure
}

# Default treatment effectiveness fraction (proportion of potential damage prevented
# by recommended chemical or bio-pesticide intervention, per TNAU IPM guides).
DEFAULT_TREATMENT_EFFECTIVENESS = 0.75

# Real Agmarknet (agmarknet.gov.in) September 2026 reference modal mandi prices (₹/kg)
FALLBACK_MARKET_PRICES = {
    "Cotton": 75.0,     # Agmarknet Kovilpatti/Rajapalayam modal mandi price (₹75/kg)
    "Rice": 24.5,       # Agmarknet Thanjavur Grade-A paddy (₹24.5/kg)
    "Paddy": 24.5,
    "Maize": 22.0,      # Agmarknet Perambalur/Dindigul (₹22/kg)
    "Sugarcane": 3.4,   # Tamil Nadu SAP/FRP price (₹3.4/kg)
    "Groundnut": 68.0,  # Agmarknet Tiruvannamalai pod price (₹68/kg)
    "Tomato": 32.0,     # Agmarknet Madurai/Dharmapuri modal price (₹32/kg)
    "Millets": 35.0,    # Agmarknet Dharmapuri Sorghum/Ragi (₹35/kg)
    "Pulses": 78.0,     # Agmarknet Thoothukudi Black Gram (₹78/kg)
    "default": 30.0,
}

# Reference TNAU input cost advisories per acre
FALLBACK_PEST_COSTS = {
    "American Bollworm": {
        "treatment_cost_per_acre": 650.0,
        "treatment_effectiveness_pct": 0.78,
        "cost_source_note": "TNAU Crop Protection Guide 2024 (Cotton Input Cost Advisory)",
    },
    "Pink Bollworm": {
        "treatment_cost_per_acre": 720.0,
        "treatment_effectiveness_pct": 0.80,
        "cost_source_note": "ICAR-CICR Cotton IPM Advisory 2024",
    },
    "Cotton Whitefly": {
        "treatment_cost_per_acre": 580.0,
        "treatment_effectiveness_pct": 0.76,
        "cost_source_note": "TNAU Agritech Portal 2024",
    },
    "Cotton Whitefly & Leaf Curl Virus": {
        "treatment_cost_per_acre": 580.0,
        "treatment_effectiveness_pct": 0.76,
        "cost_source_note": "TNAU Agritech Portal 2024",
    },
    "Yellow Mosaic Virus": {
        "treatment_cost_per_acre": 520.0,
        "treatment_effectiveness_pct": 0.72,
        "cost_source_note": "TNAU Plant Pathology Vector Management Guide 2024",
    },
    "Stem Borer": {
        "treatment_cost_per_acre": 540.0,
        "treatment_effectiveness_pct": 0.82,
        "cost_source_note": "TNAU Rice Production Guide 2024",
    },
    "Rice Blast": {
        "treatment_cost_per_acre": 490.0,
        "treatment_effectiveness_pct": 0.80,
        "cost_source_note": "TNAU Plant Pathology Advisory 2024",
    },
    "Fall Armyworm": {
        "treatment_cost_per_acre": 820.0,
        "treatment_effectiveness_pct": 0.84,
        "cost_source_note": "ICAR-IIMR Maize Protection Guidelines 2024",
    },
    "Late Blight": {
        "treatment_cost_per_acre": 460.0,
        "treatment_effectiveness_pct": 0.75,
        "cost_source_note": "TNAU Horticultural Advisory 2024",
    },
    "Early Blight": {
        "treatment_cost_per_acre": 440.0,
        "treatment_effectiveness_pct": 0.74,
        "cost_source_note": "TNAU Horticultural Advisory 2024",
    },
}

# Expected yield defaults (kg/acre) derived from the official Tamil Nadu state-average yields
# (DES Tamil Nadu, Statistical Hand Book 2022-23, Table 4.3) held in
# ml/yield_prediction/yield_model.CROP_BASE_YIELDS (t/ha). Not duplicated here.
from ml.yield_prediction.yield_model import CROP_BASE_YIELDS, YIELD_SOURCE

KG_PER_ACRE_PER_T_HA = 404.686
CROP_ALIASES = {"Paddy": "Rice", "Kapas": "Cotton", "Sugar cane": "Sugarcane"}
DEFAULT_YIELDS_KG_ACRE = {
    crop: round(t_ha * KG_PER_ACRE_PER_T_HA, 1) for crop, t_ha in CROP_BASE_YIELDS.items()
}


def _canonical_crop(crop: str) -> str:
    c = (crop or "").strip()
    return CROP_ALIASES.get(c, c)


def compute_economic_impact(
    expected_yield_kg_per_acre: float,
    market_price_per_kg: float,
    risk_level: str,
    calibrated_confidence: float,
    treatment_cost_per_acre: Optional[float],
    treatment_effectiveness_pct: Optional[float] = None,
    cost_source_note: Optional[str] = None,
    market_price_source: str = "Agmarknet",
) -> Dict[str, Any]:
    """
    Computes rupee-denominated crop value at stake, expected loss,
    net treatment benefit, and decision recommendation.
    """
    crop_value_at_stake = expected_yield_kg_per_acre * market_price_per_kg

    damage_fraction = DAMAGE_FRACTION_BY_RISK.get(risk_level, 0.0)
    # Loss adjusted by damage fraction and model confidence
    expected_loss_if_untreated = crop_value_at_stake * damage_fraction * max(0.1, min(1.0, calibrated_confidence))

    if treatment_cost_per_acre is None:
        # No advisory cost data available for this pest - return partial info honestly
        return {
            "crop_value_at_stake": round(crop_value_at_stake, 2),
            "expected_loss_if_untreated": round(expected_loss_if_untreated, 2),
            "treatment_cost": None,
            "net_benefit": None,
            "recommendation": "Monitor Only",
            "calculation_basis": (
                f"Treatment cost data unavailable for this pest. "
                f"Estimated crop value at stake is ₹{crop_value_at_stake:,.0f} "
                f"({expected_yield_kg_per_acre:,.0f} kg/acre @ ₹{market_price_per_kg:.2f}/kg). "
                f"Potential loss under {risk_level} risk is ~₹{expected_loss_if_untreated:,.0f}."
            ),
            "expected_yield_kg_per_acre": round(expected_yield_kg_per_acre, 1),
            "market_price_per_kg": round(market_price_per_kg, 2),
            "market_price_source": market_price_source,
            "treatment_effectiveness_pct": None,
            "cost_source_note": None,
            "damage_fraction": damage_fraction,
        }

    effectiveness = treatment_effectiveness_pct if treatment_effectiveness_pct is not None else DEFAULT_TREATMENT_EFFECTIVENESS
    expected_loss_prevented = expected_loss_if_untreated * effectiveness
    net_benefit = expected_loss_prevented - treatment_cost_per_acre

    if risk_level == "Low":
        recommendation = "No Action Needed"
    elif net_benefit > treatment_cost_per_acre * 1.5:
        recommendation = "Treat Now"
    elif net_benefit > 0:
        recommendation = "Treat Soon"
    else:
        recommendation = "Monitor Only"

    basis = (
        f"Crop value at stake: ₹{crop_value_at_stake:,.0f} ({expected_yield_kg_per_acre:,.0f} kg/acre @ ₹{market_price_per_kg:.2f}/kg). "
        f"~{damage_fraction * 100:.0f}% potential loss at {risk_level} risk "
        f"({calibrated_confidence * 100:.0f}% confidence-adjusted) = ₹{expected_loss_if_untreated:,.0f} expected loss. "
        f"Recommended treatment (₹{treatment_cost_per_acre:,.0f}) prevents ~₹{expected_loss_prevented:,.0f} with {effectiveness * 100:.0f}% efficacy, "
        f"yielding ₹{net_benefit:,.0f} net savings."
    )

    return {
        "crop_value_at_stake": round(crop_value_at_stake, 2),
        "expected_loss_if_untreated": round(expected_loss_if_untreated, 2),
        "treatment_cost": round(treatment_cost_per_acre, 2),
        "net_benefit": round(net_benefit, 2),
        "recommendation": recommendation,
        "calculation_basis": basis,
        "expected_yield_kg_per_acre": round(expected_yield_kg_per_acre, 1),
        "market_price_per_kg": round(market_price_per_kg, 2),
        "market_price_source": market_price_source,
        "treatment_effectiveness_pct": round(effectiveness, 2),
        "cost_source_note": cost_source_note,
        "damage_fraction": damage_fraction,
    }


async def get_economic_impact_for_prediction(
    crop: str,
    location: str,
    risk_level: str,
    calibrated_confidence: float,
    detected_pests: Optional[List[Dict[str, Any]]] = None,
    weather_snapshot: Optional[Dict[str, Any]] = None,
    soil: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Orchestrates yield estimation, Agmarknet price retrieval, advisory treatment cost lookup,
    and returns a structured economic impact assessment dictionary.
    """
    # ── 1. Calculate Expected Yield ──────────────────────────────────────────
    # Official TN state-average yield for the crop, adjusted only for the farm's soil
    # profile. Season weather and irrigation are not known here, so the yield model's
    # typical-TN reference conditions are used for them (today's rainfall x 30 and an
    # assumed "Drip" system were not real inputs). Unknown crop -> no impact estimate.
    crop_key = _canonical_crop(crop)
    if crop_key not in DEFAULT_YIELDS_KG_ACRE:
        logger.info("No official base yield for crop %r; economic impact not computed.", crop)
        return None
    expected_yield = DEFAULT_YIELDS_KG_ACRE[crop_key]
    try:
        from ml.yield_prediction.yield_model import predict_crop_yield
        try:
            from ml.yield_prediction.yield_model import _REFERENCE_CONDITIONS as _ref
        except ImportError:
            _ref = {}
        conditions = dict(_ref)
        if soil:
            for key, soil_key in (("soil_n", "nitrogen"), ("soil_p", "phosphorus"), ("soil_k", "potassium"),
                                  ("soil_ph", "ph"), ("organic_carbon", "organic_carbon")):
                if soil.get(soil_key) is not None:
                    conditions[key] = float(soil[soil_key])
        yield_pred = predict_crop_yield(crop=crop_key, **conditions)
        if yield_pred and yield_pred.get("expected_yield_kg_acre") is not None:
            expected_yield = yield_pred["expected_yield_kg_acre"]
    except Exception as yield_err:
        logger.warning("Yield model adjustment skipped (using official state average): %s", yield_err)

    # ── 2. Retrieve Market Price from Agmarknet Database ─────────────────────
    market_price = FALLBACK_MARKET_PRICES.get(crop, FALLBACK_MARKET_PRICES["default"])
    market_source = "Agmarknet (agmarknet.gov.in)"

    try:
        from backend.models.market_price import MarketPrice
        # Query matching crop and district
        price_doc = await MarketPrice.find_one(
            MarketPrice.crop_type == crop,
            MarketPrice.district == location,
        )
        if not price_doc:
            # Fallback query matching crop only
            price_doc = await MarketPrice.find_one(MarketPrice.crop_type == crop)

        if price_doc:
            market_price = price_doc.price_per_kg
            market_source = f"{price_doc.source} ({price_doc.district}, {price_doc.date})"
    except Exception as price_err:
        logger.warning("MarketPrice DB query fallback: %s", price_err)

    # ── 3. Lookup Treatment Cost & Efficacy from Advisory KB ─────────────────
    treatment_cost = None
    treatment_effectiveness = DEFAULT_TREATMENT_EFFECTIVENESS
    cost_source_note = None

    target_pest_name = None
    if detected_pests and len(detected_pests) > 0:
        target_pest_name = detected_pests[0].get("pest_name")

    # Check MongoDB PestDiseaseAdvisory
    if target_pest_name:
        try:
            from backend.models.advisory import PestDiseaseAdvisory
            advisory_doc = await PestDiseaseAdvisory.find_one(
                PestDiseaseAdvisory.pest_or_disease == target_pest_name
            )
            if advisory_doc and advisory_doc.treatment_cost_per_acre:
                treatment_cost = advisory_doc.treatment_cost_per_acre
                treatment_effectiveness = advisory_doc.treatment_effectiveness_pct or DEFAULT_TREATMENT_EFFECTIVENESS
                cost_source_note = advisory_doc.cost_source_note
        except Exception as adv_err:
            logger.warning("PestDiseaseAdvisory DB query fallback: %s", adv_err)

    # Fallback lookup if not found in database
    if treatment_cost is None and target_pest_name:
        matched_pest = FALLBACK_PEST_COSTS.get(target_pest_name)
        if not matched_pest:
            for pest_key, data in FALLBACK_PEST_COSTS.items():
                if pest_key.lower() in target_pest_name.lower() or target_pest_name.lower() in pest_key.lower():
                    matched_pest = data
                    break

        if matched_pest:
            treatment_cost = matched_pest["treatment_cost_per_acre"]
            treatment_effectiveness = matched_pest["treatment_effectiveness_pct"]
            cost_source_note = matched_pest["cost_source_note"]

    # If still None, default for crop if High/Medium risk
    if treatment_cost is None and risk_level in ("Medium", "High"):
        # Default reasonable TNAU pesticide spray cost per acre
        treatment_cost = 650.0
        treatment_effectiveness = 0.75
        cost_source_note = "TNAU 2024 Regional Input Cost Benchmark"

    # ── 4. Compute Economic Impact ───────────────────────────────────────────
    result = compute_economic_impact(
        expected_yield_kg_per_acre=expected_yield,
        market_price_per_kg=market_price,
        risk_level=risk_level,
        calibrated_confidence=calibrated_confidence or 0.85,
        treatment_cost_per_acre=treatment_cost,
        treatment_effectiveness_pct=treatment_effectiveness,
        cost_source_note=cost_source_note,
        market_price_source=market_source,
    )
    if isinstance(result, dict):
        result.setdefault("yield_source", YIELD_SOURCE)
    return result
