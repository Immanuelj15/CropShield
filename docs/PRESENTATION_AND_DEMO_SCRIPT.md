# AgriGuard AI — Presentation Slides & Video Demo Script

---

## Part 1: Presentation PowerPoint (PPT) Slide Layout

### Slide 1: Title & Introduction
- **Title**: AgriGuard AI: Explainable AI Based Pest & Crop Disease Early Warning System for Indian Farmers
- **Subtitle**: Multi-Modal Fusion of 45-Year Climate Reanalysis, PyTorch Vision Pathology, and Spatiotemporal Outbreak Intelligence
- **Presenter**: AgriGuard AI Engineering Team

### Slide 2: Agricultural Problem in Tropical India
- 30%+ annual crop yield loss due to sudden pest outbreaks and fungal/bacterial leaf pathogens in South India.
- Delayed diagnosis, over-use of toxic chemical pesticides, and lack of microclimate-aware advisories.
- Language and technical barriers for non-English smallholder farmers in rural Tamil Nadu.

### Slide 3: Systematic Literature Survey (50 Papers Benchmark)
- Analyzed 50 peer-reviewed papers (IEEE, Springer, MDPI, ICAR, FAO, TNAU).
- Key Research Gap identified: Isolation of visual disease scanning from microclimate weather warning and black-box AI opacity.

### Slide 4: System Architecture & Technical Innovation
- **Data Pipeline**: Merges NASA POWER 1980–2025 climate reanalysis with Open-Meteo real-time 1km gridded forecasts.
- **Dual AI Engine**: XGBoost Climate Pest Classifier + PyTorch MobileNetV3 Leaf Disease Scanner.
- **Explainable AI (XAI)**: Tree-SHAP matrix attributions coupled with domain-constrained Counterfactual optimization.
- **Geospatial Clustering**: Haversine distance-decay risk propagation heatmaps across Tamil Nadu districts and villages.

### Slide 5: Patent Claims & Intellectual Property Highlights
- Complete Patent Specification filed under Indian Patent Act (Section 10).
- 15 Independent and Dependent Claims covering Vapor Pressure Deficit calculation, continuous lesion percentage severity, and counterfactual interventions.

### Slide 6: Field Usability & Regional Voice Assistant ("வேளாண் வழிகாட்டி")
- Tamil and English Voice Assistant interface with instant regional speech synthesis.
- Actionable decision support: Organic vs Chemical treatments, NPK adjustment, and safe morning spraying time windows.

---

## Part 2: Official Demo Video Script (3-Minute Narrative)

**[Scene 1: Introduction — 0:00 to 0:30]**  
*Visual*: High-resolution satellite view of Tamil Nadu agricultural fields, transitioning to the AgriGuard AI Dashboard UI.  
*Voiceover (Narrator)*: "Welcome to AgriGuard AI—the world's first explainable AI pest and crop disease early warning system engineered specifically for Indian farmers. Every year, unexpected pest outbreaks destroy millions of acres of cotton, rice, and vegetable crops across South India. AgriGuard AI solves this by predicting threats before they strike."

**[Scene 2: Today's Pest Early Warning — 0:30 to 1:15]**  
*Visual*: Cursor selects Kovilpatti location and Cotton crop on the Today's Warning page. Risk Gauge moves to HIGH (0.73).  
*Voiceover*: "On the Today's Warning dashboard, AgriGuard AI ingests 45 years of NASA POWER climate data and real-time microclimate observations. It calculates 63 engineered features—including Vapor Pressure Deficit, 7-day relative humidity trends, and dry spell duration. Notice how the SHAP explainability panel explicitly tells the farmer *why* the risk is High—driven by consecutive dry days and elevated humidity."

**[Scene 3: Leaf Disease Scanner & Pathology XAI — 1:15 to 2:00]**  
*Visual*: User uploads a leaf image on the Leaf Disease Scanner page. PyTorch model outputs Paddy Bacterial Blight, 24.5% severity.  
*Voiceover*: "Next, when a farmer notices leaf lesions, our PyTorch computer vision engine scans the leaf photo, classifies the exact bacterial or fungal pathogen, and calculates continuous percentage severity. Instantly, AgriGuard AI prescribes organic solutions like Neem oil alongside exact chemical formulations and soil NPK adjustments."

**[Scene 4: Counterfactual Risk Reduction & Outbreak Map — 2:00 to 2:30]**  
*Visual*: Screen showcases the Counterfactual Advisory card and transitions to the Leaflet Outbreak Map rendering Tamil Nadu district risk pins.  
*Voiceover*: "AgriGuard AI goes beyond simple diagnosis: our domain-constrained counterfactual engine outputs actionable steps to lower risk—such as adjusting irrigation timing by 48 hours. Meanwhile, our Haversine spatial clustering map tracks disease propagation across neighboring agricultural villages in real-time."

**[Scene 5: Tamil Voice Assistant & Conclusion — 2:30 to 3:00]**  
*Visual*: User clicks the Tamil Voice Assistant button. Speech audio plays: 'வணக்கம்! நான் வேளாண் வழிகாட்டி...'.  
*Voiceover*: "To ensure accessibility for every smallholder farmer, our Tamil voice assistant—வேளாண் வழிகாட்டி—provides natural language voice advisories in regional dialects. AgriGuard AI: Protecting crops, empowering farmers, and securing food production through Explainable Artificial Intelligence."
