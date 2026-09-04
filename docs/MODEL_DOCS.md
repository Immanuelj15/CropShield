# 📊 CropShield v2 — Model & Data Documentation

## Training Data: NASA POWER 1980–2025

### Source
NASA Prediction of Worldwide Energy Resources (POWER)
- URL: https://power.larc.nasa.gov/api/temporal/daily/point
- Community: AG (Agriculture)
- Resolution: Point-based daily values at exact lat/lon

### Variables Fetched

| Variable | Description | Unit |
|---|---|---|
| T2M | Mean temperature at 2m | °C |
| T2M_MAX | Maximum daily temperature | °C |
| T2M_MIN | Minimum daily temperature | °C |
| RH2M | Relative humidity at 2m | % |
| WS2M | Wind speed at 2m | m/s |
| PRECTOTCORR | Bias-corrected precipitation | mm/day |
| ALLSKY_SFC_SW_DWN | All-sky solar radiation | MJ/m²/day |
| ET₀ | Hargreaves evapotranspiration (computed) | mm/day |

### Training Locations (10 sites, all 5 Tamil Nadu zones)

| Location | Lat | Lon | Zone |
|---|---|---|---|
| Kovilpatti | 9.1728 | 77.8710 | Dryland |
| Tirunelveli | 8.7139 | 77.7567 | Dryland |
| Thanjavur | 10.7870 | 79.1378 | Delta |
| Nagapattinam | 10.7672 | 79.8449 | Delta |
| Trichy | 10.7905 | 78.7047 | Irrigated |
| Madurai | 9.9252 | 78.1198 | Irrigated |
| Vellore | 12.9165 | 79.1325 | Semi-arid |
| Krishnagiri | 12.5266 | 78.2138 | Semi-arid |
| Coimbatore | 11.0168 | 76.9558 | Humid |
| Nilgiris | 11.4916 | 76.7337 | Humid |

### Dataset Size
- Period: 1980-01-01 to 2025-12-31
- Days per location: ~16,800
- × 6 crops × 10 locations: ~1,008,000 rows
- After dropping first-30-day burn-in: **~975,000 rows**

---

## Feature Engineering (52 features total)

### Group 1: Raw Weather (8)
`t2m, t2m_max, t2m_min, rh2m, ws2m, prectotcorr, allsky_sfc_sw_dwn, et0`

### Group 2: Calendar / Cyclical (6)
`month_sin, month_cos, doy_sin, doy_cos`
*(Sine/cosine encoding captures cyclical seasonal patterns without ordinal bias)*

### Group 3: Derived (4)
| Feature | Formula |
|---|---|
| `temp_range` | t2m_max − t2m_min |
| `heat_index` | Rothfusz equation (°C) |
| `vpd` | es(T) × (1 − RH/100) — vapour pressure deficit (kPa) |
| *(et0 already in raw)* | |

### Group 4: Rolling Means — Temperature (4)
`t2m_rolling_3d, t2m_rolling_7d, t2m_rolling_14d, t2m_rolling_30d`

### Group 5: Rolling Means — Humidity (4)
`rh2m_rolling_3d, rh2m_rolling_7d, rh2m_rolling_14d, rh2m_rolling_30d`

### Group 6: Rolling Sums — Rainfall (5)
`rain_rolling_3d, rain_rolling_7d, rain_rolling_14d, rain_rolling_30d, rain_monthly_cumul`

### Group 7: Lag Features (9)
`t2m_lag1, t2m_lag3, t2m_lag7`
`rh2m_lag1, rh2m_lag3, rh2m_lag7`
`rain_lag1, rain_lag3, rain_lag7`

### Group 8: Trend Features (2)
`rh_trend_7d` — linear slope of RH over 7 days (%/day)
`temp_trend_7d` — linear slope of temperature over 7 days (°C/day)

