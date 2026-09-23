"""
CropShield — Database ORM Models (v2)
Updated schema for NASA POWER 1980–2025 training + current-day warnings.
"""

from datetime import datetime
from sqlalchemy import (
    Column, Integer, Float, String, DateTime, Boolean,
    ForeignKey, Text, JSON, Date, Enum as SAEnum, Index
)
from sqlalchemy.orm import relationship
import enum
from backend.db.database import Base


class RiskLevel(str, enum.Enum):
    LOW    = "Low"
    MEDIUM = "Medium"
    HIGH   = "High"


class DetectionStatus(str, enum.Enum):
    NONE      = "None"
    SUSPECTED = "Suspected"
    CONFIRMED = "Confirmed"


class ClimateZone(str, enum.Enum):
    DRYLAND   = "Dryland"
    IRRIGATED = "Irrigated"
    DELTA     = "Delta"
    SEMI_ARID = "Semi-arid"
    HUMID     = "Humid"


# ── Historical NASA POWER Weather ─────────────────────────────
# Long-range daily records used for model training (1980–2025).
# Written once by collect_nasa_historical.py; rarely queried live.

class HistoricalNasaWeather(Base):
    __tablename__ = "historical_nasa_weather"

    id         = Column(Integer, primary_key=True, index=True)
    location   = Column(String(100), nullable=False, index=True)
    latitude   = Column(Float)
    longitude  = Column(Float)
    zone       = Column(String(50))
    date       = Column(Date, nullable=False, index=True)

    t2m              = Column(Float, comment="Mean temperature at 2m (°C)")
    t2m_max          = Column(Float)
    t2m_min          = Column(Float)
    rh2m             = Column(Float, comment="Relative humidity (%)")
    ws2m             = Column(Float, comment="Wind speed (m/s)")
    prectotcorr      = Column(Float, comment="Precipitation (mm/day)")
    allsky_sfc_sw_dwn= Column(Float, comment="Solar radiation (MJ/m²/day)")
    et0              = Column(Float, comment="Hargreaves ET₀ (mm/day)")

    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_hist_loc_date", "location", "date"),
    )


# ── Latest Weather Cache ──────────────────────────────────────
# Stores the freshest 35-day window per location, refreshed on each
# /predict-today call. Avoids redundant NASA POWER API calls.

class LatestWeatherCache(Base):
    __tablename__ = "latest_weather_cache"

    id         = Column(Integer, primary_key=True, index=True)
    location   = Column(String(100), nullable=False, unique=True, index=True)
    latitude   = Column(Float)
    longitude  = Column(Float)

    # Serialised DataFrame as JSON array of daily rows (last 35 days)
    weather_json = Column(JSON, nullable=False)
    fetched_at   = Column(DateTime, nullable=False, default=datetime.utcnow)
    data_date    = Column(Date, comment="Date of the most recent row in weather_json")

    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ── Soil Profiles ─────────────────────────────────────────────

class SoilProfile(Base):
    __tablename__ = "soil_profiles"

    id           = Column(Integer, primary_key=True, index=True)
    location     = Column(String(100))
    district     = Column(String(100))
    climate_zone = Column(SAEnum(ClimateZone), nullable=False)
    soil_type    = Column(String(100))
    ph           = Column(Float)
    ec           = Column(Float)
    organic_carbon  = Column(Float)
    nitrogen     = Column(Float)
    phosphorus   = Column(Float)
    potassium    = Column(Float)
    sand_pct     = Column(Float)
    silt_pct     = Column(Float)
    clay_pct     = Column(Float)
    bulk_density = Column(Float)
    field_capacity = Column(Float)
    year         = Column(Integer)
    source       = Column(String(255))
    created_at   = Column(DateTime, default=datetime.utcnow)


# ── Pest Reference Data ───────────────────────────────────────

class PestReference(Base):
    __tablename__ = "pest_references"

    id              = Column(Integer, primary_key=True, index=True)
    pest_name       = Column(String(100), nullable=False)
    crop            = Column(String(100), nullable=False)
    pest_type       = Column(String(50))
    scientific_name = Column(String(200))
    favorable_temp_min  = Column(Float)
    favorable_temp_max  = Column(Float)
    favorable_rh_min    = Column(Float)
    favorable_rh_max    = Column(Float)
    favorable_rain_threshold = Column(Float)
    dry_spell_days      = Column(Integer)
    description = Column(Text)
    symptoms    = Column(Text)
    management  = Column(Text)


# ── Today's Pest Warning (main prediction log) ────────────────

