# FORM 2 — THE PATENTS ACT, 1970 & THE PATENT RULES, 2003
## COMPLETE SPECIFICATION (Section 10; Rule 13)

### TITLE OF THE INVENTION
**SYSTEM AND METHOD FOR LOCATION-BASED MULTI-MODEL EXPLAINABLE ARTIFICIAL INTELLIGENCE DRIVEN CROP DISEASE EARLY WARNING AND SPATIOTEMPORAL PEST OUTBREAK PREDICTION**

---

### APPLICANT(S)
- **Name**: AgriGuard AI Technologies / Indian AgTech Innovation Labs
- **Nationality**: Indian
- **Address**: Chennai / Coimbatore, Tamil Nadu, India

---

## 1. ABSTRACT OF THE INVENTION

The present invention relates to an intelligent, location-based, explainable artificial intelligence (XAI) agricultural platform and spatiotemporal early warning method for crop disease diagnosis and pest outbreak prediction in tropical and subtropical agro-climatic zones without requiring image capture. The system comprises: (a) an automated geocoding engine mapping farmer administrative input (State, District, Taluk, Village) to precise spatial coordinates; (b) a climate-driven feature engineering pipeline fetching 45 years of historical reanalysis climate data (NASA POWER 1980–2025) and live satellite weather micro-observations (Open-Meteo) to generate 12+ engineered indicators including Vapor Pressure Deficit (VPD), Growing Degree Days (GDD), Heat Index, and consecutive dry/wet spells; (c) a multi-model machine learning ensemble engine comparing XGBoost, LightGBM, CatBoost, and Random Forest regressors/classifiers to output pest and disease outbreak probabilities; (d) an Explainable AI (XAI) engine generating Tree-SHAP feature attribution matrices alongside domain-constrained counterfactual optimization vectors; (e) a spatiotemporal Haversine distance decay clustering engine for district and village-level risk propagation heatmaps; and (f) a smart recommendation engine delivering context-aware organic/chemical advisories, meteorologically optimized spraying window schedules, and multi-channel alert dispatches (SMS, WhatsApp, Push Notifications).

---

## 2. PATENT CLAIMS (15 CLAIMS)

### WE CLAIM:

1. **A computer-implemented system for location-based crop disease diagnosis and spatiotemporal pest outbreak prediction**, the system comprising:
   - an automated geocoding engine configured to resolve administrative inputs including State, District, Taluk, and Village into latitude and longitude coordinates;
   - a data ingestion pipeline configured to retrieve historical reanalysis climate data (1980–2025) and real-time weather observations for the target geographic coordinate;
   - a feature engineering module configured to generate rolling microclimate metrics, Vapor Pressure Deficit (VPD) values, Heat Index, consecutive dry days, crop growth stage, and soil fertility indices;
   - a multi-model machine learning ensemble engine comparing XGBoost, LightGBM, CatBoost, and Random Forest algorithms to output pest probability and disease probability scores;
   - an Explainable AI (XAI) engine configured to compute Tree-SHAP feature attributions explaining specific microclimate risk drivers; and
   - a geospatial spatial clustering engine configured to calculate spatiotemporal outbreak risk propagation heatmaps across neighboring administrative boundaries.

2. **The system as claimed in claim 1**, wherein said system operates strictly via location, microclimate, and crop parameters without requiring leaf image upload.

3. **The system as claimed in claim 1**, wherein said feature engineering module calculates Vapor Pressure Deficit (VPD) using Tetens saturation vapor pressure formulations as a key biophysical indicator for spore germination.

4. **The system as claimed in claim 1**, wherein said Explainable AI engine calculates domain-constrained counterfactual intervention vectors specifying minimum physical microclimate modifications required to drop a high risk score below a safe threshold.

5. **The system as claimed in claim 1**, further comprising a smart recommendation engine configured to generate context-aware organic treatments, chemical pesticide dosages, NPK fertilizer ratios, and meteorologically optimized spraying time windows based on wind velocity and precipitation forecast.

6. **The system as claimed in claim 1**, further comprising a multi-channel alert dispatcher configured to transmit emergency notifications via SMS, WhatsApp, and Push Notifications when disease or pest risk breaches a predefined safety threshold.
