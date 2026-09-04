# 🌾 CropShield v2 — Current-Day Pest Warning System

> **Is there a pest threat for my crop TODAY?**
> CropShield answers that question using XGBoost trained on 45 years of
> NASA POWER climate data (1980–2025) and live weather inference.

---

## 🆕 What Changed in v2

| Area | v1 | v2 |
|---|---|---|
| **Prediction target** | 3–7 day ahead forecast | **Today's pest warning** |
| **Training data** | Synthetic (8k rows) | **NASA POWER 1980–2025** (~1.5M rows) |
| **Feature engineering** | Basic rolling 3/7/14d | Rolling + lag + trend + VPD + seasonal cyclical |
| **Main API** | `POST /predict` | **`POST /predict-today`** |
| **DB table** | `pest_predictions` | **`pest_warning_logs`** |
| **Frontend** | Predict + Dashboard pages | **Today's Warning page** (always current-day) |

---

## 🌐 Overview

CropShield is a full-stack, AI-powered **current-day pest warning** system for
Tamil Nadu. It fetches the latest NASA POWER climate data, engineers 30-day
rolling and lag features, and runs an XGBoost classifier trained on
**1980–2025 historical climate data** to answer:

- Is there a pest warning today?
- What is the current pest risk level?
- Which pests are active today and why?

---

## ✨ Features

| Feature | Details |
|---|---|
| 🔮 Today's Warning | Current-day pest risk (Low / Medium / High) |
| 📡 NASA POWER Live | Fetches latest daily weather for any TN location |
| 🏋️ NASA POWER Training | 45 years (1980–2025) × 10 TN locations = ~1.5M rows |
| 🧮 Rich Feature Engineering | Rolling 3/7/14/30d, lag 1/3/7d, VPD, RH/temp trend, cumulative rain |
| 🐛 17 Pest Species | Cotton, Sorghum, Millets, Rice, Sugarcane, Pulses |
| 🔍 Rule-Based Detection | Confidence-scored pest presence for today |
| 🤖 SHAP Explanations | "Why is today high risk?" with human-readable interpretation |
| 🗃️ Warning Log | Full audit trail in `pest_warning_logs` table |

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI 0.111 |
| ML | XGBoost 2.0 + SHAP 0.45 + scikit-learn |
| Training data | NASA POWER 1980–2025 (Parquet, ~1.5M rows) |
| Database | PostgreSQL 15 / SQLite (dev) + SQLAlchemy |
| Frontend | React 18 + Recharts + Tailwind CSS |
| Climate source | NASA POWER API (live + historical) |
| Containerisation | Docker + Docker Compose |

---

## 📁 Project Structure

```
cropshield-pest/
├── backend/
│   ├── api/
│   │   ├── predict.py        # POST /predict-today  ← main endpoint
│   │   ├── detect.py         # POST /detect
│   │   ├── features.py       # GET  /features
│   │   ├── weather.py        # GET  /weather/current
│   │   └── history.py        # GET  /history
│   ├── models/
│   │   ├── db_models.py      # ORM: pest_warning_logs, historical_nasa_weather …
│   │   └── schemas.py        # Pydantic: TodayWarningRequest/Response …
│   └── services/
│       ├── weather_service.py    # Fetches 35-day window from NASA POWER
│       ├── inference_service.py  # predict_today() + SHAP
│       ├── soil_service.py       # Research-based soil profiles
│       └── pest_service.py       # Rule-based detection engine
├── ml/
│   ├── data/
│   │   ├── collect_nasa_historical.py  # Download 1980–2025 historical data
│   │   └── feature_engineering.py     # Full feature pipeline (rolling/lag/etc.)
│   └── training/
│       └── train_model.py      # Train on NASA POWER data, save artifacts
├── frontend/src/
│   ├── pages/
│   │   ├── TodayPage.jsx      # Today's warning (main page)
│   │   ├── DetectPage.jsx
│   │   ├── FeaturesPage.jsx   # Live feature inspector
│   │   └── HistoryPage.jsx
│   └── components/index.jsx   # TodayWarningCard, RiskGauge, ShapChart …
├── scripts/
│   ├── init_db.py
│   ├── schema.sql             # Updated PostgreSQL DDL
│   └── setup.sh
└── docs/
    ├── SYSTEM_DESIGN.md
    └── MODEL_DOCS.md
```

