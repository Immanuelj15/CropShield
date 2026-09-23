# 🧠 CropShield v2 — System Design

## Key Design Changes (v1 → v2)

| Concern | v1 | v2 |
|---|---|---|
| Training data | 8k synthetic rows | NASA POWER 1980–2025 (~1.5M rows) |
| Prediction target | 3–7 day ahead forecast | **Current-day pest warning** |
| Feature pipeline | ad-hoc in weather_service | Centralised `feature_engineering.py` |
| Weather fetch window | 20 days | **35 days** (for 30-day rolling validity) |
| DB primary table | `pest_predictions` | **`pest_warning_logs`** |
| Main API | `POST /predict` | **`POST /predict-today`** |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                       REACT FRONTEND                         │
│  TodayPage | DetectPage | FeaturesPage | HistoryPage         │
│  TodayWarningCard · RiskGauge · ShapChart · LikelyPestCard   │
└───────────────────────────┬──────────────────────────────────┘
                            │ HTTP REST (Axios)
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                       FASTAPI v2                             │
│  POST /predict-today ──→ weather_service (35d NASA POWER)    │
│                      ──→ feature_engineering.build_live_row  │
│                      ──→ inference_service.predict_today     │
│                      ──→ pest_service.detect_pests           │
│                      ──→ pest_warning_logs (persist)         │
│  POST /detect        ──→ same weather + rule engine          │
│  GET  /features      ──→ all engineered features for today   │
│  GET  /history       ──→ pest_warning_logs query             │
└────────┬─────────────────┬────────────────────────┬─────────┘
         │                 │                        │
         ▼                 ▼                        ▼
  NASA POWER API     PostgreSQL               ML Artifacts
  (live, 35d)        pest_warning_logs        pest_risk_model.joblib
                     soil_profiles            scaler.joblib
                     pest_detections          feature_names.json
                     latest_weather_cache     feature_importance.json
```

---

## Full Pipeline — POST /predict-today

```
1. Receive: { location, crop, climate_zone, lat, lon }
       │
2. NASA POWER API  →  35 days of daily weather
   (T2M, T2M_MAX, T2M_MIN, RH2M, WS2M, PRECTOTCORR, ALLSKY_SFC_SW_DWN)
   + Hargreaves ET₀ computed
       │
3. feature_engineering.engineer_features(weather_df)
   ┌───────────────────────────────────────────────────────┐
   │ Calendar: month_sin, month_cos, doy_sin, doy_cos     │
   │ Derived:  temp_range, heat_index, vpd               │
   │ Rolling:  t2m_rolling_3/7/14/30d                    │
   │           rh2m_rolling_3/7/14/30d                   │
   │           rain_rolling_3/7/14/30d                   │
   │           rain_monthly_cumul                        │
   │ Lag:      t2m_lag1/3/7, rh2m_lag1/3/7, rain_lag1/3/7 │
   │ Trend:    rh_trend_7d, temp_trend_7d (linear slope) │
   │ Consec:   consecutive_dry_days, consecutive_wet_days │
   └───────────────────────────────────────────────────────┘
   → take last row (today)
       │
4. Merge soil profile (research-based, zone-specific)
   + crop one-hot + zone one-hot
       │
5. StandardScaler.transform()
       │
6. XGBoost.predict_proba()
   risk_score = P(Medium)*0.5 + P(High)*1.0
   risk_level = Low | Medium | High
       │
7. SHAP TreeExplainer → top 12 features by |SHAP|
   build_shap_interpretation() → human-readable string
       │
8. Soil risk multiplier (0.8–1.3) applied to score
       │
9. pest_service.detect_pests() → rule-based pests for today
       │
10. Persist PestWarningLog → pest_warning_logs table
       │
11. Return TodayWarningResponse
    { is_warning, risk_score, risk_level, alert_message,
      likely_pests, top_features, shap_interpretation,
      weather_snapshot, data_date, model_version }
```

---

## NASA POWER Historical Training Pipeline

```
ml/data/collect_nasa_historical.py
  → 10 TN locations × 1980–2025 × 365 days
  → chunk by year (API limit: 366 days/call)
  → async with rate limiting (1s per 10 calls)
  → save per-location Parquet files
  → combine → ml/data/nasa_historical/all_locations.parquet
        │
