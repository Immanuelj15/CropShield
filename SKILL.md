---
name: cropshield-browser-operator
description: Operate, test, demo and debug the CropShield / AgriGuard AI web app (React PWA on localhost:5173 backed by a FastAPI API on localhost:8000) from a browser. Use this skill when asked to log in as a farmer, agronomist or admin, run today's pest warning, do a leaf disease scan, draw-to-scan a region, generate soil-health, crop-recommendation or activity plans, verify threats, manage admin data, check translations, or diagnose why a page shows errors or empty data.
---

# CropShield / AgriGuard AI — Browser Operator Skill

This skill tells a browser-driving Claude (for example Claude in Chrome) how to use the CropShield web app correctly. It lists what each screen does, which buttons to press, what a correct result looks like, which backend call sits behind each action, and how to tell a real failure from the app's built-in demo fallbacks.
For code-level architecture, read `CLAUDE.md` at the repo root.

---

## 1. Ground rules

1. **Do not start, stop or restart servers** and do not run terminal commands. This skill is browser-only. If the app is not reachable, report it to the user and suggest they run `run_all.bat` (Windows) or `uvicorn backend.main:app --port 8000` together with `cd frontend && npm run dev`.
2. **Treat these as outward or destructive actions and ask the user before clicking them:**
   - Admin → *Model Retraining* → **Trigger Retraining Run**
   - Admin → *External API Health* → run ingestion now (`POST /admin/jobs/run-ingestion-now` processes every farm and can send notifications)
   - Admin → **Register GPS Farm Zone**, create or deactivate users, delete pest/disease entries, crop rules, cost templates, water Kc or nutrient rows
   - Admin → **Publish Multi-Language Advisory**
   - Regional scan → **Dispatch to Farmers** / broadcast advisory (creates alerts for every farm inside the drawn polygon)
   - Notification settings → **send test notification** (can send an SMS or WhatsApp message if Twilio is configured)
   - Activity planner → **run reminders now**
