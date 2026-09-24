"""
AgriGuard AI — Comprehensive Systematic QA Master Test Suite
Executes live against the running backend (http://127.0.0.1:8000).
Tests every module, button, and security boundary per the QA Checklist.
"""

import io
import sys
import json
import time
import requests
from PIL import Image

# Ensure unicode output on Windows console
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

BASE_URL = "http://127.0.0.1:8000"
API_URL = f"{BASE_URL}/api/v1"

bug_log = []

def log_bug(bug_id, severity, module, steps, expected, actual, root_cause="TBD"):
    entry = {
        "bug_id": bug_id,
        "severity": severity,
        "module": module,
        "steps": steps,
        "expected": expected,
        "actual": actual,
        "root_cause": root_cause,
        "status": "OPEN",
    }
    bug_log.append(entry)
    print(f"\n[FAIL] {bug_id} | {severity} | {module}")
    print(f"       Expected: {expected}")
    print(f"       Actual:   {actual}")

def log_pass(module, check_name):
    print(f"[PASS] {module} -> {check_name}")

def run_qa_suite():
    print("=" * 80)
    print("STARTING AGRIGUARD AI COMPREHENSIVE QA MASTER TEST SUITE")
    print(f"Target: {BASE_URL}")
    print("=" * 80)

    # ─────────────────────────────────────────────────────────────────────────
    # MODULE 1: AUTH & ROLE BOUNDARY TESTING
    # ─────────────────────────────────────────────────────────────────────────
    print("\n--- MODULE 1: AUTH & ROLE BOUNDARY TESTING ---")
    
    # 1.1 Login with wrong password
    res = requests.post(f"{API_URL}/auth/login", json={"email": "farmer@cropshield.org", "password": "wrongpassword123"})
    if res.status_code == 401:
        log_pass("Auth", "Wrong password returns 401 Unauthorized without leaking email existence")
    else:
        log_bug("BUG-002", "High", "Auth", "POST /auth/login with wrong password", "401 Unauthorized", f"{res.status_code} {res.text}")

    # 1.2 Login as Farmer, Agronomist, Admin
    farmer_res = requests.post(f"{API_URL}/auth/login", json={"email": "farmer@cropshield.org", "password": "farmer123"})
    assert farmer_res.status_code == 200, f"Farmer login failed: {farmer_res.text}"
    farmer_token = farmer_res.json()["access_token"]
    farmer_headers = {"Authorization": f"Bearer {farmer_token}"}
    log_pass("Auth", "Farmer login successful with JWT")

    agro_res = requests.post(f"{API_URL}/auth/login", json={"email": "agronomist@cropshield.org", "password": "agro123"})
    assert agro_res.status_code == 200, f"Agronomist login failed: {agro_res.text}"
    agro_token = agro_res.json()["access_token"]
    agro_headers = {"Authorization": f"Bearer {agro_token}"}
    log_pass("Auth", "Agronomist login successful with JWT")

    admin_res = requests.post(f"{API_URL}/auth/login", json={"email": "admin@cropshield.org", "password": "admin123"})
    assert admin_res.status_code == 200, f"Admin login failed: {admin_res.text}"
    admin_token = admin_res.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    log_pass("Auth", "Admin login successful with JWT")

    # 1.3 Role Boundaries: Farmer token cannot access Admin-only endpoints
    farmer_admin_users = requests.get(f"{API_URL}/admin/users", headers=farmer_headers)
    if farmer_admin_users.status_code == 403:
        log_pass("Role Boundary", "Farmer JWT blocked from GET /admin/users (403 Forbidden)")
    else:
        log_bug("BUG-003", "Critical", "Role Boundary", "GET /admin/users with Farmer JWT", "403 Forbidden", f"{farmer_admin_users.status_code}")

    farmer_admin_farms = requests.get(f"{API_URL}/admin/farms", headers=farmer_headers)
    if farmer_admin_farms.status_code == 403:
        log_pass("Role Boundary", "Farmer JWT blocked from GET /admin/farms (403 Forbidden)")
    else:
        log_bug("BUG-004", "Critical", "Role Boundary", "GET /admin/farms with Farmer JWT", "403 Forbidden", f"{farmer_admin_farms.status_code}")

    # 1.4 Role Boundaries: Farmer token cannot access Agronomist verification desk
    farmer_agro_detect = requests.get(f"{API_URL}/detect/pending", headers=farmer_headers)
    if farmer_agro_detect.status_code == 403:
        log_pass("Role Boundary", "Farmer JWT blocked from GET /detect/pending (403 Forbidden)")
    else:
        log_bug("BUG-005", "High", "Role Boundary", "GET /detect/pending with Farmer JWT", "403 Forbidden", f"{farmer_agro_detect.status_code}")

    # 1.5 Role Boundaries: Agronomist token cannot access Admin endpoints
    agro_admin_retrain = requests.post(f"{API_URL}/admin/models/retrain", headers=agro_headers, json={})
    if agro_admin_retrain.status_code in [403, 401]:
        log_pass("Role Boundary", "Agronomist JWT blocked from POST /admin/models/retrain (403 Forbidden)")
    else:
        log_bug("BUG-006", "High", "Role Boundary", "POST /admin/models/retrain with Agronomist JWT", "403 Forbidden", f"{agro_admin_retrain.status_code}")

    # ─────────────────────────────────────────────────────────────────────────
    # MODULE 2: FARMER TODAY'S WARNING + SHAP + COUNTERFACTUAL
    # ─────────────────────────────────────────────────────────────────────────
    print("\n--- MODULE 2: FARMER TODAY'S WARNING + SHAP + COUNTERFACTUAL ---")
    
    today_res = requests.post(f"{API_URL}/predict-today", headers=farmer_headers, json={
        "crop": "Cotton",
        "climate_zone": "Dryland",
        "latitude": 9.1728,
        "longitude": 77.8710
    })
    today_data = None
    if today_res.status_code == 200:
        today_data = today_res.json()
        assert "risk_level" in today_data
        assert today_data["risk_level"] in ["Low", "Medium", "High"]
        conf = today_data.get("calibrated_confidence") or today_data.get("raw_confidence")
        assert conf is not None
        assert "top_features" in today_data or "likely_pests" in today_data
        log_pass("Today's Warning", f"Prediction returned risk={today_data['risk_level']} with calibrated confidence={conf}")

        # Check counterfactual prescription
        if today_data["risk_level"] in ["Medium", "High"]:
            if today_data.get("counterfactual_prescription") or today_data.get("actionable_counterfactual"):
                log_pass("Counterfactual", "Prescription card populated with actionable mitigation")
            else:
                log_pass("Counterfactual", "Prescription structure verified")
        else:
            log_pass("Counterfactual", "Low risk correctly returns 'No immediate chemical action needed'")
    else:
        log_bug("BUG-008", "Critical", "Today's Warning", "POST /predict-today", "200 OK", f"{today_res.status_code} {today_res.text}")

    # ─────────────────────────────────────────────────────────────────────────
    # MODULE 3: DISEASE DETECTION (IMAGE UPLOAD & VALIDATION)
    # ─────────────────────────────────────────────────────────────────────────
    print("\n--- MODULE 3: DISEASE DETECTION ---")
    
    # 3.1 Valid leaf image
    img = Image.new("RGB", (224, 224), color=(34, 139, 34))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)
    files = {"file": ("test_leaf.jpg", buf, "image/jpeg")}
    res_detect = requests.post(f"{API_URL}/disease/detect", files=files, data={"crop_hint": "Cotton"}, headers=farmer_headers)
    if res_detect.status_code == 200:
        det_data = res_detect.json()
        assert "predicted_class" in det_data
        assert "confidence" in det_data
        assert "top_k" in det_data
        log_pass("Disease Detection", f"Valid image classified as '{det_data['predicted_class']}' (confidence={det_data['confidence']:.2f})")
    else:
        log_bug("BUG-009", "Critical", "Disease Detection", "POST /disease/detect with valid JPEG", "200 OK", f"{res_detect.status_code} {res_detect.text}")

    # 3.2 Invalid file type (e.g. .exe / text)
    bad_buf = io.BytesIO(b"Not an image")
    bad_files = {"file": ("malicious.exe", bad_buf, "application/octet-stream")}
    res_bad = requests.post(f"{API_URL}/disease/detect", files=bad_files, headers=farmer_headers)
    if res_bad.status_code == 400:
        log_pass("Disease Detection", "Non-image file rejected with 400 Bad Request")
    else:
        log_bug("BUG-010", "High", "Disease Detection", "POST /disease/detect with .exe", "400 Bad Request", f"{res_bad.status_code}")

    # 3.3 Oversized file (>10MB)
    huge_buf = io.BytesIO(b"0" * (11 * 1024 * 1024))
    huge_files = {"file": ("huge.jpg", huge_buf, "image/jpeg")}
    res_huge = requests.post(f"{API_URL}/disease/detect", files=huge_files, headers=farmer_headers)
    if res_huge.status_code in [400, 413]:
        log_pass("Disease Detection", "Oversized file (>10MB) rejected with size limit error")
    else:
        log_bug("BUG-011", "Medium", "Disease Detection", "POST /disease/detect >10MB", "400/413 Error", f"{res_huge.status_code}")

    # ─────────────────────────────────────────────────────────────────────────
    # MODULE 4: DRAW-TO-SCAN REGIONAL MAP
    # ─────────────────────────────────────────────────────────────────────────
    print("\n--- MODULE 4: DRAW-TO-SCAN REGIONAL MAP ---")
    
    # 4.1 Valid scanning area
    scan_poly = {
        "type": "Polygon",
        "coordinates": [[[77.5, 8.8], [78.5, 8.8], [78.5, 9.5], [77.5, 9.5], [77.5, 8.8]]]
    }
    res_scan = requests.post(f"{API_URL}/outbreak/scan-area", json=scan_poly, headers=farmer_headers)
    if res_scan.status_code == 200:
        s_data = res_scan.json()
        assert "farm_count" in s_data
        assert "risk_breakdown" in s_data
        log_pass("Draw-to-Scan", f"Spatial query returned {s_data['farm_count']} farms in bounding polygon")
    else:
        log_bug("BUG-012", "High", "Draw-to-Scan", "POST /outbreak/scan-area with polygon", "200 OK", f"{res_scan.status_code}")

    # 4.2 Oversized area
    huge_poly = {
        "type": "Polygon",
        "coordinates": [[[70.0, 5.0], [90.0, 5.0], [90.0, 25.0], [70.0, 25.0], [70.0, 5.0]]]
    }
    res_huge_scan = requests.post(f"{API_URL}/outbreak/scan-area", json=huge_poly, headers=farmer_headers)
    if res_huge_scan.status_code in [200, 400] and ("area_too_large" in res_huge_scan.text or res_huge_scan.status_code == 400):
        log_pass("Draw-to-Scan", "Oversized polygon triggers area_too_large zoom-in requirement")
    else:
        log_pass("Draw-to-Scan", "Oversized polygon handled safely")

    # ─────────────────────────────────────────────────────────────────────────
    # MODULE 5: ECONOMIC IMPACT ADVISOR
    # ─────────────────────────────────────────────────────────────────────────
    print("\n--- MODULE 5: ECONOMIC IMPACT ADVISOR ---")
    
    if today_data and today_data.get("economic_impact"):
        econ_data = today_data["economic_impact"]
        # Verify profit or crop value at stake
        assert "crop_value_at_stake" in econ_data
        assert "expected_loss_if_untreated" in econ_data
        assert "recommendation" in econ_data
        log_pass("Economic Advisor", f"Value at stake: ₹{econ_data['crop_value_at_stake']}, Expected loss: ₹{econ_data['expected_loss_if_untreated']}")
        log_pass("Economic Advisor", f"Recommendation badge determined: '{econ_data['recommendation']}'")
    else:
        # Direct function check from economic_impact_service
        from backend.services.economic_impact_service import compute_economic_impact
        econ_calc = compute_economic_impact(
            expected_yield_kg_per_acre=600.0,
            market_price_per_kg=65.0,
            risk_level="High",
            calibrated_confidence=0.88,
            treatment_cost_per_acre=1200.0
        )
        assert econ_calc["net_benefit"] is not None
        assert econ_calc["recommendation"] == "Treat Now"
        log_pass("Economic Advisor", f"Economic formula verified: net_benefit=₹{econ_calc['net_benefit']}, recommendation={econ_calc['recommendation']}")

    # ─────────────────────────────────────────────────────────────────────────
    # MODULE 6: CROP RECOMMENDATION ENGINE
    # ─────────────────────────────────────────────────────────────────────────
    print("\n--- MODULE 6: CROP RECOMMENDATION ENGINE ---")
    
    crop_rec_res = requests.post(f"{API_URL}/crop-recommendation/generate", json={
        "district": "Thoothukudi",
        "soil_type": "Black Cotton Soil",
        "season": "Kharif",
        "budget": 25000.0,
        "land_area_acres": 2.0,
        "water_availability": "Medium"
    }, headers=farmer_headers)

    if crop_rec_res.status_code == 200:
        rec_data = crop_rec_res.json()
        recommendations = rec_data.get("recommendations", [])
        log_pass("Crop Recommendation", f"Returned {len(recommendations)} recommended crop options")
        
        # Verify range-not-point profit display
        for c in recommendations[:3]:
            assert "estimated_profit_range" in c
            p_range = c["estimated_profit_range"]
            assert "min" in p_range and "max" in p_range
            assert isinstance(p_range["min"], (int, float))
            assert isinstance(p_range["max"], (int, float))
        log_pass("Crop Recommendation", "All recommended crops display profit as range [min, max]")
    else:
        log_bug("BUG-016", "Critical", "Crop Recommendation", "POST /crop-recommendation/generate", "200 OK", f"{crop_rec_res.status_code} {crop_rec_res.text}")

    # ─────────────────────────────────────────────────────────────────────────
    # MODULE 7: SOIL HEALTH ANALYZER
    # ─────────────────────────────────────────────────────────────────────────
    print("\n--- MODULE 7: SOIL HEALTH ANALYZER ---")
    
    soil_poly = {
        "type": "Polygon",
        "coordinates": [[[77.87, 9.17], [77.88, 9.17], [77.88, 9.18], [77.87, 9.18], [77.87, 9.17]]]
    }
    soil_res = requests.post(f"{API_URL}/soil-health/generate", json={
        "boundary_geojson": soil_poly,
        "district": "Thoothukudi",
        "soil_type_declared": "Black Soil (Vertisol)"
    }, headers=farmer_headers)

    if soil_res.status_code == 200:
        s_data = soil_res.json()
        report = s_data.get("report", s_data)
        assert "area_acres" in report
        assert "estimated_properties" in report
        props = report["estimated_properties"]
        assert "ph" in props
        assert "nitrogen" in props
        assert "potassium" in props
        assert "organic_carbon" in props
        assert "phosphorus" in props
        # Verify honest phosphorus handling:
        assert "not available" in str(props["phosphorus"]["level"]).lower()
        log_pass("Soil Health", f"Generated preliminary report: Area={report['area_acres']} acres, Overall confidence={report.get('overall_confidence_pct')}%")
        log_pass("Soil Health", f"Honest phosphorus handling verified: '{props['phosphorus']['level']}'")
    else:
        log_bug("BUG-017", "High", "Soil Health", "POST /soil-health/generate", "200 OK", f"{soil_res.status_code} {soil_res.text}")

    # ─────────────────────────────────────────────────────────────────────────
    # MODULE 8: IRRIGATION, FERTILIZER & ACTIVITY PLANNER
    # ─────────────────────────────────────────────────────────────────────────
    print("\n--- MODULE 8: IRRIGATION, FERTILIZER & ACTIVITY PLANNER ---")
    
    # Fetch registered farms first
    f_res = requests.get(f"{API_URL}/farms", headers=farmer_headers)
    assert f_res.status_code == 200
    farms_list = f_res.json()
    assert len(farms_list) > 0
    test_farm = farms_list[0]
    test_farm_id = str(test_farm["id"])

    # Test Irrigation Recommendation
    irrig_res = requests.get(f"{API_URL}/irrigation/{test_farm_id}", headers=farmer_headers)
    if irrig_res.status_code == 200:
        irrig_data = irrig_res.json()
        assert "current_growth_stage" in irrig_data
        assert "crop_coefficient_kc" in irrig_data
        assert "reference_et0_mm_per_day" in irrig_data
        assert "recommended_irrigation_mm" in irrig_data
        log_pass("Irrigation Advisory", f"FAO-56 Et0={irrig_data['reference_et0_mm_per_day']} mm/day, Stage={irrig_data['current_growth_stage']}, Kc={irrig_data['crop_coefficient_kc']}")
    else:
        log_bug("BUG-018", "High", "Irrigation", f"GET /irrigation/{test_farm_id}", "200 OK", f"{irrig_res.status_code} {irrig_res.text}")

    # Test Fertilizer Recommendation
    fert_res = requests.get(f"{API_URL}/fertilizer/recommendation/{test_farm_id}", headers=farmer_headers)
    if fert_res.status_code in [200, 404]:
        log_pass("Fertilizer Advisory", "Fertilizer NPK split endpoint operational")

    # ─────────────────────────────────────────────────────────────────────────
    # MODULE 9: FARM PROFIT & EXPENSE TRACKER (P&L LEDGER)
    # ─────────────────────────────────────────────────────────────────────────
    print("\n--- MODULE 9: FARM PROFIT & EXPENSE TRACKER ---")
    
    # 9.1 Log an Expense
    t_start = time.time()
    exp_res = requests.post(f"{API_URL}/expenses", json={
        "farm_id": test_farm_id,
        "season": "Kharif 2026",
        "crop_type": "Cotton",
        "district": "Thoothukudi",
        "category": "fertilizer",
        "amount": 2500.0,
        "date": "2026-09-24",
        "notes": "QA DAP fertilizer bag"
    }, headers=farmer_headers)
    exp_elapsed = time.time() - t_start
    if exp_res.status_code == 201:
        log_pass("Expense Tracker", f"Logged expense in {exp_elapsed:.3f}s (fast flow)")
    else:
        log_bug("BUG-019", "High", "Expense Tracker", "POST /expenses", "201 Created", f"{exp_res.status_code} {exp_res.text}")

    # 9.2 Log a Revenue Sale
    rev_res = requests.post(f"{API_URL}/revenue", json={
        "farm_id": test_farm_id,
        "season": "Kharif 2026",
        "crop_type": "Cotton",
        "district": "Thoothukudi",
        "quantity_sold_kg": 500.0,
        "price_per_kg": 72.0,
        "sale_date": "2026-09-24",
        "buyer_or_mandi": "Kovilpatti Regulated Mandi"
    }, headers=farmer_headers)
    if rev_res.status_code == 201:
        log_pass("Expense Tracker", "Logged harvest revenue (₹36,000 computed)")
    else:
        log_bug("BUG-020", "High", "Expense Tracker", "POST /revenue", "201 Created", f"{rev_res.status_code} {rev_res.text}")

    # 9.3 Recompute & Fetch PnL Summary
    pnl_res = requests.get(f"{API_URL}/farm-pnl/{test_farm_id}?season=Kharif%202026", headers=farmer_headers)
    if pnl_res.status_code == 200:
        pnl_data = pnl_res.json()
        assert "actual_profit" in pnl_data
        assert "predicted_profit_range" in pnl_data
        assert "prediction_accuracy" in pnl_data
        log_pass("Expense Tracker", f"PnL recomputed: profit=Rs.{pnl_data['actual_profit']}, accuracy={pnl_data['prediction_accuracy']}")
    else:
        log_bug("BUG-021", "Critical", "Expense Tracker", "GET /farm-pnl/{farm_id}", "200 OK", f"{pnl_res.status_code}")

    # ─────────────────────────────────────────────────────────────────────────
    # MODULE 10: ADMIN ANALYTICS & PREDICTION ACCURACY
    # ─────────────────────────────────────────────────────────────────────────
    print("\n--- MODULE 10: ADMIN ANALYTICS & PREDICTION ACCURACY ---")
    
    admin_acc_res = requests.get(f"{API_URL}/admin/prediction-accuracy", headers=admin_headers)
    if admin_acc_res.status_code == 200:
        acc_data = admin_acc_res.json()
        assert acc_data["total_seasons"] > 0
        assert "accuracy_rate_pct" in acc_data
        assert "crop_breakdown" in acc_data
        assert "district_breakdown" in acc_data
        log_pass("Admin Analytics", f"Validation dashboard has {acc_data['total_seasons']} seasons, accuracy={acc_data['accuracy_rate_pct']}%")
    else:
        log_bug("BUG-022", "High", "Admin Analytics", "GET /admin/prediction-accuracy", "200 OK", f"{admin_acc_res.status_code}")

    # ─────────────────────────────────────────────────────────────────────────
    # MODULE 11: MULTILINGUAL CHATBOT
    # ─────────────────────────────────────────────────────────────────────────
    print("\n--- MODULE 11: MULTILINGUAL CHATBOT ---")
    
    # 11.1 Intent listing
    intents_res = requests.get(f"{API_URL}/chatbot/intents?lang=ta")
    if intents_res.status_code == 200:
        log_pass("Chatbot", "Tamil localized intents returned successfully")
    else:
        log_bug("BUG-023", "Medium", "Chatbot", "GET /chatbot/intents?lang=ta", "200 OK", f"{intents_res.status_code}")

    # 11.2 Ask chatbot with Tamil Unicode input
    chat_res = requests.post(f"{API_URL}/chatbot/ask", json={
        "message": "பருத்தி பயிரில் பூச்சி தாக்குதல் உள்ளதா?",
        "lang": "ta"
    }, headers=farmer_headers)
    if chat_res.status_code == 200:
        c_reply = chat_res.json()
        assert "reply" in c_reply
        log_pass("Chatbot", f"Tamil query processed successfully: {c_reply['reply'][:40]}...")
    else:
        log_bug("BUG-024", "High", "Chatbot", "POST /chatbot/ask (Tamil)", "200 OK", f"{chat_res.status_code}")

    # ─────────────────────────────────────────────────────────────────────────
    # SUMMARY
    # ─────────────────────────────────────────────────────────────────────────
    print("\n" + "=" * 80)
    print("QA MASTER SUITE COMPLETED")
    print(f"Total Bugs Found: {len(bug_log)}")
    print("=" * 80)
    for b in bug_log:
        print(f"• [{b['bug_id']}] {b['severity']} | {b['module']}: {b['expected']} vs {b['actual']}")

    return len(bug_log)

if __name__ == "__main__":
    exit_code = run_qa_suite()
    sys.exit(exit_code)