ml/data/feature_engineering.build_training_matrix()
  → engineer_features() per location (rolling/lag/etc.)
  → drop first 30 rows (insufficient history)
  → × 6 crops = 6× rows per location-day
  → merge soil profiles
  → compute risk labels (_compute_risk_score())
  → ~1.5M labelled rows
        │
ml/training/train_model.py
  → time-aware split (last 10% = test, no future leak)
  → StandardScaler
  → XGBClassifier (400 trees, early stopping)
  → evaluate: accuracy / F1 / AUC-ROC / 5-fold CV
  → SHAP summary plot
  → save: pest_risk_model.joblib, scaler.joblib,
          feature_names.json, metrics.json
```

---

## Database Schema (v2)

```sql
historical_nasa_weather  -- raw daily NASA POWER rows (training archive)
latest_weather_cache     -- 35-day live window per location
soil_profiles            -- research-based, seeded at startup
pest_references          -- 17 pests × 6 crops, seeded at startup
pest_warning_logs        -- one row per /predict-today call  ← primary
pest_detections          -- rule-based detection output
```

---

## Feature Engineering Details

### New in v2

| Feature | Description | Why it matters |
|---|---|---|
| `vpd` | Vapour pressure deficit (kPa) | Plant stress; stomata close above 2 kPa |
| `rh_trend_7d` | Linear slope of RH over 7 days | Rising humidity → fungal risk |
| `temp_trend_7d` | Linear slope of temp over 7 days | Warming trend → sucking pest risk |
| `rain_monthly_cumul` | Running monthly rainfall sum | Cumulative moisture for blast, BPH |
| `rain_rolling_30d` | 30-day rainfall sum | Seasonal wetness index |
| `t2m_lag1/3/7` | Temp 1, 3, 7 days ago | Pest development cycle lags |
| `rain_lag1/3/7` | Rain 1, 3, 7 days ago | Post-rain humidity dynamics |
| `month_sin/cos` | Cyclical month encoding | Seasonal pest patterns |
| `doy_sin/cos` | Cyclical day-of-year encoding | Fine-grained seasonality |
| `consecutive_wet_days` | Days with ≥1mm rain | Prolonged wet = blast/BPH risk |

---

## API Documentation

### POST /api/v1/predict-today

Generates today's pest warning using the latest available NASA POWER data.

**Request body:**
```json
{ "latitude": float, "longitude": float, "location": str,
  "crop": str, "climate_zone": str }
```

**Response:**
```json
{
  "warning_id": int,
  "warning_date": "YYYY-MM-DD",      // date of weather observation
  "is_warning": bool,                 // true if Medium or High
  "risk_score": float,                // 0.0 – 1.0
  "risk_level": "Low|Medium|High",
  "alert_message": str,
  "likely_pests": [{ "pest_name", "detection_status", "confidence", "management_advice" }],
  "top_features": [{ "feature", "value", "shap_value", "impact" }],
  "shap_interpretation": str,
  "weather_snapshot": { ... },
  "data_date": "YYYY-MM-DD",
  "model_version": str
}
```

---

## Deployment

### Local
```bash
bash scripts/setup.sh   # one-command setup
uvicorn backend.main:app --reload --port 8000
cd frontend && npm run dev
```

### Docker
```bash
docker-compose up --build
# API  → http://localhost:8000
# App  → http://localhost:5173
```

---

## Future Improvements

1. **Real pest incidence labels** — integrate TNAU/ICAR surveillance data to replace rule-derived labels
2. **High-Resolution Satellite Remote Sensing** — integration of 1km gridded reanalysis (ERA5-Land / Sentinel-2 surface reflectance) via cloud REST API
3. **Image-based CNN** — MobileNetV3 for photo-based pest confirmation
4. **SMS/WhatsApp alerts** — Twilio integration for High risk warnings
5. **Geospatial heatmap** — district-level risk overlay with Leaflet.js
6. **Phenology-aware model** — separate risk curves per crop growth stage
7. **Ensemble model** — XGBoost + LightGBM + CatBoost soft voting
