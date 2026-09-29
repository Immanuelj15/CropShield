# 🌾 CropShield v2 — Current-Day Pest Warning System

> **Is there a pest threat for my crop TODAY?**
> CropShield answers that question with an XGBoost model trained on 20 years of
> real NASA POWER daily weather (2005–2024, 10 Tamil Nadu sites) and live weather inference.
> Labels are a rule-derived weather-suitability index, **not** observed outbreaks
> (see `ml/data/LABELING.md`).

---

## 🆕 What Changed in v2

| Area | v1 | v2 |
|---|---|---|
| **Prediction target** | 3–7 day ahead forecast | **Today's pest warning** |
| **Training data** | Synthetic (8k rows) | **NASA POWER 2005–2024**, 10 TN sites × 6 crops (~436k rows) |
| **Feature engineering** | Basic rolling 3/7/14d | Rolling + lag + trend + VPD + seasonal cyclical |
| **Main API** | `POST /predict` | **`POST /predict-today`** |
| **DB table** | `pest_predictions` | **`pest_warning_logs`** |
| **Frontend** | Predict + Dashboard pages | **Today's Warning page** (always current-day) |

---

## 🌐 Overview

CropShield is a full-stack, AI-powered **current-day pest warning** system for
Tamil Nadu. It fetches the latest NASA POWER climate data, engineers 30-day
rolling and lag features with the same pipeline used in training, and runs an
XGBoost classifier trained on **2005–2024 NASA POWER data** to answer:

- Is there a pest warning today?
- What is the current pest risk level?
- Which pests are active today and why?

---

## ✨ Features

| Feature | Details |
|---|---|
| 🔮 Today's Warning | Current-day pest risk (Low / Medium / High) |
| 📡 NASA POWER Live | Fetches latest daily weather for any TN location |
| 🏋️ NASA POWER Training | 20 years (2005–2024) × 10 TN locations × 6 crops, split by year |
| 🧮 Rich Feature Engineering | Rolling 3/7/14/30d, lag 1/3/7d, VPD, RH/temp trend, cumulative rain |
| 🐛 17 Pest Species | Cotton, Sorghum, Millets, Rice, Sugarcane, Pulses |
| 🔍 Rule-Based Detection | Confidence-scored pest presence for today |
| 🤖 SHAP Explanations | "Why is today high risk?" with human-readable interpretation |
| 🏷️ Data provenance | Every `/predict-today` response has `data_quality.weather_source` (`NASA_POWER` or `synthetic`); synthetic weather never triggers alerts |
| 🔐 Auth | JWT bearer tokens, farmer / agronomist / admin roles, per-farm ownership checks |
| 🗃️ Warning Log | Full audit trail in `pest_warning_logs` table |

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI 0.111 |
| ML | XGBoost 3.2 + SHAP + scikit-learn 1.8 + pandas 3 (Python 3.12) |
| Training data | NASA POWER 2005–2024 daily CSVs in `ml/data/nasa_power_raw/` |
| Database | MongoDB 7 (Beanie) + legacy SQLite (SQLAlchemy) |
| Frontend | React 18 + Recharts + Tailwind CSS |
| Climate source | NASA POWER API (live + historical) |
| Containerisation | Docker + Docker Compose (nginx serves the SPA and proxies `/api`, `/uploads`) |

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
│   │   ├── FarmerDashboard.jsx  # Today's warning (main farmer page)
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

### Step 1 — Install and configure

```bash
python -m venv venv && source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r backend/requirements.txt              # Python 3.12
cp config/.env.example config/.env
```

Edit `config/.env`:

| Variable | Why |
|---|---|
| `SECRET_KEY` | JWT signing key (≥ 16 random chars): `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Required when `APP_ENV=production`; in development an empty value means a random key and every login is lost on restart. |
| `APP_ENV` | `development` locally, `production` when deployed. |
| `CORS_ORIGINS` | Comma-separated browser origins (default `http://localhost:5173,http://127.0.0.1:5173`). |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Optional web push. Empty = push disabled. |
| `TWILIO_*` | Optional real SMS/WhatsApp. Empty = simulated (logged only). |