3. **Opening `/farmer/today` has side effects.** Every visit calls `POST /api/v1/predict-today` (login required, for the farmer's own farm). It upserts one warning log per farm per day. On High risk it alerts neighbouring farms within 5 km, but only once per farm per day and never when the weather is synthetic; on "Treat Now" it notifies the farm owner. The endpoint is rate-limited (30 calls / 5 min per user), so do not reload it in a loop.
4. Never type real personal data. Use the demo accounts below.
5. Report results faithfully. Many numbers come from **fallbacks** (see §8). Do not present them as real field measurements.

---

## 2. Endpoints and URLs

| What | URL |
|---|---|
| Web app (Vite dev server) | `http://localhost:5173` |
| Backend health | `http://localhost:8000/health` → `{"status":"healthy"}` |
| API docs (Swagger) | `http://localhost:8000/api/v1/docs` |
| Mongo admin UI (Docker, opt-in) | `http://127.0.0.1:8081`, only with `docker compose --profile tools up` and basic auth |

The frontend calls **relative** `/api/v1/...` and `/uploads/...` URLs, which Vite (dev) or nginx (Docker) proxies to `:8000`. There are no hard-coded backend URLs.

**Pre-flight check:** first open `http://localhost:8000/api/v1/health` (`/health` also works). If it does not return healthy, stop and tell the user. Then open `http://localhost:5173`.

---

## 3. Log in

Demo accounts (the login page pre-fills them when you click a role card). They exist only if the database was seeded with `python -m scripts.init_mongo_db` (Docker: `SEED_DEMO_DATA=true`):

| Role | Email | Password | Lands on |
|---|---|---|---|
| Farmer | `farmer@cropshield.org` | `farmer123` | `/farmer/today` |
| Agronomist | `agronomist@cropshield.org` | `agro123` | `/agronomist/dashboard` |
| Admin | `admin@cropshield.org` | `admin123` | `/admin/dashboard` |

Steps:
1. Go to `http://localhost:5173/login`.
2. Optional: pick a language from the language bar at the top (English, தமிழ், हिंदी, తెలుగు, മലയാളം).
3. Click the role card (Farmer, Agronomist or Admin). The email and password fill in automatically.
4. Click **Sign In**. A success message appears, and after about 0.5 s the app redirects to the role's home page.

Facts that matter:
- The session lives in **sessionStorage** (`cropshield_token`, `cropshield_user`). A new tab or window is **not** logged in. Stay in the same tab.
- When the token expires (24 h) or is rejected, any API call returns 401 and the app sends you to `/login?expired=1`. Log in again.
- Self-registration always creates a **farmer**. Agronomist and admin accounts are created by an admin.
- Login allows 10 failed attempts per 5 minutes per email and IP; after that it returns 429.
- In dev without `SECRET_KEY` set, the backend generates a random key at start, so every backend restart logs everyone out.
- To switch roles, click **Sign Out** (top right) and log in again. Each role only sees its own navigation items. An admin can open farmer and agronomist pages too.
- A "Invalid email or password" error on a demo account means Mongo was not seeded. Tell the user to run `python -m scripts.init_mongo_db`.
- A "network error" means the backend is down or the proxy failed.

---

## 4. Navigation map (top navbar per role)

- **Farmer:** Today's Warning `/farmer/today` · Soil Health `/farmer/soil-health` · Crop Advisor `/farmer/crop-recommendation` · Activity Planner `/farmer/activity-planner` · Draw-to-Scan `/regional-scan` · Yield Predictor `/yield` · Outbreak Map `/outbreak` · Field History `/history` · Alert Channels `/farmer/notifications`
- **Agronomist:** Threat Queue `/agronomist/dashboard` · AI Review Desk `/expert` · Satellite Scan `/regional-scan` · Outbreak Map `/outbreak` · Yield Impact `/yield`
- **Admin:** Admin Center `/admin/dashboard` · Agronomist Ops `/agronomist/dashboard` · Farmer View `/farmer/today` · Spatial Scan `/regional-scan` · Outbreak Map `/outbreak` · Delivery & PWA `/farmer/notifications`
- **Everywhere:** language selector, the green **குரல் AI** voice-assistant button (opens a modal), a floating chatbot bubble (bottom-right), and an offline banner that appears when `/api/v1/health` fails. The banner also lists queued offline actions and any that **failed** (with Retry / Discard).
- On narrow windows (<1024 px) the nav collapses into a hamburger menu (top right).
- Unknown routes redirect to `/`, which redirects to the role's home page.

---

## 5. Page-by-page operating guide

For each page: **what to do**, then **success looks like**, then **API behind it**.

### 5.1 Farmer: Today's Warning (`/farmer/today`)
Tabs across the top: **Today's Warning · Disease Photo Scan · Treatment Log · Digital Advisories · Regional Alerts · Prediction History**.

- **Today's Warning.** This tab loads automatically. Wait up to about 35 s, because the NASA POWER fetch can be slow; skeleton loaders show meanwhile.
  - Success: a risk gauge (Low/Medium/High plus a score from 0 to 1; boundaries are the admin's Alert Thresholds, default 35/65), a calibrated-confidence badge (High ≥0.80 / Moderate ≥0.55 / Low), the likely pests with management advice, the SHAP "Risk driven by …" drivers, a counterfactual prescription card (target humidity and steps), an economic impact card (₹ at stake, a Treat Now/Soon/Monitor/No Action recommendation), a vegetation (NDVI) card and a fused health score card.
  - A refresh button re-runs the prediction. Use it sparingly (see rule 3).
  - An "offline cached" badge means the prediction failed and the last result for **this user** is shown from a local cache.
  - An "Estimated weather" notice means NASA POWER was unreachable and synthetic weather was used (`data_quality.is_synthetic`); no neighbour alerts were sent.
  - A "Rule-based estimate (model unavailable)" note means the ML model could not run (`model_version` = `rules-fallback-v2`); the confidence badge is hidden.
  - A farmer with no registered farm sees an empty state, never another farmer's farm.
  - API: `GET /farms/me` → `POST /predict-today` (with `farm_id`) + `GET /vegetation/{farmId}`.
- **Disease Photo Scan.** Choose a leaf image (JPG/PNG ≤10 MB) with the file input, then start the scan.
  - Success: the disease name, pathogen, severity, confidence, top-3 alternatives, and organic and chemical treatment plus prevention.
  - Without trained weights (the current state), the page shows **"Disease model unavailable — result not reliable"** with no disease name, confidence or treatment (`model_available: false`). Report that; don't invent a diagnosis.
  - API: `POST /disease/detect` (login required; multipart `file`, `crop_hint`, `farm_id`). Offline, the photo is queued and sent when back online.
- **Treatment Log.** Open the add-treatment modal, fill the product, dose, date and so on, then click **Save to Farm Log**. The new row appears and the tab badge count increases. API: `POST /treatments`, `GET /treatments`.
- **Digital Advisories.** Read-only list of multi-language pest and disease advisories. API: `GET /advisories`.
- **Regional Alerts.** Community alerts about outbreaks within 5 km. API: `GET /alerts/me`.
- **Prediction History.** The farm's past warnings from Mongo. API: `GET /history/me`.
- **Support request.** Type a question, then **Submit Diagnostic Request**. It appears under the farmer's requests, and the agronomist sees it in *Farmer Support Management*. API: `POST /support/requests`.

### 5.2 Farmer: Soil Health Analyzer (`/farmer/soil-health`)
Sub-tabs: **Analyzer** and **Assessment History**.
1. Step 1: the farm's saved boundary is used if it exists; otherwise draw the farm boundary on the map (see §6). There is no demo-polygon fallback. Check the "Calculated Area".
2. Click **Confirm Boundary**.
3. Choose the declared soil classification (for example Black Clay Loam, Red Loam, Red Sandy Loam, Alluvial Clay, Coastal Alluvial, Lateritic Hill Soil) and the district if asked.
4. Click **Run Satellite & SoilGrids Analysis**. It calls the ISRIC SoilGrids API and can take 10–30 s.
5. Success: the soil report card shows the pH range, N/P/K and organic-carbon bands, clay/sand/silt, CEC, and per-property confidence bars with an overall confidence. If SoilGrids was unreachable, the source is labelled as an **estimate**; potassium is always a regional estimate.
6. Optional: **Upload Verified Lab Report** (PDF/image, max 10 MB, own farm only). After upload, the lab values override the estimate for this farm.
- APIs: `GET /farmer/farms`, `POST /soil-health/generate`, `GET /soil-health/{farmId}/history`, `POST /soil-health/{farmId}/upload-lab-report`.

### 5.3 Farmer: Crop Advisor (`/farmer/crop-recommendation`)
1. Optional: click a demo scenario chip to prefill the form.
2. Set the **Water Availability / Source** tier, the season, the budget (preset chips or the ×2 button), the land area, and soil/district if shown.
3. Submit the form (generate recommendations).
4. Success: ranked crop cards with a suitability score, reasons, yield/cost/revenue/profit **ranges** from the profit range engine, and weather and market risk levels.
- APIs: `GET /farmer/profile`, `GET /crop-recommendation/demo-scenarios?limit=8`, `POST /crop-recommendation/generate`.

### 5.4 Farmer: Activity Planner (`/farmer/activity-planner`)
1. If no plan exists, open the setup modal (farm, crop, sowing date) and click **Generate AI Season Plan**.
2. Success: season progress, the current growth stage, an irrigation card (ET0 × Kc, litres per acre), a fertilizer card (Urea/DAP/MOP kg), and a chronological timeline with a type filter (irrigation, fertilizer, pest check, harvest).
3. Mark an item done with its complete button. Its status turns to completed and stays completed (the reminder job no longer overwrites it). Switching farms clears the old plan while the new one loads.
- APIs: `GET /farms`, `GET|POST /activity-planner/...`, `GET /irrigation/{farmId}`, `GET /fertilizer/{farmId}`.

### 5.5 Draw-to-Scan / Satellite Scan (`/regional-scan`)
1. Jump to a preset region: Kovilpatti (Dryland), Thanjavur (Delta), Madurai (Irrigated), Coimbatore (Western) or Tirunelveli (Southern).
2. Draw a zone (see §6). Scanning starts when the rectangle is released, or when you click **Scan Zone** for a polygon.
3. Success: a result sheet with farms inside the polygon, the risk distribution, dominant threats and vegetation status. Map pins can be colour-toggled between pest risk and vegetation. If the scan fails, an error with **Retry** appears (there is no fabricated demo result any more).
4. Agronomist or admin only: **Dispatch to Farmers** broadcast. **Ask the user first** (rule 2).
- APIs: `POST /outbreak/scan-area` (HTTP 422 if more than 500 farms, so draw smaller), `POST /outbreak/scan-area/broadcast-advisory`.
- "No farms found" usually means the districts were not seeded. Suggest `python -m scripts.seed_districts`.

### 5.6 Outbreak Map (`/outbreak`)
Leaflet heatmap of hard-coded Tamil Nadu hotspots with distance-decay risk. Read-only. API: `GET /outbreak/heatmap`.

### 5.7 Yield Predictor (`/yield`)
Fill the crop, weather, soil NPK/pH/OC and irrigation inputs, then click the predict button. Success: tons/ha, kg/acre, and a factor breakdown. The model is formula-based, anchored to official Tamil Nadu average yields (DES 2022-23); "Model Confidence" shows **Not available**. A crop with no official yield returns 422. API: `POST /yield/predict` (login required).

### 5.8 Field History (`/history`) and Features (`/features`)
- `/history`: the legacy SQLite warning log from `GET /history`. It can differ from the dashboard's Prediction History tab, which comes from Mongo. That difference is expected.
- `/features`: live feature inspector (weather, rolling and soil features). API: `GET /features`.

### 5.9 Alert Channels (`/farmer/notifications`)
Toggle SMS, WhatsApp and the phone number, set quiet hours (default 21:00–06:00 IST) and the preferred language, enable browser push (the browser asks for permission; accept only if the user agrees), and view the delivery logs. SMS/WhatsApp only go out when a real phone number is saved. If the server has no VAPID keys, the page says Web Push is not configured. Notifications held by quiet hours are delivered after quiet hours end.
- APIs: `/notifications/preferences`, `/notifications/subscribe`, `/notifications/logs`, `/notifications/test`.
- Without Twilio credentials, SMS and WhatsApp are **simulated**: they print on the server console and are logged as "sent".

### 5.10 Agronomist dashboard (`/agronomist/dashboard`)
Tabs: **Active Threat Queue · Field Microclimate View · Regional 5km Risk Grid · Regional Reports · Farmer Support Management · Retraining Feedback Loop**.
- **Threat queue.** Select an item on the left. Choose **Confirm AI Diagnosis** or **Override / Adjust**, add notes, then **Submit Verification Audit**. The item leaves the queue and a retraining-feedback entry appears.
  - Items with IDs such as `demo_threat_01` are synthetic, shown with a **Demo data** badge when no real unverified logs exist. Verify is disabled for them (the backend returns 404).
  - API: `GET /detect/pending`, `POST /detect/{log_id}/verify`.
- **Field Microclimate.** Pick a farm from the **Farm** selector (lists all farms with GPS). APIs: `GET /farms`, then `GET /weather/{farm_id}`.
- **Regional grid / reports.** Choose the weekly or monthly range. Simulated values carry a **Demo data** badge. APIs: `GET /outbreak/regional-grid`, `GET /reports/regional?range=`.
- **Farmer support.** The list shows real pending requests. Open one, write a reply, then **Send Expert Advisory**. APIs: `GET /advisories/farmer-requests?status=pending`, `POST /advisories/farmer-requests/{id}/respond` (unknown id → 404).

### 5.11 Admin dashboard (`/admin/dashboard`)
Tabs: **Platform Analytics · Pest & Disease DB · Crop Rules & Costs** (sub-tabs Suitability Rules / Cost Templates / FAO-56 Water Kc / ICAR/TNAU Nutrients) **· Farm GPS Registry · User Accounts · Alert Thresholds · Upload Advisory · External API Health · Model Retraining**.
- Reading any tab is safe.
- Anything that saves, deletes, registers, publishes, retrains or runs a job modifies shared data. Confirm with the user first (rule 2).
- The Model Retraining tab shows the calibration report through **Load Report**: ECE, the Brier score, the calibration method (`platt` or `analytic-fallback`) and the reliability-diagram data. "Trigger Retraining Run" is **simulated** (marked Demo data) and never claims an accuracy gain.
- Platform Analytics reads real model metrics from `metrics.json` (model `4.0.0-nasa-power-rules`); only the district vulnerability section is simulated.
- **Alert Thresholds** loads/saves `{low_max, medium_max}` (0 < low < medium < 100) via `GET/PUT /admin/thresholds`; saving changes live risk levels.
- "Run ingestion now" returns **409** while a run is already in progress; wait and retry.
- **Upload Advisory** requires the text in 5 languages. Each language tab shows its required status.

### 5.12 Chatbot and voice assistant
- **Chatbot bubble** (bottom-right): pick EN/TA/HI, then click a suggested chip or type a question and send. Answers are **rule-based templates** (no LLM) filled with live data from the user's **own** farm (today's risk, weather, advisories). A user without a farm gets generic answers. An "I didn't understand" style reply means no intent matched, or the intents were not seeded (`python -m scripts.seed_chatbot_intents`). API: `GET /chatbot/intents?lang=`, `POST /chatbot/ask`.
- **குரல் AI voice modal:** toggle Tamil or English, use the quick buttons ("Today's warning", "Disease treatment"), type or speak, and use the speaker icon for text-to-speech. Microphone access needs the user's permission. API: `POST /chatbot/query`.

---

## 6. Drawing on the maps (Leaflet)

The map component (`DrawableMap`) has two modes, chosen with the buttons above the map:

- **Drag Rectangle** (default for quick scans): press the left mouse button on the map, **drag** to the opposite corner, and release. Map panning is disabled while you draw. The drag must cover more than ~0.002° (about 200 m), otherwise it is ignored. The shape is finalized on release.
  - Browser-automation tip: do a real `mousedown` → several `mousemove` → `mouseup` sequence at different pixel coordinates inside the map. A single click does nothing in this mode.
- **Polygon Points:** click the map at 3 or more vertices, then click **Scan Zone** (on the Soil Health page, **Confirm Boundary**). **Reset** clears the unfinished polygon, and **Clear** removes the finished shape.
- Zoom with the +/− controls or the scroll wheel. Presets recenter the map.
- The coordinates sent to the API are GeoJSON `[[[lon, lat], ...]]` with a closed ring. Keep shapes on land in Tamil Nadu (lat 8–13.5, lon 76–80.5), where the seeded farms are.

---

## 7. Checking that things work

When asked to "test the app", run this smoke path and report each step as PASS or FAIL with the evidence:

1. `http://localhost:8000/api/v1/health` returns healthy.
2. Log in as the farmer; the page redirects to `/farmer/today`.
3. The Today's Warning card renders with a risk level and a score (no red error box).
4. Visit each farmer nav item. Each page renders without a blank screen or an "Error" toast.
5. Chatbot: send "today's pest risk" and get a non-empty reply.
6. Switch the language to Tamil. The navbar labels change to Tamil script.
7. Sign out, log in as the agronomist, and check that the threat queue lists items and Field Microclimate loads weather for the selected farm.
8. Sign out, log in as the admin, and check that Platform Analytics shows numbers and External API Health shows statuses.
9. Draw-to-Scan near Kovilpatti with a rectangle; the result sheet appears.

To diagnose a failure, open DevTools:
- **Network tab:** filter by `api/v1`, click the failing request, and read the status code plus the `detail` in the response.
- **Console:** `[API] POST /predict-today` lines are logged in dev mode.
- **Application → Session Storage:** check that `cropshield_token` and `cropshield_user` exist.

| Symptom | Likely cause | What to tell the user |
|---|---|---|
| Redirected to `/login` repeatedly | No token in sessionStorage (new tab, or cleared storage) | Log in again in the same tab |
| 401 "Authentication token required" | Not logged in, or the token expired (24 h) | Log in again |
| 403 "Access forbidden: requires one of [...]" | Wrong role for that page or action | Use the correct demo account |
| 401 "User account inactive or not found" | The Mongo user is missing or was deactivated by the admin | Re-seed: `python -m scripts.init_mongo_db` |
| 500 on most pages | MongoDB is not running or not reachable | Start MongoDB (`docker compose up mongo`) |
| 500 "Prediction failed: …" | Backend exception in the predict pipeline | Share the `detail` text |
| Empty farm, advisories or alerts | DB not seeded | Run the seed scripts (see CLAUDE.md §10) |
| 403 on a farm, P&L or soil page | The farm belongs to another user | Expected: users only see their own farms (admins see all; agronomists read all) |
| 404 "Farm not found" / empty farm state | The user has no registered farm | Register a farm in Manage My Farm |
| 409 on a "run now" button | A job run is already in progress | Wait and retry |
| 429 on login or predict | Rate limit hit | Wait a few minutes |
| Everyone logged out after a backend restart | `SECRET_KEY` not set in dev (random key per start) | Set `SECRET_KEY` in `config/.env` |
| Yellow offline banner | `/api/v1/health` is unreachable | Backend down or network issue |

---

## 8. Reading results honestly (fallbacks and demo data)

When you report outputs to the user, mention the relevant caveat:
- **Weather:** if NASA POWER is unreachable, the backend uses **synthetic climatology**, and the response is flagged (`data_quality.is_synthetic: true`, "Estimated weather" notice). No neighbour alerts are sent on synthetic weather.
- **Pest risk model:** XGBoost `4.0.0-nasa-power-rules`, trained on real NASA POWER daily weather (2005–2024, 10 Tamil Nadu sites). Its **labels are rule-derived weather-suitability indices** (from `pest_service` thresholds), not observed outbreaks, so the score means "weather is favourable for this pest", not a confirmed outbreak. If the model can't run, `model_version` is `rules-fallback-v2` and the UI says "Rule-based estimate". See `ml/data/LABELING.md`.
- **Leaf disease:** no trained weights are installed, so scans return "model unavailable" with no diagnosis.
- **NDVI:** simulated Sentinel-2 values unless Google Earth Engine is configured.
- **SMS/WhatsApp:** simulated unless Twilio is configured.
- **Agronomist queue:** the `demo_threat_0x` items are synthetic.
- **Outbreak heatmap:** hard-coded hotspots, not live data.
- **Location "ensemble"** (legacy): numpy heuristics labelled as XGBoost, LightGBM, CatBoost and RF.

---

## 9. Where things live (for deeper debugging)

| UI piece | Source file |
|---|---|
| Routes, guards, navbar | `frontend/src/App.jsx` |
| Login | `frontend/src/pages/LoginPage.jsx` |
| Farmer home | `frontend/src/pages/FarmerDashboard.jsx` |
| Agronomist / Admin | `frontend/src/pages/AgronomistDashboard.jsx`, `AdminDashboard.jsx` |
| Map drawing | `frontend/src/components/DrawableMap.jsx` |
| API client | `frontend/src/utils/http.js` (`apiFetch`, token, 401 redirect, error normalizing) and `frontend/src/utils/api.js` (axios, same token source) |
| Offline queue / service worker | `frontend/src/utils/offlineQueue.js`, `frontend/src/sw.js` |
| Admin / agronomist tabs | `frontend/src/pages/admin/*.jsx`, `frontend/src/pages/agronomist/*.jsx` |
| Translations | `frontend/src/locales/{en,ta,hi,te,ml}/*.json` |
| Backend routes | `backend/api/*.py` (full index in `CLAUDE.md` §5) |
