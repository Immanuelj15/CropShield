"""
AgriGuard AI — Yield Prediction API Router
Predicts expected crop yields in tons/ha and kg/acre with feature factor breakdowns.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.db.database import get_db
from backend.models.schemas import YieldRequest, YieldResponse
from backend.models.db_models import YieldPredictionLog
from ml.yield_prediction.yield_model import predict_crop_yield

router = APIRouter()

@router.post("/yield/predict", response_model=YieldResponse)
def get_yield_prediction(req: YieldRequest, db: Session = Depends(get_db)):
    result = predict_crop_yield(
        crop=req.crop,
        temperature_c=req.temperature_c,
        humidity_pct=req.humidity_pct,
        rainfall_mm=req.rainfall_mm,
        soil_n=req.soil_n,
        soil_p=req.soil_p,
        soil_k=req.soil_k,
        soil_ph=req.soil_ph,
        organic_carbon=req.organic_carbon,
        irrigation_type=req.irrigation_type
    )
    
    try:
        log = YieldPredictionLog(
            crop=req.crop,
            expected_yield_tons_ha=result["expected_yield_tons_ha"],
            expected_yield_kg_acre=result["expected_yield_kg_acre"],
            total_multiplier=result["total_multiplier"]
        )
        db.add(log)
        db.commit()
    except Exception:
        db.rollback()
        
    return result