### Group 9: Consecutive Day Counts (2)
`consecutive_dry_days` — days with <1mm rain
`consecutive_wet_days` — days with ≥1mm rain

### Group 10: Soil (9)
`soil_ph, soil_ec, soil_oc, soil_nitrogen, soil_phosphorus, soil_potassium,
soil_clay_pct, soil_sand_pct, soil_bulk_density`
*(Static per zone, from MASU Journal 2023)*

### Group 11: Crop One-Hot (6)
`crop_cotton, crop_sorghum, crop_millets, crop_rice, crop_sugarcane, crop_pulses`

### Group 12: Zone One-Hot (5)
`zone_dryland, zone_irrigated, zone_delta, zone_semi_arid, zone_humid`

---

## Pest Risk Label Derivation

Labels are derived from documented pest-climate thresholds for Tamil Nadu.
These replace the need for actual field pest incidence data (which is unavailable
at scale). Each crop has dedicated rules:

### Cotton
| Condition | Score | Pest implied |
|---|---|---|
| T>32°C, RH<58%, dry≥6d | +0.40 | Whitefly, Thrips |
| 28≤T≤38, 50≤RH≤78, rain7d<18 | +0.38 | Bollworm |
| RH>75%, rain7d>20 | +0.22 | Aphid, fungal |

### Rice
| Condition | Score | Pest implied |
|---|---|---|
| RH>80%, 24≤T≤32, rain7d>28 | +0.55 | BPH, Blast |
| RH>70%, 26≤T≤34 | +0.25 | Leaf Folder |
| rain14d>60, RH>85% | +0.18 | Sheath blight |

*(Full rules in `ml/data/feature_engineering.py: _compute_risk_score()`)*

**Label thresholds:**
- score ≥ 0.60 → High (2)
- score ≥ 0.30 → Medium (1)
- score < 0.30 → Low (0)

---

## XGBoost Model Configuration

```python
XGBClassifier(
    n_estimators=400,
    max_depth=7,
    learning_rate=0.06,
    subsample=0.80,
    colsample_bytree=0.80,
    min_child_weight=5,
    gamma=0.1,
    reg_alpha=0.1,
    reg_lambda=1.5,
    objective="multi:softprob",
    num_class=3,
    early_stopping_rounds=40,
)
```

**Train/test split:** Time-aware — last 10% of chronologically sorted data as test.
This prevents future leakage (no random shuffle across time).

**Expected performance:**

| Metric | Target |
|---|---|
| Accuracy | ≥ 0.82 |
| Weighted F1 | ≥ 0.80 |
| AUC-ROC (OvR) | ≥ 0.87 |
| 5-fold CV F1 (50k sample) | ≥ 0.78 |

---

## SHAP Explainability

Each prediction includes SHAP values for the top 12 features (High Risk class).

```
Prediction = base_value
           + SHAP(rh2m_rolling_7d)        # +0.142
           + SHAP(consecutive_dry_days)    # +0.098
           + SHAP(t2m)                     # +0.087
           + SHAP(rain_rolling_7d)         # +0.065
           + SHAP(soil_oc)                 # +0.041
           + ...
```

**Human-readable interpretation** is auto-generated:
> *"Risk driven by: 7-day Avg Humidity, Dry Spell, Heat Index.
>  Mitigated by: Low Solar Radiation."*

---

## Live Inference Flow

```
1. fetch_latest_weather(lat, lon, days_back=35)
   → DataFrame of 35 daily rows

2. engineer_features(df)
   → All 52 features computed on the time series

3. df.iloc[-1]  → today's feature row

4. merge soil + crop/zone one-hot

5. scaler.transform(X)

6. model.predict_proba(X)
   → risk_score = P(Medium)*0.5 + P(High)*1.0

7. shap_explainer.shap_values(X)
   → top 12 features by |SHAP value|
```

**Latency:** ~2–5s (dominated by NASA POWER API call)
**Inference time:** <10ms
