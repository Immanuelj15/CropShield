# CropShield: training data provenance and labeling

_Last regenerated 2026-09-30 with `python -m ml.data.collect_nasa_historical --start 2005 --end 2024` and `python -m ml.training.train_model`._

## 1. Weather inputs: real NASA POWER data

| Item | Value |
|---|---|
| Source | NASA POWER Daily API, point endpoint `https://power.larc.nasa.gov/api/temporal/daily/point` (API v2.10.0; sources SYN1DEG, MERRA2, POWER) |
| Docs | https://power.larc.nasa.gov/docs/services/api/temporal/daily/ , https://power.larc.nasa.gov/parameters/ |
| Community | `AG`. Units were checked in the API's own `parameters` block: T2M/T2M_MAX/T2M_MIN °C, RH2M %, WS2M m/s, PRECTOTCORR mm/day, ALLSKY_SFC_SW_DWN and TOA_SW_DWN **MJ/m²/day**. With community=RE the same request returns kW-hr/m²/day, so communities must not be mixed. The live `backend/services/weather_service.py` also uses `AG`, so training and inference units are identical. |
| Time standard | LST (API default, reported in `header.time_standard`) |
| Missing values | The API's `header.fill_value` is −999. The collector stores it as empty/NaN. The 2005-2024 pull had **0** fill values for every parameter and location (see `nasa_power_raw/*.meta.json`). |
| Window | 2005-01-01 → 2024-12-31. One request per location per year, with a 1 s pause and retries. |
| Rows | 10 locations × 7,305 days = **73,050** raw daily rows (`ml/data/nasa_power_raw/<location>.csv`, plus a `.meta.json` with units, grid point and download time) |

Locations (district-HQ town centres, WGS84). These replace the wrong coordinates in the old synthetic CSVs:

| Location | Lat | Lon | App zone |
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
| Nilgiris (Udhagamandalam) | 11.4102 | 76.6950 | Humid |

NASA POWER is a gridded reanalysis/satellite product (~0.5° × 0.625° for MERRA-2 meteorology). It is **not** a station record, and point values represent a grid-cell average.

## 2. Features: one pipeline for training and inference

`ml/data/feature_engineering.py` → `build_feature_frame(weather_df, crop)` = `clean_weather` → `engineer_features` → `add_crop_one_hot` (int 0/1).
Training (`build_training_matrix`) and live inference (`build_live_feature_row`, called by `inference_service`) use this same code. The model's 46 input columns are `MODEL_FEATURES`, which is written verbatim to `feature_names.json`. Every feature looks back at most 30 days, and the dry/wet spell counters are capped at 30. This makes the last row of the ~36-day live window numerically identical to the same day computed on the full 20-year series (verified by the smoke test to about 1e-13).

The model does **not** use soil, climate zone, or lat/lon. The labels do not depend on them, and with only 10 sites those columns would just act as site identifiers.