### Step 2 — Seed MongoDB (development)

```bash
python -m scripts.init_mongo_db        # demo users farmer@/agronomist@/admin@cropshield.org, farms, advisories
python -m scripts.seed_districts       # 38 district reference points
python -m scripts.seed_chatbot_intents
```

### Step 3 — Start Backend

```bash
uvicorn backend.main:app --reload --port 8000        # or run_backend.bat
# Docs: http://localhost:8000/api/v1/docs
```

### Step 4 — Start Frontend

```bash
cd frontend && npm install && npm run dev            # or run_frontend.bat (run_all.bat starts both)
# Open: http://localhost:5173
```

### Model artifacts (optional retraining)

The trained artifacts are committed in `ml/training/saved_models/`, so you don't need to retrain.
To reproduce them:

```bash
python -m ml.data.collect_nasa_historical     # re-download NASA POWER 2005–2024 (already in ml/data/nasa_power_raw/)
python -m ml.training.train_model             # ~18 min; rewrites the committed artifacts
```

### Tests

```bash
pip install -r backend/requirements-dev.txt
python -m pytest tests -q
```

The tests use a separate `cropshield_test` database (dropped afterwards) and a temporary SQLite file. They skip DB tests
when MongoDB is unreachable. External-API tests only run with `CROPSHIELD_TEST_NETWORK=1`.

### Docker (all-in-one)

```bash
echo "SECRET_KEY=$(python -c 'import secrets; print(secrets.token_urlsafe(48))')" > .env
docker compose up --build
# Web app: http://localhost:8080  (API only on 127.0.0.1:8000)
```

See `docs/DEPLOYMENT_GUIDE.md` for production settings (nginx proxy, secrets, demo-data seeding).

---

## 📡 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/auth/login` | Email + password → JWT (`Authorization: Bearer <token>`) |
| `POST` | `/api/v1/predict-today` | **Today's pest warning** (main endpoint, auth required) |
| `POST` | `/api/v1/detect` | Rule-based pest detection (auth required) |
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
  "climate_zone": "Dryland",
  "farm_id": null
}
```
`farm_id` is optional and must be one of the caller's farms.

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
  "model_version": "4.0.0-nasa-power-rules",
  "data_quality": { "weather_source": "NASA_POWER", "is_synthetic": false }
}
```

---

## 🧠 Model Summary

| Property | Value |
|---|---|
| Algorithm | XGBoost multi-class classifier + Platt calibration (`calibration_params.json`) |
| Training data | Real NASA POWER daily data (community AG), 2005-01-01 to 2024-12-31 |
| Training locations | 10 Tamil Nadu sites (all 5 climate zones) × 6 crops |
| Split (by year) | train 2005–2016 · early-stop 2017–2018 · calibration 2019–2021 · test 2022–2024 |
| Features | 46 (weather + rolling + lag + trend + spell counters + crop one-hot), `feature_names.json` |
| Target | Rule-derived weather-suitability index from `pest_service.PEST_DATABASE`: Low=0 / Medium=1 / High=2 |
| Test accuracy | 0.9966 vs the rule labels (majority baseline 0.518). This measures agreement with the rules, **not** outbreak-prediction skill |
| XAI | SHAP TreeExplainer with human-readable interpretation |

Live inference uses exactly the training feature pipeline. If a trained feature is missing, the API
returns the documented rule index flagged `model_version = "rules-fallback-v2"` instead of zero-filling.
Details: `ml/data/LABELING.md`, `ml/training/saved_models/metrics.json`.

---

## 📜 License

MIT — see LICENSE

---

## 🙏 Credits

- Climate data: [NASA POWER](https://power.larc.nasa.gov/) (1980–2025)
- Soil data: MASU Journal Vol.64(8) 2023 · ResearchGate TN Soil Quality 2023
- Pest profiles: TNAU Crop Protection · ICAR Pest Management Advisories
- Weather pipeline base: [CropShield by SDhanvanth](https://github.com/SDhanvanth/CropShield)
