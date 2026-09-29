"""
CropShield — Pydantic Schemas (v2)
All request/response models for the updated API.
"""

from datetime import date, datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field, field_validator


# ── Shared validators ─────────────────────────────────────────

UserRole = Literal["farmer", "agronomist", "admin"]


def validate_polygon_ring(coordinates: Any) -> List[List[List[float]]]:
    """
    Validates GeoJSON Polygon coordinates: at least one ring, each ring with >= 4
    [lon, lat] pairs, closed (first == last), lon in [-180, 180], lat in [-90, 90].
    """
    if not isinstance(coordinates, list) or not coordinates:
        raise ValueError("Polygon coordinates must contain at least one linear ring.")
    rings: List[List[List[float]]] = []
    for ring in coordinates:
        if not isinstance(ring, list) or len(ring) < 3:
            raise ValueError("Each polygon ring must have at least 4 [lon, lat] positions (first == last).")
        clean_ring: List[List[float]] = []
        for pos in ring:
            if not isinstance(pos, (list, tuple)) or len(pos) < 2:
                raise ValueError("Each position must be a [lon, lat] pair.")
            try:
                lon, lat = float(pos[0]), float(pos[1])
            except (TypeError, ValueError):
                raise ValueError("Positions must be numeric [lon, lat] pairs.")
            if not (-180.0 <= lon <= 180.0) or not (-90.0 <= lat <= 90.0):
                raise ValueError("Positions must be [lon, lat] with lon in [-180, 180] and lat in [-90, 90].")
            clean_ring.append([lon, lat])
        if clean_ring[0] != clean_ring[-1]:
            # Leaflet-drawn rings are often left open: close them, then re-check the size.
            clean_ring.append(list(clean_ring[0]))
        if len(clean_ring) < 4 or len({(p[0], p[1]) for p in clean_ring}) < 3:
            raise ValueError("Polygon ring must have at least 3 distinct positions and be closed (first == last).")
        rings.append(clean_ring)
    return rings


class GeoJSONPolygon(BaseModel):
    type: Literal["Polygon"] = "Polygon"
    coordinates: List[List[List[float]]] = Field(
        ..., description="GeoJSON LinearRing coordinate arrays [[[lon, lat], [lon, lat], ...]] (closed ring)"
    )

    @field_validator("coordinates", mode="before")
    @classmethod
    def _check_coordinates(cls, v):
        return validate_polygon_ring(v)


class GeoJSONPoint(BaseModel):
    type: Literal["Point"] = "Point"
    coordinates: List[float] = Field(..., description="[lon, lat]")

    @field_validator("coordinates")
    @classmethod
    def _check_point(cls, v):
        if len(v) < 2:
            raise ValueError("Point coordinates must be [lon, lat].")
        lon, lat = float(v[0]), float(v[1])
        if not (-180.0 <= lon <= 180.0) or not (-90.0 <= lat <= 90.0):
            raise ValueError("Point must be [lon, lat] with valid ranges.")
        return [lon, lat]


# ── Today's Warning ───────────────────────────────────────────

class TodayWarningRequest(BaseModel):
    latitude:     float = Field(9.1728,    ge=-90,  le=90)
    longitude:    float = Field(77.8710,   ge=-180, le=180)
    location:     str   = Field("Kovilpatti")
    crop:         str   = Field(..., example="Cotton")
    climate_zone: str   = Field("Dryland",  example="Dryland")
    # Optional: farm to attribute this prediction to (must be owned by the caller).
    # When omitted the caller's own primary farm is used (if any).
    farm_id:      Optional[str] = Field(None, example=None)

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
    model_calibration_version: Optional[str]   = None   # e.g. "2.0.0-platt"
    calibration_method:        Optional[str]   = None   # "platt" | "analytic-fallback" | None (rule fallback)
    is_rule_fallback:          bool            = False  # True when model_version == "rules-fallback-v2"

    # Meta
    data_date:        date   # date of latest weather observation used
    model_version:    str
    data_source:      str = "NASA POWER"
    # {"weather_source": "NASA_POWER" | "synthetic", "is_synthetic": bool}
    data_quality:     Optional[Dict[str, Any]] = None
    farm_id:          Optional[str] = None



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
    username:  str = Field(..., min_length=1, max_length=100)
    email:     str = Field(..., min_length=3, max_length=254)
    password:  str = Field(..., min_length=8, max_length=128)
    full_name: Optional[str] = Field(None, max_length=150)
    # Ignored by the server: self-registration always creates a "farmer" account.
    role:      Optional[str] = "farmer"
    district:  Optional[str] = Field("Coimbatore", max_length=100)

    @field_validator("email")
    @classmethod
    def _check_email(cls, v: str) -> str:
        v = v.strip().lower()
        local, _, domain = v.partition("@")
        if not local or "." not in domain or " " in v:
            raise ValueError("A valid email address is required.")
        return v

class UserLogin(BaseModel):
    username: Optional[str] = Field(None, max_length=254)  # accepted only if it is an email
    email:    Optional[str] = Field(None, max_length=254)
    password: str = Field(..., max_length=128)

class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    username:     str
    role:         str
    user_id:      Optional[str] = None
    name:         Optional[str] = None
    region_assigned: Optional[str] = None
    farm_id:      Optional[str] = None
    preferred_language: Optional[str] = "en"

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
    preferred_language: Optional[str] = "en"

class UserLanguageUpdate(BaseModel):
    language: str = "en"



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
    confidence_score:       Optional[float] = None  # formula model: no validated confidence
    is_heuristic:           Optional[bool] = None
    method:                 Optional[str] = None
    source:                 Optional[str] = None
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

