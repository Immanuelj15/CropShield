"""
CropShield — Detection API (v2)
POST /api/v1/detect — rule-based pest detection using today's weather
"""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.models.schemas import DetectionRequest, DetectionResponse, DetectedPest
from backend.models.db_models import PestDetection, DetectionStatus
from backend.services import weather_service, soil_service, pest_service

router = APIRouter()


@router.post("/detect", response_model=DetectionResponse, summary="Detect Pest Presence Today")
async def detect_pests(request: DetectionRequest, db: Session = Depends(get_db)):
    """
    Rule-based pest detection using today's live weather.
    Evaluates each pest's favorable climate thresholds against current conditions.
    """
    try:
        from ml.data.feature_engineering import engineer_features

        weather_df = await weather_service.fetch_latest_weather(
            latitude=request.latitude, longitude=request.longitude, days_back=35
        )
        fe_df  = engineer_features(weather_df)
        fe_row = fe_df.iloc[-1].to_dict()
        soil   = soil_service.get_soil_profile("Dryland")

        detected = pest_service.detect_pests(
            crop=request.crop,
            weather_features=fe_row,
            soil_features=soil,
        )
        overall = pest_service.get_overall_detection_status(detected)

        records = []
        for d in detected:
            rec = PestDetection(
                warning_id=request.warning_id,
                location=request.location, crop=request.crop,
                pest_name=d["pest_name"], pest_type=d["pest_type"],
                detection_status=DetectionStatus(d["detection_status"]),
                confidence=d["confidence"],
                rules_triggered=d["rules_triggered"],
                evidence=d["evidence"], image_based=False,
            )
            db.add(rec); records.append(rec)
        db.commit()
        if records: db.refresh(records[0])

        ctx = {
            "temperature_c": round(float(fe_row.get("t2m",0)),1),
            "humidity_pct":  round(float(fe_row.get("rh2m",0)),1),
            "rainfall_7d_mm":round(float(fe_row.get("rain_rolling_7d",0)),1),
            "consecutive_dry_days": int(fe_row.get("consecutive_dry_days",0)),
        }

        if overall == "Confirmed":
            msg = f"⚠️ Pest activity CONFIRMED for {request.crop} at {request.location} today."
        elif overall == "Suspected":
            msg = f"⚡ Conditions favorable for pests in {request.crop} today."
        else:
            msg = f"✅ No significant pest activity detected for {request.crop} today."

        return DetectionResponse(
            detection_id=records[0].id if records else 0,
            location=request.location, crop=request.crop,
            detection_date=datetime.utcnow(),
            overall_status=overall,
            detected_pests=[DetectedPest(**{
                "pest_name": d["pest_name"], "pest_type": d["pest_type"],
                "detection_status": d["detection_status"], "confidence": d["confidence"],
                "rules_triggered": d["rules_triggered"], "evidence": d["evidence"],
                "management_advice": d["management_advice"],
            }) for d in detected],
            weather_context=ctx,
            action_required=overall in ("Suspected","Confirmed"),
            alert_message=msg,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
