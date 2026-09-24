"""
AgriGuard AI — Notification Delivery & Preference API Router
Handles Web Push subscriptions, SMS/WhatsApp toggles, Quiet Hours, and Test Delivery.
"""

from datetime import datetime
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from backend.utils.auth_utils import get_current_user
from backend.utils.config import settings
from backend.models.user import User as MongoUser
from backend.models.notification_preference import NotificationPreference
from backend.models.notification_log import NotificationLog
from backend.services.notification_service import (
    get_or_create_preferences,
    notify_farmer,
)

router = APIRouter(prefix="/notifications", tags=["Notification Delivery & PWA"])


class PushSubscriptionSchema(BaseModel):
    endpoint: str
    keys: Dict[str, str] = Field(default_factory=dict)
    expirationTime: Optional[Any] = None


class NotificationPreferenceUpdate(BaseModel):
    sms_enabled: Optional[bool] = None
    whatsapp_enabled: Optional[bool] = None
    phone_number: Optional[str] = None
    preferred_language: Optional[str] = None
    quiet_hours: Optional[Dict[str, str]] = None


class TestNotificationRequest(BaseModel):
    channel: Optional[str] = None  # "push", "sms", "whatsapp", or None for auto-dispatch


@router.get("/vapid-public-key")
async def get_vapid_public_key():
    """Returns the VAPID public key needed by browser PushManager to generate push subscriptions."""
    return {"public_key": settings.VAPID_PUBLIC_KEY}


@router.get("/preferences")
async def get_preferences(current_user: MongoUser = Depends(get_current_user)):
    """Retrieve notification preferences for the logged-in farmer."""
    pref = await get_or_create_preferences(current_user.id)
    return {
        "user_id": str(current_user.id),
        "has_push_subscription": bool(pref.push_subscription),
        "sms_enabled": pref.sms_enabled,
        "whatsapp_enabled": pref.whatsapp_enabled,
        "phone_number": pref.phone_number,
        "preferred_language": pref.preferred_language,
        "quiet_hours": pref.quiet_hours,
        "updated_at": pref.updated_at.isoformat() if pref.updated_at else None,
    }


@router.put("/preferences")
async def update_preferences(
    payload: NotificationPreferenceUpdate,
    current_user: MongoUser = Depends(get_current_user)
):
    """Updates SMS/WhatsApp toggles, phone number, language preference, and quiet hours."""
    pref = await get_or_create_preferences(current_user.id)

    if payload.sms_enabled is not None:
        pref.sms_enabled = payload.sms_enabled
    if payload.whatsapp_enabled is not None:
        pref.whatsapp_enabled = payload.whatsapp_enabled
    if payload.phone_number is not None:
        pref.phone_number = payload.phone_number.strip()
    if payload.preferred_language is not None:
        pref.preferred_language = payload.preferred_language.strip().lower()
    if payload.quiet_hours is not None:
        pref.quiet_hours = payload.quiet_hours

    pref.updated_at = datetime.utcnow()
    await pref.save()

    return {
        "status": "success",
        "message": "Notification preferences updated successfully",
        "preferences": {
            "has_push_subscription": bool(pref.push_subscription),
            "sms_enabled": pref.sms_enabled,
            "whatsapp_enabled": pref.whatsapp_enabled,
            "phone_number": pref.phone_number,
            "preferred_language": pref.preferred_language,
            "quiet_hours": pref.quiet_hours,
        }
    }


@router.post("/subscribe")
async def subscribe_push(
    subscription: PushSubscriptionSchema,
    current_user: MongoUser = Depends(get_current_user)
):
    """Stores or updates browser Web Push subscription for the farmer's PWA."""
    pref = await get_or_create_preferences(current_user.id)
    pref.push_subscription = subscription.dict()
    pref.updated_at = datetime.utcnow()
    await pref.save()

    return {
        "status": "subscribed",
        "message": "Web Push subscription registered successfully",
        "user_id": str(current_user.id),
    }


@router.post("/unsubscribe")
async def unsubscribe_push(
    current_user: MongoUser = Depends(get_current_user)
):
    """Clears Web Push subscription."""
    pref = await get_or_create_preferences(current_user.id)
    pref.push_subscription = None
    pref.updated_at = datetime.utcnow()
    await pref.save()
    return {"status": "unsubscribed", "message": "Push notifications disabled"}


@router.post("/test")
async def test_notification(
    payload: Optional[TestNotificationRequest] = None,
    current_user: MongoUser = Depends(get_current_user)
):
    """Dispatches a test notification through the farmer's configured channels."""
    messages = {
        "en": "AgriGuard Test Alert: Your multi-channel early warning delivery is active and working properly!",
        "ta": "அக்ரிகார்ட் சோதனை எச்சரிக்கை: உங்கள் பல-சேனல் விழிப்பூட்டல் வெற்றிகரமாக இயங்குகிறது!",
        "hi": "एग्रीगार्ड टेस्ट अलर्ट: आपकी बहु-चैनल चेतावनी वितरण सफलतापूर्वक सक्रिय है!",
        "te": "అగ్రిగార్డ్ టెస్ట్ హెచ్చరిక: మీ బహుళ-ఛానల్ ముందస్తు హెచ్చరిక డెలివరీ విజయవంతంగా పనిచేస్తోంది!",
        "ml": "അഗ്രിഗാർഡ് ടെസ്റ്റ് മുന്നറിയിപ്പ്: നിങ്ങളുടെ മൾട്ടി-ചാനൽ മുന്നറിയിപ്പ് ഡെലിവറി വിജയകരമായി പ്രവർത്തിക്കുന്നു!",
    }

    result = await notify_farmer(
        user_id=current_user.id,
        event_type="test_alert",
        message_by_lang=messages,
    )

    return {
        "status": "dispatched",
        "details": result,
    }


@router.get("/logs")
async def get_notification_logs(
    limit: int = 20,
    current_user: MongoUser = Depends(get_current_user)
):
    """Fetches recent delivery logs for the authenticated farmer."""
    logs = await NotificationLog.find(
        NotificationLog.user_id == current_user.id
    ).sort(-NotificationLog.sent_at).limit(limit).to_list()

    if not logs:
        # Also try matching string id
        logs = await NotificationLog.find(
            NotificationLog.user_id == str(current_user.id)
        ).sort(-NotificationLog.sent_at).limit(limit).to_list()

    return [
        {
            "id": str(log.id),
            "channel": log.channel,
            "event_type": log.event_type,
            "message": log.message,
            "status": log.status,
            "sent_at": log.sent_at.isoformat(),
            "error": log.error,
        }
        for log in logs
    ]
