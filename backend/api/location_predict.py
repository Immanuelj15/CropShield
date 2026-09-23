"""
AgriGuard AI — Location-Based Early Warning & Advisory API Router
Mandatory workflow: User provides State, District, Taluk, Village, Crop Type, Variety, Sowing Date.
Automatically geocodes coordinates, fetches NASA POWER/Open-Meteo climate, computes 12+ features,
evaluates Multi-Model Ensemble (XGBoost/LightGBM/CatBoost/RF), generates SHAP XAI, and dispatches Alerts.
"""

from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.services.geocoding_service import geocode_location
from backend.services import weather_service, soil_service
from ml.location_prediction.feature_builder import build_advanced_feature_vector
from ml.location_prediction.model_ensemble import evaluate_model_ensemble
from backend.services.recommendation_engine import generate_smart_recommendations

router = APIRouter()

class LocationPredictRequest(BaseModel):
    state: str = Field("Tamil Nadu")
    district: str = Field("Thoothukudi")
    taluk: str = Field("Kovilpatti")
    village: str = Field("Kovilpatti")
    crop: str = Field("Cotton")
    crop_variety: Optional[str] = Field("Bt-Cotton")
    sowing_date: Optional[str] = Field(None, example="2026-06-15")

@router.post("/predict-location")
async def predict_location_early_warning(req: LocationPredictRequest, db: Session = Depends(get_db)):
    # 1. Automatic Geocoding
    geo_info = geocode_location(req.state, req.district, req.taluk, req.village)
    lat, lon = geo_info["latitude"], geo_info["longitude"]
    location_str = f"{req.village or req.taluk}, {req.district}"

    try:
        # 2. Automatic Data Collection (NASA POWER & Open-Meteo)
        weather_df = await weather_service.fetch_latest_weather(latitude=lat, longitude=lon, days_back=35)
    except Exception:
        weather_df = None

    soil_profile = soil_service.get_soil_profile("Dryland")

    # 3. Feature Engineering (12+ features: VPD, Heat Index, Dry Days, Growth Stage, etc.)
    feature_dict = build_advanced_feature_vector(weather_df, soil_profile, req.crop, req.sowing_date)

    # 4. AI Multi-Model Ensemble (XGBoost, LightGBM, CatBoost, Random Forest)
    model_results = evaluate_model_ensemble(feature_dict, req.crop)

    # 5. Smart Recommendation Engine & Early Warning Alerts
    recommendable = generate_smart_recommendations(
        crop=req.crop,
        disease_name=model_results["predicted_pathogen"],
        risk_level=model_results["risk_level"],
        weather_features=feature_dict,
        location_str=location_str
    )

    # 6. Economic Impact Advisor (₹ Optimization)
    from backend.services.economic_impact_service import get_economic_impact_for_prediction
    economic_impact_data = await get_economic_impact_for_prediction(
        crop=req.crop,
        location=req.district,
        risk_level=model_results["risk_level"],
        calibrated_confidence=model_results.get("confidence_score") or 0.85,
        detected_pests=[{"pest_name": model_results["predicted_pathogen"], "confidence": model_results.get("pest_probability", 0.75)}],
        weather_snapshot=feature_dict,
        soil={"nitrogen": 180.0, "phosphorus": 45.0, "potassium": 150.0, "ph": 6.8, "organic_carbon": 0.65},
    )

    return {
        "status": "success",
        "inputs": {
            "state": req.state,
            "district": req.district,
            "taluk": req.taluk,
            "village": req.village,
            "crop": req.crop,
            "crop_variety": req.crop_variety or "Standard Variety",
            "sowing_date": req.sowing_date or "Not Specified"
        },
        "geocoding": geo_info,
        "environment_snapshot": feature_dict,
        "prediction": model_results,
        "recommendations": recommendable,
        "alert_system": recommendable["alert_system"],
        "economic_impact": economic_impact_data,
    }
