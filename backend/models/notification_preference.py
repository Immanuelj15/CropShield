"""
CropShield / AgriGuard — Farmer Notification Preferences Beanie Document Model
Multi-channel delivery preferences: Web Push, SMS, WhatsApp, Quiet Hours, Language
"""
from datetime import datetime
from typing import Optional, Dict, Any, Union
from beanie import Document, PydanticObjectId
from pymongo import IndexModel, ASCENDING
from pydantic import Field


class NotificationPreference(Document):
    user_id: Any  # PydanticObjectId or str
    push_subscription: Optional[Dict[str, Any]] = None  # Web Push PushSubscription JSON
    sms_enabled: bool = True
    whatsapp_enabled: bool = False
    phone_number: Optional[str] = "+919876543210"
    preferred_language: str = "en"  # "en" | "ta" | "hi"
    quiet_hours: Dict[str, str] = Field(default_factory=lambda: {"start": "21:00", "end": "06:00"})
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "notification_preferences"
        indexes = [
            IndexModel([("user_id", ASCENDING)], unique=True, name="notif_pref_user_id_idx"),
        ]
