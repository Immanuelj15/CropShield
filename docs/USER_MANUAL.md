# AgriGuard AI — Operational User Manual & Advisory Guide

**System**: AgriGuard AI — Explainable AI Based Pest & Crop Disease Early Warning System  
**Target Audience**: Farmers, Agricultural Extension Officers, Agronomists, Research Scientists  

---

## 1. System Overview

AgriGuard AI is an intelligent agricultural decision-support platform designed to protect crops in Tamil Nadu and across India from unexpected pest infestations and plant diseases. The system fuses 45 years of satellite climate reanalysis (NASA POWER), real-time microclimate observations (Open-Meteo), PyTorch leaf pathology vision models, and Shapley counterfactual explanations to answer three primary operational questions:
1. **Is there a pest or disease threat on my farm TODAY?**
2. **What specific pathogen or pest is causing the symptom, and how severe is it?**
3. **What precise physical interventions (organic, chemical, irrigation shift) will drop the risk score to safe levels?**

---

## 2. Key Modules & Step-by-Step Instructions

### Module 1: Today's Pest Early Warning (`/`)
- **Step 1**: Select your local location from the dropdown menu (e.g., Kovilpatti, Thanjavur, Coimbatore, Madurai) or choose *Custom* and enter your latitude & longitude coordinates.
- **Step 2**: Select your active crop species (Cotton, Rice/Paddy, Sugarcane, Millets, Sorghum, Pulses, Tomato).
- **Step 3**: Click **Get Today's Warning**.
- **Interpretation**: 
  - **Risk Score & Gauge**: Green (Low, <0.35), Yellow (Medium, 0.35–0.64), Red (High, ≥0.65).
  - **SHAP Explanation**: Look at the *Why this warning?* section to see which microclimate factors (e.g., 7-day humidity, dry spell length, VPD) are elevating risk.

### Module 2: Leaf Disease Vision Scanner (`/detect`)
- **Step 1**: Take a clear, well-lit photograph of the infected crop leaf using your smartphone.
- **Step 2**: Select your crop type and click **Run Pathology Diagnosis**.
- **Interpretation**:
  - **Pathogen Name**: Identified fungal, bacterial, or viral pathogen (e.g., Paddy Bacterial Blight).
  - **Continuous Severity %**: Percentage of total leaf area occupied by lesions.
  - **Organic & Chemical Solution**: Specific formulations (e.g., Streptocycline + Copper Oxychloride) and NPK fertilizer adjustments.

### Module 3: Crop Yield Forecasting (`/yield`)
- **Step 1**: Adjust sliders for average temperature, annual rainfall, soil Nitrogen, pH, and select your irrigation system (Drip, Sprinkler, Flood).
- **Step 2**: Click **Forecast Crop Yield**.
- **Interpretation**: Displays expected yield in **tons/hectare** and **kg/acre**, alongside a percentage breakdown of limiting factors.

### Module 4: Geospatial Outbreak Map (`/outbreak`)
- **Step 1**: View the interactive map rendering spatial risk heatmaps across Tamil Nadu.
- **Step 2**: Click on any district hub (e.g., Aduthurai, Kovilpatti, Hosur) to inspect proximity-weighted risk transmission scores within a 50 km radius.

### Module 5: Regional Voice Assistant ("வேளாண் வழிகாட்டி")
- **Step 1**: Click the **வேளாண் வழிகாட்டி** button in the header bar.
- **Step 2**: Type or speak your question in **Tamil** or **English**.
- **Step 3**: Click **Listen Audio** for text-to-speech voice playback in regional dialect.

---

## 3. Recommended Agricultural Action Workflows

| Risk Level | Recommended Field Action | Recommended Spray Window |
|---|---|---|
| **Low Risk (<0.35)** | Continue standard field monitoring every 3 days. Maintain recommended NPK schedule. | No chemical spray required. |
| **Medium Risk (0.35–0.64)** | Scout field within 24 hours. Install 10 Yellow Sticky Traps/acre. Prepare organic spray. | Morning window: 6:00 AM – 9:00 AM (Wind < 3 m/s). |
| **High Risk (≥0.65)** | Immediate field intervention required. Apply targeted chemical pesticide + neem cake soil amendment. | Spray between 6:00 AM – 8:30 AM before temperature exceeds 32°C. |
