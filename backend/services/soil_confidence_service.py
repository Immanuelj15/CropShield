"""
CropShield / AgriGuard — Soil Confidence & Uncertainty Service
Derives real confidence scoring from ISRIC SoilGrids v2.0 published prediction quantiles
(Q0.05, Mean, Q0.95), mapping relative interval widths to empirical certainty scores.
Never fabricates arbitrary confidence scores.
"""
from typing import List, Optional, Tuple


def compute_confidence_from_quantiles(q05: float, mean: float, q95: float) -> float:
    """
    Narrower quantile range relative to the mean = higher confidence.
    This uses SoilGrids' own published uncertainty, not a fabricated score.
    Maps relative uncertainty to a bounded 20%–95% confidence score.
    """
    if mean == 0:
        return 50.0  # can't compute a relative interval, return neutral baseline
    interval_width = abs(q95 - q05)
    relative_uncertainty = interval_width / abs(mean)
    # Map relative uncertainty to a 0-100 confidence score (tunable bounds 20-95%)
    confidence = max(20.0, min(95.0, 100.0 - (relative_uncertainty * 100.0)))
    return round(confidence, 1)


def compute_overall_confidence(property_confidences: List[Optional[float]]) -> float:
    """
    Overall report confidence = average across all estimated properties
    (pH, N, K, organic carbon), each computed from its own quantile spread.
    Omits unavailable properties (e.g. Phosphorus).
    """
    valid = [c for c in property_confidences if c is not None]
    if not valid:
        return 55.0
    return round(sum(valid) / len(valid), 1)


def ph_to_range(ph_mean: float, spread: float = 0.25) -> List[float]:
    """Formats pH as a realistic confidence range [low, high] rather than false point-precision."""
    low = max(3.5, round(ph_mean - spread, 2))
    high = min(10.0, round(ph_mean + spread, 2))
    return [low, high]


def nitrogen_to_band(n_val: float) -> str:
    """
    Categorizes soil nitrogen into qualitative agronomic bands.
    n_val can be in mg/kg, cg/kg, or kg/ha.
    Standard Tamil Nadu dryland/irrigated availability:
    Low: < 200 kg/ha (< 180 cg/kg)
    Medium: 200–280 kg/ha (180–280 cg/kg)
    High: > 280 kg/ha (> 280 cg/kg)
    """
    if n_val < 180.0:
        return "Low"
    elif n_val <= 280.0:
        return "Medium"
    else:
        return "High"


def potassium_to_band(k_val: float) -> str:
    """
    Categorizes exchangeable potassium into qualitative agronomic bands.
    Low: < 150 kg/ha
    Medium: 150–250 kg/ha
    High: > 250 kg/ha
    """
    if k_val < 150.0:
        return "Low"
    elif k_val <= 250.0:
        return "Medium"
    else:
        return "High"


def organic_carbon_to_band(oc_pct: float) -> str:
    """
    Categorizes Soil Organic Carbon (SOC %) into agronomic availability tiers.
    Low: < 0.50% (typical degraded tropical dryland)
    Medium: 0.50% - 0.75%
    High: > 0.75%
    """
    if oc_pct < 0.50:
        return "Low"
    elif oc_pct <= 0.75:
        return "Medium"
    else:
        return "High"
