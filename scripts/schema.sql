-- ============================================================
-- CropShield v2 — PostgreSQL Schema
-- Updated for: NASA POWER 1980–2025 training + current-day warnings
-- Run: psql -U cropshield -d cropshield_db -f schema.sql
-- ============================================================

CREATE TYPE risk_level       AS ENUM ('Low', 'Medium', 'High');
CREATE TYPE detection_status AS ENUM ('None', 'Suspected', 'Confirmed');
CREATE TYPE climate_zone     AS ENUM ('Dryland', 'Irrigated', 'Delta', 'Semi-arid', 'Humid');

-- ── Historical NASA POWER Data ────────────────────────────────
-- Populated by: python -m ml.data.collect_nasa_historical
-- Used for: model training (1980-01-01 to 2025-12-31)
CREATE TABLE IF NOT EXISTS historical_nasa_weather (
    id                  SERIAL PRIMARY KEY,
    location            VARCHAR(100) NOT NULL,
    latitude            FLOAT,
    longitude           FLOAT,
    zone                VARCHAR(50),
    date                DATE NOT NULL,
    t2m                 FLOAT  COMMENT 'Mean temp at 2m (°C)',
    t2m_max             FLOAT,
    t2m_min             FLOAT,
    rh2m                FLOAT  COMMENT 'Relative humidity (%)',
    ws2m                FLOAT  COMMENT 'Wind speed (m/s)',
    prectotcorr         FLOAT  COMMENT 'Precipitation (mm/day)',
    allsky_sfc_sw_dwn   FLOAT  COMMENT 'Solar radiation (MJ/m²/day)',
    et0                 FLOAT  COMMENT 'Hargreaves ET₀ (mm/day)',
    created_at          TIMESTAMP DEFAULT NOW()
);
CREATE INDEX ix_hist_loc_date ON historical_nasa_weather(location, date);

-- ── Latest Weather Cache ──────────────────────────────────────
-- Stores freshest 35-day window per location.
-- Refreshed on each /predict-today call to avoid redundant API hits.
CREATE TABLE IF NOT EXISTS latest_weather_cache (
    id            SERIAL PRIMARY KEY,
    location      VARCHAR(100) NOT NULL UNIQUE,
    latitude      FLOAT,
    longitude     FLOAT,
    weather_json  JSONB NOT NULL COMMENT '35-day daily rows as JSON array',
    fetched_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    data_date     DATE COMMENT 'Date of most recent row in weather_json',
    updated_at    TIMESTAMP DEFAULT NOW()
);

-- ── Soil Profiles ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS soil_profiles (
    id              SERIAL PRIMARY KEY,
    location        VARCHAR(100),
    district        VARCHAR(100),
    climate_zone    climate_zone NOT NULL,
    soil_type       VARCHAR(100),
    ph              FLOAT,
    ec              FLOAT,
    organic_carbon  FLOAT,
    nitrogen        FLOAT,
    phosphorus      FLOAT,
    potassium       FLOAT,
    sand_pct        FLOAT,
    silt_pct        FLOAT,
    clay_pct        FLOAT,
    bulk_density    FLOAT,
    field_capacity  FLOAT,
    year            INTEGER,
    source          VARCHAR(255),
    created_at      TIMESTAMP DEFAULT NOW()
);

-- ── Pest References ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pest_references (
    id                          SERIAL PRIMARY KEY,
    pest_name                   VARCHAR(100) NOT NULL,
    crop                        VARCHAR(100) NOT NULL,
    pest_type                   VARCHAR(50),
    scientific_name             VARCHAR(200),
    favorable_temp_min          FLOAT,
    favorable_temp_max          FLOAT,
    favorable_rh_min            FLOAT,
    favorable_rh_max            FLOAT,
    favorable_rain_threshold    FLOAT,
    dry_spell_days              INTEGER,
    description                 TEXT,
    symptoms                    TEXT,
    management                  TEXT
);

-- ── Pest Warning Logs (main prediction table) ─────────────────
-- One record per POST /predict-today call.
-- warning_date = the actual calendar date of the warning (usually today).
CREATE TABLE IF NOT EXISTS pest_warning_logs (
    id                  SERIAL PRIMARY KEY,
    warning_date        DATE NOT NULL,
    location            VARCHAR(100) NOT NULL,
    latitude            FLOAT,
    longitude           FLOAT,
    crop                VARCHAR(100) NOT NULL,
    climate_zone        climate_zone,
    risk_score          FLOAT NOT NULL,
    risk_level          risk_level NOT NULL,
    likely_pests        JSONB   COMMENT '[{pest_name, confidence, status}]',
    shap_values         JSONB,
    shap_interpretation TEXT,
    weather_snapshot    JSONB,
    model_version       VARCHAR(50),
    created_at          TIMESTAMP DEFAULT NOW()
);
CREATE INDEX ix_warning_loc_date ON pest_warning_logs(location, warning_date);
CREATE INDEX ix_warning_crop     ON pest_warning_logs(crop);
CREATE INDEX ix_warning_date     ON pest_warning_logs(warning_date);

-- ── Pest Detections ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pest_detections (
    id               SERIAL PRIMARY KEY,
    warning_id       INTEGER REFERENCES pest_warning_logs(id),
    location         VARCHAR(100),
    crop             VARCHAR(100) NOT NULL,
    pest_name        VARCHAR(100),
    pest_type        VARCHAR(50),
    detection_status detection_status NOT NULL,
    confidence       FLOAT,
    rules_triggered  JSONB,
    evidence         JSONB,
    image_path       VARCHAR(255),
    image_based      BOOLEAN DEFAULT FALSE,
    detection_date   TIMESTAMP DEFAULT NOW(),
    created_at       TIMESTAMP DEFAULT NOW()
);
CREATE INDEX ix_detection_date ON pest_detections(detection_date);
CREATE INDEX ix_detection_crop ON pest_detections(crop);

-- ── Convenience view: today's active warnings ─────────────────
CREATE OR REPLACE VIEW v_active_warnings_today AS
SELECT w.id, w.warning_date, w.location, w.crop,
       w.climate_zone, w.risk_score, w.risk_level,
       w.shap_interpretation, w.model_version
FROM pest_warning_logs w
WHERE w.warning_date = CURRENT_DATE
  AND w.risk_level IN ('Medium', 'High')
ORDER BY w.risk_score DESC;

-- ── High-risk warnings last 30 days ───────────────────────────
CREATE OR REPLACE VIEW v_high_risk_30d AS
SELECT w.warning_date, w.location, w.crop, w.risk_level, w.risk_score
FROM pest_warning_logs w
WHERE w.warning_date >= CURRENT_DATE - INTERVAL '30 days'
  AND w.risk_level = 'High'
ORDER BY w.warning_date DESC;