class PestWarningLog(Base):
    """
    One record per /predict-today call.
    Stores today's date, risk score, likely pests, and SHAP data.
    """
    __tablename__ = "pest_warning_logs"

    id           = Column(Integer, primary_key=True, index=True)
    warning_date = Column(Date, nullable=False, index=True, comment="The date the warning is for")
    location     = Column(String(100), nullable=False, index=True)
    latitude     = Column(Float)
    longitude    = Column(Float)
    crop         = Column(String(100), nullable=False)
    climate_zone = Column(SAEnum(ClimateZone))

    risk_score   = Column(Float, nullable=False)
    risk_level   = Column(SAEnum(RiskLevel), nullable=False)

    # Likely pests (from rule-based detection layer, as JSON list)
    likely_pests = Column(JSON, comment="[{pest_name, confidence, status}]")

    # Explanation
    shap_values        = Column(JSON)
    shap_interpretation= Column(Text)

    # Weather snapshot for this warning date
    weather_snapshot = Column(JSON)

    # Economic Impact Advisor
    economic_impact  = Column(JSON, nullable=True)

    model_version = Column(String(50))
    created_at    = Column(DateTime, default=datetime.utcnow)

    detections = relationship("PestDetection", back_populates="warning")

    __table_args__ = (
        Index("ix_warning_loc_date", "location", "warning_date"),
    )


# ── Pest Detections (rule-based layer output) ─────────────────

class PestDetection(Base):
    __tablename__ = "pest_detections"

    id           = Column(Integer, primary_key=True, index=True)
    warning_id   = Column(Integer, ForeignKey("pest_warning_logs.id"), nullable=True)
    location     = Column(String(100))
    crop         = Column(String(100), nullable=False)

    pest_name        = Column(String(100))
    pest_type        = Column(String(50))
    detection_status = Column(SAEnum(DetectionStatus), nullable=False)
    confidence       = Column(Float)

    rules_triggered = Column(JSON)
    evidence        = Column(JSON)
    image_path      = Column(String(255), nullable=True)
    image_based     = Column(Boolean, default=False)

    detection_date = Column(DateTime, default=datetime.utcnow, index=True)
    warning = relationship("PestWarningLog", back_populates="detections")
    created_at = Column(DateTime, default=datetime.utcnow)


# ── User Account Model (Farmer / Expert / Admin) ──────────────

class UserRole(str, enum.Enum):
    FARMER = "farmer"
    EXPERT = "expert"
    ADMIN  = "admin"


class User(Base):
    __tablename__ = "users"

    id             = Column(Integer, primary_key=True, index=True)
    username       = Column(String(100), unique=True, nullable=False, index=True)
    email          = Column(String(200), unique=True, nullable=False, index=True)
    hashed_password= Column(String(255), nullable=False)
    role           = Column(SAEnum(UserRole), default=UserRole.FARMER, nullable=False)
    full_name      = Column(String(150))
    phone          = Column(String(20))
    district       = Column(String(100), default="Coimbatore")
    state          = Column(String(100), default="Tamil Nadu")
    created_at     = Column(DateTime, default=datetime.utcnow)


# ── Disease Scan Log ─────────────────────────────────────────

class DiseaseScanLog(Base):
    __tablename__ = "disease_scan_logs"

    id               = Column(Integer, primary_key=True, index=True)
    user_id          = Column(Integer, ForeignKey("users.id"), nullable=True)
    crop             = Column(String(100))
    disease_name     = Column(String(150), nullable=False)
    disease_key      = Column(String(100))
    confidence       = Column(Float, nullable=False)
    severity_pct     = Column(Float, nullable=False)
    severity_level   = Column(String(50))
    organic_treatment= Column(Text)
    chemical_treatment=Column(Text)
    image_url        = Column(String(255), nullable=True)
    created_at       = Column(DateTime, default=datetime.utcnow, index=True)


# ── Yield Prediction Log ─────────────────────────────────────

class YieldPredictionLog(Base):
    __tablename__ = "yield_prediction_logs"

    id                   = Column(Integer, primary_key=True, index=True)
    user_id              = Column(Integer, ForeignKey("users.id"), nullable=True)
    crop                 = Column(String(100), nullable=False)
    expected_yield_tons_ha=Column(Float, nullable=False)
    expected_yield_kg_acre=Column(Float, nullable=False)
    total_multiplier     = Column(Float)
    created_at           = Column(DateTime, default=datetime.utcnow)


# ── User Feedback & Advisory Log ─────────────────────────────

class FeedbackLog(Base):
    __tablename__ = "feedback_logs"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=True)
    category   = Column(String(50)) # 'PestWarning', 'DiseaseScan', 'Yield'
    rating     = Column(Integer)    # 1 to 5
    comment    = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

