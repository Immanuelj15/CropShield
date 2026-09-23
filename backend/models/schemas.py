"""
CropShield — Pydantic Schemas (v2)
All request/response models for the updated API.
"""

from datetime import date, datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ── Today's Warning ───────────────────────────────────────────

class TodayWarningRequest(BaseModel):
    latitude:     float = Field(9.1728,    ge=-90,  le=90)
    longitude:    float = Field(77.8710,   ge=-180, le=180)
    location:     str   = Field("Kovilpatti")
    crop:         str   = Field(..., example="Cotton")
    climate_zone: str   = Field("Dryland",  example="Dryland")

    class Config:
        json_schema_extra = {"example": {
            "latitude": 9.1728, "longitude": 77.8710,
            "location": "Kovilpatti", "crop": "Cotton",
            "climate_zone": "Dryland",
        }}


class SHAPFeature(BaseModel):
    feature:    str
    value:      float
    shap_value: float
    impact:     str  # "positive" | "negative"


class LikelyPest(BaseModel):
    pest_name:        str
    pest_type:        str
    detection_status: str
    confidence:       float
    management_advice: str


class EconomicImpactResponse(BaseModel):
    crop_value_at_stake:        float
    expected_loss_if_untreated: float
    treatment_cost:             Optional[float] = None
    net_benefit:                Optional[float] = None
    recommendation:             str  # "Treat Now" | "Treat Soon" | "Monitor Only" | "No Action Needed"
    calculation_basis:          str
    expected_yield_kg_per_acre: Optional[float] = None
    market_price_per_kg:        Optional[float] = None
    market_price_source:        Optional[str]   = "Agmarknet"
    treatment_effectiveness_pct: Optional[float] = None
    cost_source_note:           Optional[str]   = None
    damage_fraction:            Optional[float] = None


class TodayWarningResponse(BaseModel):
    warning_id:       int
    warning_date:     date
    location:         str
    crop:             str
    climate_zone:     str

    # Core warning
    is_warning:       bool          # True if Medium or High risk
    risk_score:       float         # 0.0 – 1.0
    risk_level:       str           # Low | Medium | High
    alert_message:    str

    # Likely pests today
    likely_pests:     List[LikelyPest]

    # Explanation
    top_features:     List[SHAPFeature]
    shap_interpretation: str
    shap_explanation: Optional[List[Dict[str, Any]]] = None
    counterfactual_prescription: Optional[Dict[str, Any]] = None

    # Economic Impact Advisor (₹ Optimization)
    economic_impact:  Optional[EconomicImpactResponse] = None

    # Weather context
    weather_snapshot: Dict[str, Any]

    # Confidence calibration (Platt scaling)
    raw_confidence:            Optional[float] = None   # Raw softmax probability from XGBoost
    calibrated_confidence:     Optional[float] = None   # Post-hoc Platt-calibrated probability
    confidence_band:           Optional[str]   = None   # "High" (≥0.80) | "Moderate" (≥0.55) | "Low" (<0.55)
    model_calibration_version: Optional[str]   = None   # e.g. "1.0.0-platt"

    # Meta
    data_date:        date   # date of latest weather observation used
    model_version:    str
    data_source:      str = "NASA POWER"



# ── Detection ─────────────────────────────────────────────────

class DetectionRequest(BaseModel):
    latitude:  float = Field(9.1728)
    longitude: float = Field(77.8710)
    location:  str   = Field("Kovilpatti")
    crop:      str   = Field(..., example="Cotton")
    warning_id: Optional[int] = None


class DetectedPest(BaseModel):
    pest_name:        str
    pest_type:        str
    detection_status: str
    confidence:       float
    rules_triggered:  List[str]
    evidence:         Dict[str, Any]
    management_advice: str


class DetectionResponse(BaseModel):
    detection_id:   int
    location:       str
    crop:           str
    detection_date: datetime
    overall_status: str
    detected_pests: List[DetectedPest]
    weather_context: Dict[str, Any]
    action_required: bool
    alert_message:  str


# ── Features ──────────────────────────────────────────────────

class WeatherFeatures(BaseModel):
    date:              str
    t2m:               float
    t2m_max:           float
    t2m_min:           float
    rh2m:              float
    ws2m:              float
    prectotcorr:       float
    allsky_sfc_sw_dwn: float
    et0:               float


