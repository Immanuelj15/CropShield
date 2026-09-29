"""
AgriGuard AI — Multi-Channel Alert & Advisory Dispatch Router
Handles SMS, WhatsApp, Push Notification, and Automated Voice Alert generation.
"""

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from backend.models.user import User as MongoUser
from backend.utils.auth_utils import require_roles

router = APIRouter()

class AlertDispatchReq(BaseModel):
    farmer_phone: str = Field("", max_length=20)
    channel: str = Field("whatsapp", max_length=20)  # 'sms', 'whatsapp', 'push', 'voice'
    location: str = Field("Kovilpatti", max_length=100)
    crop: str = Field("Cotton", max_length=100)
    risk_level: str = Field("High", max_length=20)
    message: str = Field("🚨 HIGH PEST RISK today for Cotton at Kovilpatti. Spray Neem oil (5ml/L).", max_length=1000)


@router.post("/alerts/send")
def dispatch_alert(
    req: AlertDispatchReq,
    current_user: MongoUser = Depends(require_roles(["agronomist", "admin"])),
):
    """Preview-only mock dispatcher: nothing is actually sent (simulated=true)."""
    return {
        "status": "simulated",
        "simulated": True,
        "channel": req.channel,
        "recipient": req.farmer_phone,
        "location": req.location,
        "crop": req.crop,
        "risk_level": req.risk_level,
        "message": req.message,
        "voice_script": f"வணக்கம். {req.location} பகுதியில் {req.crop} பயிரில் பூச்சி தாக்குதல் அபாயம் அதிகம். உடனடி பாதுகாப்பு நடவடிக்கை எடுக்கவும்.",
        "dispatch_timestamp": datetime.utcnow().isoformat(),
    }
