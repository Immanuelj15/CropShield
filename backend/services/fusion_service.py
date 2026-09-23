"""
AgriGuard AI — Multi-Modal Risk & Health Fusion Service
Fuses three independent diagnostic signals:
1. Macroclimate Risk (XGBoost 45-year satellite reanalysis model: 50% base weight)
2. Leaf Image Pathogen Diagnosis (ResNet/EfficientNet deep CNN: 30% base weight)
3. Satellite Vegetation Vigor (Sentinel-2 NDVI NIR/Red ratio: 20% base weight)

Proprietary Patent Algorithm: Dynamic Proportional Weight Redistribution
When any signal is unavailable (e.g. no photo taken or heavy cloud cover overpass),
its weight redistributes proportionally across verified available signals rather than
naively treating missing inputs as "healthy" or zero.
"""

from typing import Optional, Dict, Any


def compute_fused_health_score(
    climate_risk_score: float,
    image_diagnosis_confidence: Optional[float] = None,
    ndvi_value: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Weighted fusion of three independent risk signals into one 0-100 overall
    Crop Health Index (higher = healthier canopy / minimal biological threat).

    Args:
        climate_risk_score: 0.0 to 1.0 (from XGBoost model; higher = higher threat)
        image_diagnosis_confidence: 0.0 to 1.0 (from CNN disease detector; higher = severe disease)
        ndvi_value: -1.0 to 1.0 (from Sentinel-2 NDVI; higher = dense chlorophyll biomass)

    Returns:
        Dict with:
            - value: float (0.0 to 100.0)
            - health_grade: str ("Optimal" | "Moderate Risk" | "Critical Threat")
            - components: weights, normalized weights, and point contributions
            - explanation_text: transparent human-auditable breakdown
    """
    # 1. Normalize each active signal into a 0.0 – 1.0 "Healthiness" metric
    clamped_climate_risk = max(0.0, min(1.0, float(climate_risk_score)))
    climate_health = 1.0 - clamped_climate_risk

    image_health: Optional[float] = None
    if image_diagnosis_confidence is not None:
        clamped_image_conf = max(0.0, min(1.0, float(image_diagnosis_confidence)))
        image_health = 1.0 - clamped_image_conf

    ndvi_health: Optional[float] = None
    if ndvi_value is not None:
        clamped_ndvi = max(-1.0, min(1.0, float(ndvi_value)))
        # Rescale theoretical -1..+1 into 0..1 interval
        ndvi_health = max(0.0, min(1.0, (clamped_ndvi + 1.0) / 2.0))

    # 2. Base weight budget
    base_weights = {
        "climate": 0.50,
        "image": 0.30,
        "ndvi": 0.20
    }

    # 3. Compile available signals
    available: Dict[str, float] = {"climate": climate_health}
    if image_health is not None:
        available["image"] = image_health
    if ndvi_health is not None:
        available["ndvi"] = ndvi_health

    # 4. Proportional weight redistribution
    total_active_weight = sum(base_weights[k] for k in available)
    effective_weights = {k: base_weights[k] / total_active_weight for k in available}

    # 5. Compute fused health score (0 - 100)
    fused_score = sum(available[k] * effective_weights[k] for k in available) * 100.0
    fused_score_clamped = round(max(0.0, min(100.0, fused_score)), 1)

    contributions = {
        f"{k}_contribution": round(available[k] * effective_weights[k] * 100.0, 1)
        for k in available
    }

    # 6. Natural language auditable breakdown
    explanation_parts = []
    if "climate" in available:
        explanation_parts.append(f"weather risk contributes {contributions['climate_contribution']}pts")
    if "ndvi" in available:
        explanation_parts.append(f"satellite vegetation health contributes {contributions['ndvi_contribution']}pts")
    if "image" in available:
        explanation_parts.append(f"leaf photo diagnosis contributes {contributions['image_contribution']}pts")

    explanation_str = "Health score derived from " + ", ".join(explanation_parts) + "."

    # 7. Health Grade classification
    if fused_score_clamped >= 75.0:
        health_grade = "Optimal / Low Risk"
    elif fused_score_clamped >= 45.0:
        health_grade = "Moderate Vulnerability"
    else:
        health_grade = "Critical Stress / High Outbreak Risk"

    return {
        "value": fused_score_clamped,
        "health_grade": health_grade,
        "signals_count": len(available),
        "signals_available": list(available.keys()),
        "components": {
            **{f"{k}_base_weight": base_weights[k] for k in base_weights},
            **{f"{k}_effective_weight": round(effective_weights[k], 2) for k in available},
            **contributions
        },
        "raw_inputs": {
            "climate_risk_score": round(clamped_climate_risk, 4),
            "image_diagnosis_confidence": round(float(image_diagnosis_confidence), 4) if image_diagnosis_confidence is not None else None,
            "ndvi_value": round(float(ndvi_value), 4) if ndvi_value is not None else None
        },
        "explanation_text": explanation_str
    }