---

## 🚀 Quick Start

### Step 1 — Download NASA POWER Historical Data *(recommended)*

```bash
python -m venv venv && source venv/bin/activate
pip install -r backend/requirements.txt

# Downloads 1980–2025 for 10 Tamil Nadu locations (~1–2 hours)
python -m ml.data.collect_nasa_historical

# Or just a single location for testing:
python -m ml.data.collect_nasa_historical \
  --single-lat 9.1728 --single-lon 77.8710 \
  --single-name Kovilpatti --single-zone Dryland \
  --start 2000 --end 2025
```

> **Skip this step?** The training script auto-generates a realistic synthetic
> 1980–2025 fallback — safe for development, but real NASA data is recommended
> for production.

### Step 2 — Train the Model

```bash
python -m ml.training.train_model
# Artifacts saved to: ml/training/saved_models/
```

### Step 3 — Setup Database & Seed

```bash
cp config/.env.example config/.env   # edit DB URL if needed
python -m scripts.init_db
```

### Step 4 — Start Backend

```bash
uvicorn backend.main:app --reload --port 8000
# Docs: http://localhost:8000/api/v1/docs
```

### Step 5 — Start Frontend

```bash
cd frontend && npm install && npm run dev
# Open: http://localhost:5173
```

### Docker (all-in-one)

```bash
docker-compose up --build
```

---

## 📡 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/predict-today` | **Today's pest warning** (main endpoint) |
| `POST` | `/api/v1/detect` | Rule-based pest detection |
| `GET`  | `/api/v1/features` | Live engineered feature values |
| `GET`  | `/api/v1/weather/current` | Latest NASA POWER observation |
| `GET`  | `/api/v1/history` | Paginated warning log |
| `GET`  | `/api/v1/docs` | Swagger UI |

### POST /api/v1/predict-today

**Request:**
```json
{
  "latitude": 9.1728,
  "longitude": 77.8710,
  "location": "Kovilpatti",
  "crop": "Cotton",
  "climate_zone": "Dryland"
}
```

**Response:**
```json
{
  "warning_id": 42,
  "warning_date": "2025-04-12",
  "location": "Kovilpatti",
  "crop": "Cotton",
  "is_warning": true,
  "risk_score": 0.7312,
  "risk_level": "High",
  "alert_message": "🚨 HIGH PEST RISK today (2025-04-12) for Cotton at Kovilpatti.",
  "likely_pests": [
    { "pest_name": "Cotton Whitefly", "detection_status": "Confirmed", "confidence": 0.90 }
  ],
  "top_features": [
    { "feature": "consecutive_dry_days", "value": 9.0, "shap_value": 0.142, "impact": "positive" }
  ],
  "shap_interpretation": "Risk driven by: Dry Spell, 7-day Avg Humidity, Heat Index.",
  "weather_snapshot": { "temperature_c": 34.2, "humidity_pct": 78.1, ... },
  "data_date": "2025-04-11",
  "model_version": "2.0.0"
}
```

---

## 🧠 Model Summary

| Property | Value |
|---|---|
| Algorithm | XGBoost multi-class classifier |
| Training period | NASA POWER 1980-01-01 to 2025-12-31 |
| Training locations | 10 Tamil Nadu sites (all 5 climate zones) |
| Training rows | ~1.5M (real) / ~1.65M (synthetic fallback) |
| Features | ~52 (weather + rolling + lag + trend + soil + crop/zone one-hot) |
| Target | Today's risk: Low=0 / Medium=1 / High=2 |
| XAI | SHAP TreeExplainer with human-readable interpretation |

---

## 📜 License

MIT — see LICENSE

---

## 🙏 Credits

- Climate data: [NASA POWER](https://power.larc.nasa.gov/) (1980–2025)
- Soil data: MASU Journal Vol.64(8) 2023 · ResearchGate TN Soil Quality 2023
- Pest profiles: TNAU Crop Protection · ICAR Pest Management Advisories
- Weather pipeline base: [CropShield by SDhanvanth](https://github.com/SDhanvanth/CropShield)
