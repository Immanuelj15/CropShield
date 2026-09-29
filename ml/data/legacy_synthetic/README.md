# Legacy synthetic datasets — DO NOT use for training

These three CSVs were previously presented as real data. An audit (2026-09) showed they are **synthetic**:

| File | Evidence |
|---|---|
| `agriguard_multicrop_dataset_10000rows.csv` | Every location has wrong coordinates (e.g. "thanjavur" at 12.457 N, 77.296 E; real Thanjavur is 10.787 N, 79.138 E; "coimbatore" at 8.72 N, 78.25 E; real is 11.017 N, 76.956 E). Compared with real NASA POWER data for the same place and date, daily rainfall correlation is about 0 (Thanjavur 0.04, Kovilpatti -0.02, Coimbatore 0.13), and T2M MAE is 2-3.7 °C. The `risk_level` labels come from an undocumented rule. |
| `agriguard_demo_dataset_10000rows.csv` | Same generator as above (same wrong coordinates), without crop columns. |
| `agriguard_soil_yield_dataset_10000rows.csv` | Each location has exactly one soil type. Yield is a per-crop normal distribution that is statistically independent of every soil variable (\|r\| < 0.02 for pH, OC and N). Sugarcane averages 68 t/ha, while the official TN 2022-23 figure is 111 t/ha (DES Statistical Hand Book, Table 4.3). |

The pest-risk model is now trained on real NASA POWER data (`ml/data/nasa_power_raw/`). See
`ml/data/LABELING.md`. The files are kept only so that old results can be reproduced. No runtime code reads them.