Heat index uses the NWS formulation (https://www.wpc.ncep.noaa.gov/html/heatindex_equation.shtml). VPD uses FAO-56 eq. 11. ET0 (informational only, not a model input) uses Hargreaves, FAO-56 eq. 52, with Ra = NASA `TOA_SW_DWN`.

## 3. Labels: rule-derived weather-suitability index, **not observed outbreaks**

No public dataset gives day-level observed pest outbreaks for Tamil Nadu locations. The labels are therefore a documented **weather-suitability index**, and the model learns to reproduce it smoothly. A high test score means the model agrees with the rules. It does **not** mean the model can predict real outbreaks.

**Single source of truth:** thresholds come from `backend/services/pest_service.PEST_DATABASE`, the same table used by the app's rule-based pest detection. `ml/data/pest_labels.py` reproduces the weather rules of `pest_service.detect_pests` exactly. The smoke test checks equality. The soil-pH rule (+0.05) is left out because it is not weather.

```
pest score = 0.30·[T2M in temp range] + 0.25·[RH2M in RH range]
           + 0.20·[7-day rain ≤ max]   + 0.20·[7-day rain ≥ min]
           + 0.15·[consecutive dry days (<1 mm) ≥ threshold]
crop index = max over that crop's pests
label      = Low (< 0.35) | Medium (0.35–0.65) | High (≥ 0.65)   # = detect_pests Suspected/Confirmed cut-offs
```

If `PEST_DATABASE` changes, re-run `python -m ml.training.train_model`.

### Thresholds and literature check

The literature mostly reports **correlations** between pest counts and weather: max/min temperature and morning/evening RH, usually as weekly means. It does not report crisp daily thresholds. The app uses **daily mean** T2M and RH2M. Daily-mean RH is typically 10–25 points below morning RH, so RH ranges quoted from the literature are not directly comparable. The table records whether the *direction* of each rule is supported.

| Crop | Pest | pest_service rule (T °C / RH % / 7-d rain mm / dry days) | Literature | Verdict |
|---|---|---|---|---|
| Cotton | American bollworm *H. armigera* | 25–38 / 40–75 / ≤20 / ≥5 | Max temperature and rainfall correlate negatively with incidence on cotton. The post-monsoon, flowering–boll stage is most favourable (Indian J. Agric. Sci., https://epubs.icar.org.in/index.php/IJAgS/article/download/95354/38266/245783 ; J. Biol. Control https://informaticsjournals.com/index.php/jbc/article/view/3565) | Rain rule supported. An upper temperature bound of 38 °C is lenient. |
| Cotton | Whitefly *B. tabaci* | 26–40 / 30–65 / ≤10 / ≥7 | Rainfall suppresses populations. Temperature and RH correlations are mixed across studies (https://indianentomology.org/index.php/ije/article/download/2605/1564/10359 ; https://krishikosh.egranth.ac.in/items/5b3486c4-3ccf-40e9-b58f-6d0cf9fd3059) | Dry/rain rule supported. Temperature and RH are uncertain. |
| Cotton | Thrips *T. tabaci* | 28–42 / 25–60 / ≤8 / ≥6 | Positive with temperature (r≈0.77–0.79), negative with RH (r≈−0.71) on cotton (https://indianentomology.org/index.php/ije/article/download/1736/1237/7566 ; https://real.mtak.hu/52141/) | Supported (hot, dry) |
| Cotton | Aphid *A. gossypii* | 20–30 / 60–90 / ≥10 / – | Not verified against a specific source | **Unverified.** It dominates cotton labels (52 % of days). Needs review. |
| Rice | Brown planthopper *N. lugens* | 24–32 / 80–100 / ≥30 / – | Population growth is maximal at 28–30 °C and nymph development is optimal at 25–30 °C. Peaks occur at high RH (~78 %) (https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7794346/ ; https://en.wikipedia.org/wiki/Brown_planthopper) | Temperature and RH supported. The rain requirement is an operational choice. |
| Rice | Leaf folder *C. medinalis* | 26–34 / 75–95 / ≥25 / – | Development is fastest at 26–35 °C and RH ~85 % (lab). One field study found RH and rain had a negative effect (https://phytojournal.com/archives/2019/vol8issue5/PartN/8-5-125-864.pdf ; https://krishikosh.egranth.ac.in/handle/1/5810202447) | Temperature supported. RH and rain are mixed. |
| Rice | Blast *P. oryzae* | 22–28 / 85–100 / ≥40 / – | High RH (93–99 %), night temperatures of 17–23 °C, 24–28 °C with frequent showers, and long leaf wetness (https://apps.lucidcentral.org/ppp_v9/pdf/web_full/rice_blast_252.pdf ; CGIAR Crop Genebank rice fungi guidelines) | Supported. The daily-mean RH ≥85 is lenient compared with 93–99 %. |
| Sorghum | Stem borer *C. partellus* | 25–35 / 50–85 / ≥15 / – | Not verified against a specific source | Unverified |
| Sorghum | Shoot fly *A. soccata* | 22–30 / 65–95 / ≥20 / – | Mixed. Egg laying correlates negatively with min RH and rain in one study, and adults correlate positively with evening RH and rain in another (https://oar.icrisat.org/649/1/60605.pdf ; https://indianentomology.org/index.php/ije/article/download/113/319/1550) | Mixed |
| Sorghum | Aphid *M. sacchari* | 18–28 / 60–90 / ≥5 / – | Not verified | Unverified |
| Millets | Earhead bug *C. angustatus* | 26–36 / 55–85 / ≤25 / ≥3 | Not verified | Unverified. It dominates millet labels (94 %). |
| Millets | Blister beetle *M. pustulata* | 28–38 / 40–70 / ≤15 / ≥4 | Not verified | Unverified |
| Sugarcane | Early shoot borer *C. infuscatellus* | 25–36 / 50–80 / ≤20 / ≥4 | Peaks in hot, dry summer (May). Correlates negatively with min RH. Peak incidence was recorded at 43 °C max and 21–57 % RH (https://sugarcane.icar.gov.in/wp-content/uploads/2023/05/pp94-99.pdf ; https://epubs.icar.org.in/index.php/JSR/article/view/101796) | Dry rule supported. A lower RH bound of 50 % is probably too high. |
| Sugarcane | Pyrilla *P. perpusilla* | 28–38 / 40–75 / ≤15 / ≥5 | Not verified | Unverified |
| Pulses | Pod borer *H. armigera* | 24–36 / 45–75 / ≤18 / ≥4 | Rainfall correlates negatively (r≈−0.42) and morning RH positively on soybean. Temperature correlates negatively on chickpea (https://epubs.icar.org.in/index.php/IJAgS/article/download/95354/38266/245783) | Rain rule supported. Temperature is mixed. |
| Pulses | Aphid *A. craccivora* | 18–28 / 65–90 / ≥10 / – | Not verified | Unverified |
| Pulses | Whitefly *B. tabaci* | 26–40 / 30–65 / ≤8 / ≥6 | As for cotton whitefly | Rain rule supported |

TNAU Agritech cotton pest pages (https://agritech.tnau.ac.in/crop_protection/crop_prot_crop_insectpest%20_cotton.html) give economic threshold levels (for example, *H. armigera*: 1 egg or larva per plant; whitefly: 5–10 per leaf) but **no weather thresholds**. They could not be used to set the ranges above.

### Resulting label distribution (2005–2024, all locations)

| Crop | Low % | Medium % | High % | Seasonal check |
|---|---|---|---|---|
| Rice | 57.9 | 25.5 | 16.6 | High peaks in Oct–Nov (43–46 % of days). This matches the NE-monsoon samba season, when BPH and blast are known problems in TN. |
| Cotton | 0.3 | 23.1 | 76.6 | ≥85 % High from Mar to Oct, which is **too permissive** |
| Pulses | 0.1 | 26.1 | 73.8 | Too permissive |
| Sorghum | 4.9 | 44.6 | 50.5 | Rises Jun–Nov |
| Millets | 20.8 | 35.2 | 44.0 | Peaks Mar–Apr |
| Sugarcane | 26.5 | 28.9 | 44.6 | Peaks Mar–Apr (hot, dry), which is consistent with early shoot borer |

### Known limitations (be explicit in reports and UI)
1. Labels describe weather suitability, not observed pest pressure. There is no crop calendar or crop stage, so a "High" day may fall when the crop is not in the field.
2. For cotton and pulses the rules are permissive: about 75 % of all days are High. Several ranges are unverified (see the table). Tightening `PEST_DATABASE` is a domain-expert task, and the model must be retrained afterwards.
3. The model reproduces a deterministic function of four inputs (T2M, RH2M, 7-day rain, dry spell) and the crop. Test accuracy is therefore about 99.7 %. That figure is agreement with the rules, not outbreak-prediction skill.
4. Daily-mean NASA RH is lower than the morning RH used in most studies.

## 4. Wadhwani AI bollworm data: why it is not used for labels

`ml/data/wadhwani_bollworm/` (Wadhwani AI Pest Management Open Data, https://github.com/WadhwaniAI/pest-management-opendata , CC-BY-4.0) contains per-image bounding boxes. The local metadata files have only `url, split, label, geometry`. The geometry is a box polygon in *image-pixel* coordinates. `pest_counts_per_observation.csv` has only the image URL and bollworm counts. There is **no capture date, trap location, district or GPS**, so trap counts cannot be joined to weather and cannot validate or calibrate the cotton labels. The `risk_level` column in that CSV comes from a count threshold, not from weather. If Wadhwani AI releases date and location metadata (contact: agri-ai@wadhwaniai.org), this should be revisited.

## 5. Model, split and metrics

The split is by calendar year, so there is no temporal leakage:

| Split | Years | Rows |
|---|---|---|
| Train | 2005–2016 | 261,180 |
| Early-stop | 2017–2018 | 43,800 |
| Calibration | 2019–2021 | 65,760 |
| Test | 2022–2024 | 65,760 |

The base XGBoost model is refit on 2005–2018. The Platt calibrator is fitted only on 2019–2021, which the base model never saw. Seed 42. Full numbers are in `ml/training/saved_models/metrics.json` and `calibration_report.json`.

| | Before (v3.0.0-multicrop, as deployed) | After (v4.0.0-nasa-power-rules) |
|---|---|---|
| Training data | Synthetic CSV (wrong coordinates, fake weather) | Real NASA POWER, 10 sites, 2005–2018 |
| Live inputs with real values | 4 of 33 (others zero-filled), no crop input | 46 of 46, including crop one-hot |
| Accuracy vs rule labels, test 2022–2024 | 0.177 (predicts Low every day) | 0.9966 (macro-F1 0.9964) |
| Majority-class baseline | – | 0.518 |
| High-class ECE / Brier (test) | reported 0.0053 on its own synthetic split | raw 0.0012 / 0.0016 → Platt 0.0007 / 0.0016 |

## 6. Soil and yield data

`legacy_synthetic/agriguard_soil_yield_dataset_10000rows.csv` is **synthetic**. Each location has exactly one soil type, and yield is a per-crop normal distribution that is statistically independent of pH, OC and N (|r| < 0.02). Its soil ranges are individually plausible against the Tamil Nadu soil-test ratings used by the TN Agriculture Dept "Mann Valam" soil health dashboard (https://tnagrisnet.tn.gov.in/mannvalam/): OC low <0.5 / medium 0.5–0.75 / high >0.75 %; N low <280 / medium 280–445 kg/ha (113–180 kg/ac); P low <11 / medium 11–22 kg/ha; K low <118 / medium 118–280 kg/ha. Its data values are pH 4.6–8.5 (mean 6.8), OC 0.1–1.33 (mean 0.55), N 80–450 (mean 240), P 3–41 (mean 18) and K 50–494 (mean 220). Plausible ranges do not make it real data, though. It is moved to `legacy_synthetic/` and not regenerated, because regenerated data would still be synthetic. The RandomForest yield model trained on it (`ml/yield_prediction/train_yield_model.py`) is **not used at runtime**. Its R² of 0.99 only reflects crop identity.

The runtime yield estimate (`ml/yield_prediction/yield_model.py`) now uses **official Tamil Nadu 2022-23 state-average yields** from the DES Statistical Hand Book of Tamil Nadu 2022-23, Table 4.3 (https://www.des.tn.gov.in/sites/default/files/2025-07/4.%20AGRICULTURE.pdf):

| Crop | Official figure | Base yield used |
|---|---|---|
| Paddy | 3,500 kg/ha as rice | 5.25 t/ha paddy (×3/2) |
| Cotton | 313 kg lint/ha | 0.92 t/ha kapas at ~34 % ginning out-turn |
| Sugarcane | 111 t/ha | 111 t/ha |
| Maize | 7.007 t/ha | 7.0 |
| Groundnut | 2.598 t/ha | 2.6 |
| Cholam (sorghum) | 0.813 t/ha | 0.81 |
| Millets (Cumbu + Ragi + small millets, area-weighted) | 2.545 t/ha | 2.55 |
| Total pulses | 0.636 t/ha | 0.64 |
| Tomato | 19.19 t/ha | 19.19 |
| Tapioca | 37.55 t/ha | 37.55 |

The old constants were uncited (sugarcane 75, pulses 1.5 and cotton 2.2 t/ha). With default inputs they were also inflated about 1.75× by the adjustment factors. The factors are still uncalibrated heuristics. They are now normalised so that typical TN conditions return exactly the official average, and the result is flagged `is_heuristic: true` with `confidence_score: null`.
