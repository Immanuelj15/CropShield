"""
AgriGuard AI — Haversine Spatiotemporal Outbreak Clustering Engine
Calculates spatial proximity risk decay across Tamil Nadu agricultural districts and villages.
Generates dynamic outbreak heatmaps and neighbor risk propagation scores.
"""

import math

# Major Tamil Nadu Agricultural Coordinates & District Hubs
TN_AGRICULTURAL_HUBS = [
    {"district": "Thanjavur", "village": "Aduthurai", "lat": 11.0036, "lon": 79.4731, "crop": "Rice", "baseline_risk": 0.72},
    {"district": "Coimbatore", "village": "Thondamuthur", "lat": 10.9934, "lon": 76.8286, "crop": "Cotton", "baseline_risk": 0.45},
    {"district": "Thiruchirapalli", "village": "Lalgudi", "lat": 10.8675, "lon": 78.8166, "crop": "Sugarcane", "baseline_risk": 0.68},
    {"district": "Madurai", "village": "Usilampatti", "lat": 9.9699, "lon": 77.7911, "crop": "Paddy", "baseline_risk": 0.81},
    {"district": "Tuticorin", "village": "Kovilpatti", "lat": 9.1728, "lon": 77.8710, "crop": "Cotton", "baseline_risk": 0.75},
    {"district": "Krishnagiri", "village": "Hosur", "lat": 12.5266, "lon": 77.8256, "crop": "Tomato", "baseline_risk": 0.38},
    {"district": "Nilgiris", "village": "Ooty", "lat": 11.4102, "lon": 76.6950, "crop": "Potato", "baseline_risk": 0.25},
    {"district": "Vellore", "village": "Gudiyatham", "lat": 12.9469, "lon": 78.8702, "crop": "Groundnut", "baseline_risk": 0.58},
    {"district": "Nagapattinam", "village": "Mayiladuthurai", "lat": 11.1018, "lon": 79.6522, "crop": "Rice", "baseline_risk": 0.88},
    {"district": "Tirunelveli", "village": "Tenkasi", "lat": 8.9593, "lon": 77.3150, "crop": "Paddy", "baseline_risk": 0.62}
]

def haversine_distance_km(lat1, lon1, lat2, lon2):
    """
    Computes great-circle Haversine distance in kilometers between two coordinates.
    """
    R = 6371.0 # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def calculate_spatial_outbreak_risk(lat, lon, bandwidth_km=50.0):
    """
    Calculates proximity-weighted outbreak risk propagation for any field coordinate.
    Uses exponential decay kernel: W(d) = exp(-d / bandwidth)
    """
    total_weight = 0.0
    weighted_risk_sum = 0.0
    neighbor_nodes = []
    
    for hub in TN_AGRICULTURAL_HUBS:
        dist_km = haversine_distance_km(lat, lon, hub["lat"], hub["lon"])
        weight = math.exp(-dist_km / bandwidth_km)
        total_weight += weight
        weighted_risk_sum += weight * hub["baseline_risk"]
        
        if dist_km <= 150.0:
            neighbor_nodes.append({
                "district": hub["district"],
                "village": hub["village"],
                "crop": hub["crop"],
                "distance_km": round(dist_km, 1),
                "risk_score": hub["baseline_risk"],
                "risk_level": "High" if hub["baseline_risk"] >= 0.7 else ("Medium" if hub["baseline_risk"] >= 0.4 else "Low")
            })
            
    neighbor_nodes.sort(key=lambda x: x["distance_km"])
    
    spatial_propagated_risk = round(weighted_risk_sum / max(total_weight, 1e-6), 3)
    spatial_risk_level = "High" if spatial_propagated_risk >= 0.65 else ("Medium" if spatial_propagated_risk >= 0.38 else "Low")
    
    return {
        "user_lat": lat,
        "user_lon": lon,
        "spatial_propagated_risk": spatial_propagated_risk,
        "spatial_risk_level": spatial_risk_level,
        "nearby_hubs": neighbor_nodes[:5],
        "outbreak_summary": f"Spatial analysis indicates a {spatial_risk_level} disease transmission risk ({spatial_propagated_risk*100:.1f}%) within a {bandwidth_km}km radius."
    }

def get_full_district_heatmap_data():
    """
    Returns complete dataset for Leaflet interactive map rendering.
    """
    heatmap_points = []
    for hub in TN_AGRICULTURAL_HUBS:
        heatmap_points.append({
            "lat": hub["lat"],
            "lng": hub["lon"],
            "intensity": hub["baseline_risk"],
            "district": hub["district"],
            "village": hub["village"],
            "crop": hub["crop"],
            "risk_level": "High" if hub["baseline_risk"] >= 0.7 else ("Medium" if hub["baseline_risk"] >= 0.4 else "Low")
        })
    return heatmap_points
