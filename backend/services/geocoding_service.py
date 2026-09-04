"""
AgriGuard AI — Geocoding & Location Resolution Service
Maps State, District, Taluk, and Village input to Latitude and Longitude coordinates.
Uses an offline Tamil Nadu agro-climatic database with Open-Meteo / Nominatim API fallback.
"""

import urllib.parse
import urllib.request
import json

# Pre-indexed Tamil Nadu District & Taluk Agro-Coordinates
TN_LOCATION_DATABASE = {
    "kovilpatti": {"lat": 9.1728, "lon": 77.8710, "district": "Thoothukudi", "taluk": "Kovilpatti", "state": "Tamil Nadu"},
    "thanjavur": {"lat": 10.7870, "lon": 79.1378, "district": "Thanjavur", "taluk": "Thanjavur", "state": "Tamil Nadu"},
    "coimbatore": {"lat": 11.0168, "lon": 76.9558, "district": "Coimbatore", "taluk": "Coimbatore South", "state": "Tamil Nadu"},
    "madurai": {"lat": 9.9252, "lon": 78.1198, "district": "Madurai", "taluk": "Madurai North", "state": "Tamil Nadu"},
    "trichy": {"lat": 10.7905, "lon": 78.7047, "district": "Tiruchirappalli", "taluk": "Lalgudi", "state": "Tamil Nadu"},
    "tiruchirappalli": {"lat": 10.7905, "lon": 78.7047, "district": "Tiruchirappalli", "taluk": "Lalgudi", "state": "Tamil Nadu"},
    "nagapattinam": {"lat": 10.7672, "lon": 79.8449, "district": "Nagapattinam", "taluk": "Mayiladuthurai", "state": "Tamil Nadu"},
    "vellore": {"lat": 12.9165, "lon": 79.1325, "district": "Vellore", "taluk": "Gudiyatham", "state": "Tamil Nadu"},
    "krishnagiri": {"lat": 12.5266, "lon": 77.8256, "district": "Krishnagiri", "taluk": "Hosur", "state": "Tamil Nadu"},
    "tirunelveli": {"lat": 8.7139, "lon": 77.7567, "district": "Tirunelveli", "taluk": "Tenkasi", "state": "Tamil Nadu"},
    "nilgiris": {"lat": 11.4102, "lon": 76.6950, "district": "Nilgiris", "taluk": "Udhagamandalam", "state": "Tamil Nadu"},
    "aduthurai": {"lat": 11.0036, "lon": 79.4731, "district": "Thanjavur", "taluk": "Thiruvidaimarudur", "state": "Tamil Nadu"},
}

def geocode_location(state: str, district: str, taluk: str = "", village: str = ""):
    """
    Geocodes location inputs to (latitude, longitude).
    """
    search_query = f"{village} {taluk} {district} {state}".strip().lower()
    
    # 1. Search local database
    for key, loc in TN_LOCATION_DATABASE.items():
        if key in search_query or loc["district"].lower() in search_query:
            return {
                "latitude": loc["lat"],
                "longitude": loc["lon"],
                "resolved_address": f"{village or loc['taluk']}, {district or loc['district']}, {state}",
                "source": "Local Agro Database"
            }
            
    # 2. Open-Meteo Geocoding API fallback
    try:
        place_name = village or district or "Coimbatore"
        url = f"https://geocoding-api.open-meteo.com/v1/search?name={urllib.parse.quote(place_name)}&count=1&language=en&format=json"
        req = urllib.request.Request(url, headers={'User-Agent': 'AgriGuardAI/2.0'})
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode())
            if data.get("results"):
                res = data["results"][0]
                return {
                    "latitude": float(res["latitude"]),
                    "longitude": float(res["longitude"]),
                    "resolved_address": f"{res.get('name', place_name)}, {res.get('admin1', state)}, India",
                    "source": "Open-Meteo Geocoding API"
                }
    except Exception:
        pass
        
    # Default fallback
    return {
        "latitude": 9.1728,
        "longitude": 77.8710,
        "resolved_address": f"{village or 'Kovilpatti'}, {district or 'Thoothukudi'}, {state}",
        "source": "Default Agro Center"
    }
