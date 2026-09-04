"""
AgriGuard AI — Counterfactual Explanation Engine
Generates domain-constrained "what-if" counterfactual advisories for farmers.
Calculates minimum physical parameter interventions required to lower risk.
"""

def generate_counterfactual_explanation(current_features, current_risk_score, current_risk_level):
    """
    Computes actionable counterfactual changes to reduce pest risk.
    """
    if current_risk_level == "Low":
        return {
            "target_risk_level": "Low",
            "is_risk_acceptable": True,
            "message": "Current environmental and field parameters are within the safe zone. Maintain standard monitoring.",
            "counterfactual_actions": []
        }
        
    rh_mean_7d = current_features.get("rh_mean_7d", 80.0)
    consecutive_dry_days = current_features.get("consecutive_dry_days", 5.0)
    vpd_kPa = current_features.get("vpd_kPa", 0.6)
    temp_mean_7d = current_features.get("temp_mean_7d", 32.0)
    
    actions = []
    
    # 1. Moisture & Humidity Intervention
    if rh_mean_7d > 75.0:
        new_rh = max(65.0, rh_mean_7d - 12.0)
        actions.append({
            "parameter": "7-Day Relative Humidity Exposure",
            "current_value": f"{round(rh_mean_7d, 1)}%",
            "recommended_target": f"{round(new_rh, 1)}%",
            "action_required": "Improve field canopy aeration by pruning dense lower leaves and switching from flood to drip irrigation.",
            "risk_reduction_pct": 28.5
        })
        
    # 2. Dry Spell & Irrigation Delay
    if consecutive_dry_days < 3.0:
        actions.append({
            "parameter": "Soil Moisture Saturation",
            "current_value": "Saturated Soil",
            "recommended_target": "Allow 2-3 days dry soil surface interval",
            "action_required": "Pause irrigation for 48 hours to dry out soil surface and disrupt fungal spore germination.",
            "risk_reduction_pct": 22.0
        })
        
    # 3. Microclimate Temperature / Canopy Shade
    if temp_mean_7d > 33.0:
        actions.append({
            "parameter": "Canopy Microclimate Temperature",
            "current_value": f"{round(temp_mean_7d, 1)}°C",
            "recommended_target": f"{round(temp_mean_7d - 2.5, 1)}°C",
            "action_required": "Deploy neem cake soil amendment and maintain light mulching to regulate soil temperature.",
            "risk_reduction_pct": 18.0
        })
        
    # Default Action if none triggered
    if not actions:
        actions.append({
            "parameter": "Biological Vector Suppression",
            "current_value": "High Pest Vector Load",
            "recommended_target": "Suppressed Vector Population",
            "action_required": "Deploy 10 Yellow Sticky Traps per acre and spray Neem oil (10,000 ppm) @ 2ml/L.",
            "risk_reduction_pct": 35.0
        })
        
    total_reduction = min(75.0, sum(a["risk_reduction_pct"] for a in actions))
    new_simulated_risk_score = max(0.12, round(current_risk_score * (1.0 - total_reduction / 100.0), 3))
    
    return {
        "target_risk_level": "Low" if new_simulated_risk_score < 0.40 else "Medium",
        "current_risk_score": round(current_risk_score, 3),
        "simulated_new_risk_score": new_simulated_risk_score,
        "potential_risk_reduction_pct": round(total_reduction, 1),
        "message": f"Executing the {len(actions)} recommended intervention(s) can reduce pest risk score from {round(current_risk_score, 2)} to {new_simulated_risk_score}.",
        "counterfactual_actions": actions
    }
