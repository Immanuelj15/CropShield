"""
AgriGuard AI — Multi-Channel Alert & Advisory Dispatch Router
Handles SMS, WhatsApp, Push Notification, and Automated Voice Alert generation.
"""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

class AlertDispatchReq(BaseModel):
    farmer_phone: str = "+919876543210"
    channel: str = "whatsapp" # 'sms', 'whatsapp', 'push', 'voice'
    location: str = "Kovilpatti"
    crop: str = "Cotton"
    risk_level: str = "High"
    message: str = "🚨 HIGH PEST RISK today for Cotton at Kovilpatti. Spray Neem oil (5ml/L)."

@router.post("/alerts/send")
def dispatch_alert(req: AlertDispatchReq):
    return {
        "status": "dispatched",
        "channel": req.channel,
        "recipient": req.farmer_phone,
        "location": req.location,
        "crop": req.crop,
        "risk_level": req.risk_level,
        "message": req.message,
        "voice_script": f"வணக்கம். {req.location} பகுதியில் {req.crop} பயிரில் பூச்சி தாக்குதல் அபாயம் அதிகம். உடனடி பாதுகாப்பு நடவடிக்கை எடுக்கவும்.",
        "dispatch_timestamp": "2026-07-25T07:55:00"
    }