class RollingFeatures(BaseModel):
    t2m_rolling_3d:   float
    t2m_rolling_7d:   float
    t2m_rolling_14d:  float
    rh2m_rolling_3d:  float
    rh2m_rolling_7d:  float
    rh2m_rolling_14d: float
    rain_rolling_3d:  float
    rain_rolling_7d:  float
    rain_rolling_14d: float


class SoilFeatures(BaseModel):
    soil_type:       str
    ph:              float
    ec:              float
    organic_carbon:  float
    nitrogen:        float
    phosphorus:      float
    potassium:       float


class FeaturesResponse(BaseModel):
    location:     str
    crop:         str
    climate_zone: str
    weather:      WeatherFeatures
    rolling:      RollingFeatures
    soil:         SoilFeatures
    derived:      Dict[str, Any]


# ── Weather ───────────────────────────────────────────────────

class WeatherResponse(BaseModel):
    location:          str
    latitude:          float
    longitude:         float
    date:              str
    t2m:               float
    t2m_max:           float
    t2m_min:           float
    rh2m:              float
    ws2m:              float
    prectotcorr:       float
    allsky_sfc_sw_dwn: float
    et0:               float
    source:            str = "NASA POWER"


# ── Warning History ───────────────────────────────────────────

class WarningHistoryItem(BaseModel):
    id:            int
    warning_date:  date
    location:      str
    crop:          str
    climate_zone:  Optional[str]
    risk_score:    float
    risk_level:    str
    is_warning:    bool

    class Config:
        from_attributes = True


class WarningHistoryResponse(BaseModel):
    total: int
    items: List[WarningHistoryItem]


# ── Auth Schemas ──────────────────────────────────────────────

class UserRegister(BaseModel):
    username:  str
    email:     str
    password:  str
    full_name: Optional[str] = None
    role:      Optional[str] = "farmer"
    district:  Optional[str] = "Coimbatore"

class UserLogin(BaseModel):
    username: Optional[str] = None
    email:    Optional[str] = None
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    username:     str
    role:         str
    user_id:      Optional[str] = None
    name:         Optional[str] = None
    region_assigned: Optional[str] = None
    farm_id:      Optional[str] = None

class UserProfile(BaseModel):
    id:        Optional[Any] = 1
    user_id:   Optional[str] = None
    username:  str
    email:     str
    role:      str
    full_name: Optional[str] = None
    district:  Optional[str] = None
    region_assigned: Optional[str] = None
    farm_id:   Optional[str] = None



# ── Disease Scan Schemas ─────────────────────────────────────

class DiseaseScanResponse(BaseModel):
    disease_name:          str
    disease_key:           str
    crop:                  str
    pathogen:              str
    category:              str
    confidence:            float
    severity_pct:          float
    severity_level:        str
    organic_treatment:     str
    chemical_treatment:    str
    recommended_pesticide: str
    npk_recommendation:    str


# ── Yield Schemas ────────────────────────────────────────────

class YieldRequest(BaseModel):
    crop:             str = "Rice"
    temperature_c:    float = 28.5
    humidity_pct:     float = 75.0
    rainfall_mm:      float = 850.0
    soil_n:           float = 180.0
    soil_p:           float = 45.0
    soil_k:           float = 150.0
    soil_ph:          float = 6.5
    organic_carbon:   float = 0.65
    irrigation_type:  str   = "Drip"

class YieldResponse(BaseModel):
    crop:                   str
    base_yield_tons_ha:     float
    expected_yield_tons_ha: float
    expected_yield_kg_acre: float
    confidence_score:       float
    total_multiplier:       float
    factor_contributions:   List[Dict[str, Any]]
    advice:                 str


# ── Chatbot Schemas ──────────────────────────────────────────

class ChatQueryRequest(BaseModel):
    query:    str
    language: str = "ta" # 'ta' or 'en'
    context:  Optional[Dict[str, Any]] = None

class ChatQueryResponse(BaseModel):
    response_text: str
    language:      str
    audio_script:  str
    preset_intent: str


# ── Outbreak Schemas ─────────────────────────────────────────

class SpatialOutbreakResponse(BaseModel):
    user_lat:                float
    user_lon:                float
    spatial_propagated_risk: float
    spatial_risk_level:      str
    nearby_hubs:             List[Dict[str, Any]]
    outbreak_summary:        str

