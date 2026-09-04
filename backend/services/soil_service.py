"""
CropShield — Soil Data Service
Research-based soil profiles for Tamil Nadu agricultural zones.

Sources:
1. MASU Journal Vol.64(8): Soil quality assessment, Tamil Nadu dryland
   https://masujournal.org/store_file/archive/64-8-8-497-505.pdf
2. Vertical assessment of soil quality in permanent manurial experiment,
   dryland ecosystem, Tamil Nadu (ResearchGate, 2023)
"""

from typing import Dict, Optional

# ── Research-Based Soil Profiles ────────────────────────────
# Data extracted and adapted from the cited papers.
# pH, EC, OC, N, P, K values are means from field studies.

SOIL_PROFILES: Dict[str, Dict] = {
    "Dryland": {
        # Kovilpatti / Tirunelveli dryland zone — Red laterite / Sandy loam
        # Ref: MASU Journal 2023, Table 3: Surface (0-20cm) values
        "soil_type": "Red Laterite Sandy Loam",
        "ph": 7.2,           # Slightly alkaline (dryland Tamil Nadu typical)
        "ec": 0.18,          # dS/m — low salinity
        "organic_carbon": 0.42,  # % — low OC, dryland characteristic
        "nitrogen": 212,     # kg/ha — available N
        "phosphorus": 18.4,  # kg/ha — available P
        "potassium": 185,    # kg/ha — available K
        "sand_pct": 64,
        "silt_pct": 18,
        "clay_pct": 18,
        "bulk_density": 1.55,   # g/cm³
        "field_capacity": 22.5, # % volumetric
        "source": "MASU Journal Vol.64(8), 2023; ResearchGate TN Dryland Soil 2023",
        "districts": ["Kovilpatti", "Virudhunagar", "Tirunelveli", "Tenkasi"],
    },
    "Irrigated": {
        # Cauvery delta / Thanjavur irrigated zone — Alluvial clay loam
        # Ref: ResearchGate 2023, manurial experiment irrigated plots
        "soil_type": "Alluvial Clay Loam",
        "ph": 7.8,           # Neutral to slightly alkaline
        "ec": 0.38,          # dS/m — moderate
        "organic_carbon": 0.68,  # % — higher than dryland due to organic inputs
        "nitrogen": 285,     # kg/ha
        "phosphorus": 28.6,  # kg/ha
        "potassium": 246,    # kg/ha
        "sand_pct": 28,
        "silt_pct": 38,
        "clay_pct": 34,
        "bulk_density": 1.38,
        "field_capacity": 35.0,
        "source": "ResearchGate TN Soil Quality 2023; TNAU Soil Survey Reports",
        "districts": ["Thanjavur", "Tiruvarur", "Nagapattinam", "Trichy"],
    },
    "Delta": {
        # Cauvery delta — Heavy clay, high waterlogging risk
        "soil_type": "Heavy Black Clay (Vertisol)",
        "ph": 8.1,           # Alkaline
        "ec": 0.52,          # dS/m
        "organic_carbon": 0.75,
        "nitrogen": 310,
        "phosphorus": 32.0,
        "potassium": 290,
        "sand_pct": 18,
        "silt_pct": 30,
        "clay_pct": 52,
        "bulk_density": 1.28,
        "field_capacity": 42.0,
        "source": "MASU Journal 2023; TNAU Cauvery Delta Studies",
        "districts": ["Thanjavur", "Tiruvarur", "Nagapattinam"],
    },
    "Semi-arid": {
        # Vellore / Krishnagiri — Red gravelly loam
        "soil_type": "Red Gravelly Loam",
        "ph": 6.8,           # Slightly acidic
        "ec": 0.14,
        "organic_carbon": 0.35,
        "nitrogen": 188,
        "phosphorus": 14.2,
        "potassium": 162,
        "sand_pct": 70,
        "silt_pct": 14,
        "clay_pct": 16,
        "bulk_density": 1.62,
        "field_capacity": 19.0,
        "source": "MASU Journal 2023; ResearchGate 2023 TN Soil Quality",
        "districts": ["Vellore", "Krishnagiri", "Dharmapuri", "Salem"],
    },
    "Humid": {
        # Nilgiris / Coimbatore humid zone — Deep red loam
        "soil_type": "Deep Red Loam",
        "ph": 6.2,           # Acidic, typical of humid red soils
        "ec": 0.22,
        "organic_carbon": 1.10,  # Higher OC due to humid conditions
        "nitrogen": 340,
        "phosphorus": 22.8,
        "potassium": 198,
        "sand_pct": 45,
        "silt_pct": 28,
        "clay_pct": 27,
        "bulk_density": 1.32,
        "field_capacity": 30.5,
        "source": "ResearchGate TN Soil 2023; TNAU Humid Zone Studies",
        "districts": ["Coimbatore", "Nilgiris", "Tirupur", "Erode"],
    },
}


def get_soil_profile(climate_zone: str) -> Dict:
    """
    Return research-based soil profile for the given Tamil Nadu climate zone.
    Falls back to Dryland profile if zone not found.
    """
    profile = SOIL_PROFILES.get(climate_zone, SOIL_PROFILES["Dryland"])
    return {
        "soil_type": profile["soil_type"],
        "ph": profile["ph"],
        "ec": profile["ec"],
        "organic_carbon": profile["organic_carbon"],
        "nitrogen": profile["nitrogen"],
        "phosphorus": profile["phosphorus"],
        "potassium": profile["potassium"],
        "sand_pct": profile["sand_pct"],
        "silt_pct": profile["silt_pct"],
        "clay_pct": profile["clay_pct"],
        "bulk_density": profile["bulk_density"],
        "field_capacity": profile["field_capacity"],
        "source": profile["source"],
    }


def get_soil_risk_multiplier(soil_profile: Dict, crop: str) -> float:
    """
    Compute a soil-based risk multiplier (0.8 – 1.3) that modulates
    pest risk based on soil conditions.

    High clay → waterlogging → fungal/blight risk
    Low OC → stressed plant → higher susceptibility to sucking pests
    Alkaline pH → some crops stressed → higher pest incidence
    """
    multiplier = 1.0

    # Clay content: high clay → waterlogging → fungal disease risk
    clay = soil_profile.get("clay_pct", 25)
    if clay > 40:
        multiplier += 0.10
    elif clay < 20:
        multiplier += 0.05  # Sandy → drought stress → sucking pests

    # Organic carbon: low OC → low plant immunity
    oc = soil_profile.get("organic_carbon", 0.5)
    if oc < 0.4:
        multiplier += 0.10
    elif oc > 0.8:
        multiplier -= 0.05

    # pH extremes stress crops
    ph = soil_profile.get("ph", 7.0)
    if ph > 8.0 or ph < 6.0:
        multiplier += 0.08

    # Crop-specific adjustments
    crop_lower = crop.lower()
    if "cotton" in crop_lower and clay > 35:
        multiplier += 0.05  # Cotton + heavy clay → Fusarium risk
    if "rice" in crop_lower and clay > 40:
        multiplier += 0.08  # Rice in heavy clay → BPH risk

    return round(min(1.3, max(0.8, multiplier)), 3)
