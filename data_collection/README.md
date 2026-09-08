# AgriGuard / CropShield — Open-Source Datasets & Data Provenance

This document details all open-source and field-collected datasets utilized within AgriGuard / CropShield for model training, validation, and explainability.

---

## 1. Wadhwani AI Pest Management Open Data (Bollworm Dataset)
- **Source**: [https://github.com/WadhwaniAI/pest-management-opendata](https://github.com/WadhwaniAI/pest-management-opendata)
- **Paper Citation**: arXiv:2304.00763 — *"Pest Management Open Data: Trap Images and Pest Annotations"*
- **License**: Creative Commons Attribution 4.0 International (CC-BY 4.0) for data; Apache 2.0 for code.
- **Description**: 5 years of pheromone trap photos and pest annotations across cotton-growing districts in India, collected via the CottonAce mobile app.
- **Annotations**: 599,391 real bounding-box pest detections across 19,536 trap images.
- **Key Species**:
  - `pbw`: Pink Bollworm (*Pectinophora gossypiella*) — 558,963 instances
  - `abw`: American Bollworm (*Helicoverpa armigera*) — 16,976 instances
- **Agronomic Calibration**: Aligned with ICAR / TNAU Economic Threshold Levels (ETL):
  - **High Risk**: $\ge 8$ Pink Bollworm or $\ge 5$ American Bollworm or $\ge 10$ total bollworms
  - **Medium Risk**: $\ge 3$ Pink Bollworm or $\ge 2$ American Bollworm or $\ge 3$ total bollworms
  - **Low Risk**: $< 3$ bollworms
- **Ingestion Script**: `data_collection/collect_wadhwani_bollworm.py`

---

## 2. NASA POWER Agroclimatology Reanalysis Data
- **Source**: NASA Prediction Of Worldwide Energy Resources (POWER) API (`power.larc.nasa.gov`)
- **License**: Public Domain (NASA Open Data Policy)
- **Parameters Ingested**:
  - `T2M`: Temperature at 2 Meters (°C)
  - `T2M_MAX` / `T2M_MIN`: Maximum / Minimum Daily Temperature (°C)
  - `RH2M`: Relative Humidity at 2 Meters (%)
  - `WS2M`: Wind Speed at 2 Meters (m/s)
  - `PRECTOTCORR`: Precipitation Corrected (mm/day)
  - `ALLSKY_SFC_SW_DWN`: All Sky Surface Shortwave Downward Irradiance ($MJ/m^2/day$)
- **Feature Engineering**: 3-day, 7-day, 14-day, and 30-day rolling averages, dry spell tracking, temperature/humidity trend slopes, vapor pressure deficit (VPD), and heat index.

---

## 3. AgriGuard Multi-Crop 10,000-Row Climate & Pest Risk Dataset
- **File**: `ml/data/agriguard_multicrop_dataset_10000rows.csv`
- **Samples**: 10,000 observations across 6 major Indian agricultural crops:
  - Cotton (1,670 rows)
  - Rice (1,666 rows)
  - Millets (1,666 rows)
  - Pulses (1,666 rows)
  - Sorghum (1,666 rows)
  - Sugarcane (1,666 rows)
- **Features**: 37 engineered climate and cyclical features mapped to pest risk ground truth.

---

## 4. AgriGuard Soil & Crop Yield 10,000-Row Dataset
- **File**: `ml/data/agriguard_soil_yield_dataset_10000rows.csv`
- **Samples**: 10,000 regional soil profile observations across Tamil Nadu agro-climatic zones.
- **Parameters**:
  - Soil pH (`soil_ph`)
  - Electrical Conductivity (`soil_ec_dS_m`)
  - Soil Organic Carbon (`organic_carbon_pct`)
  - Available Nitrogen (`available_nitrogen_kg_ha`)
  - Available Phosphorus (`available_phosphorus_kg_ha`)
  - Available Potassium (`available_potassium_kg_ha`)
  - Farm Area (`area_hectares`)
  - Real Yield (`yield_kg_per_hectare`) and total Production (`production_kg`)

---

## 5. PlantVillage Leaf Pathology Dataset
- **Source**: spMohanty / PlantVillage Dataset (CrowdAI / Penn State)
- **License**: CC0 1.0 Universal (Public Domain)
- **Description**: 54,306 images across 38 crop-pathogen pairs utilized for ResNet18 leaf disease image classification.
