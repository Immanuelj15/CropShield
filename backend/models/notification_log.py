"""
CropShield / AgriGuard — Multi-Channel Notification Delivery Log Beanie Document Model
Auditable delivery records across Web Push, SMS, and WhatsApp
"""
from datetime import datetime
from typing import Optional, Any
from beanie import Document, PydanticObjectId
from pymongo import IndexModel, ASCENDING, DESCENDING
from pydantic import Field


class NotificationLog(Document):
    user_id: Optional[Any] = None
    channel: str  # "push" | "sms" | "whatsapp"
    event_type: str  # "high_risk" | "regional_outbreak" | "treat_now_recommendation" | "test"
    message: str
    status: str = "sent"  # "sent" | "failed" | "queued"
    sent_at: datetime = Field(default_factory=datetime.utcnow)
    error: Optional[str] = None

    class Settings:
        name = "notification_log"
        indexes = [
            IndexModel([("user_id", ASCENDING), ("sent_at", DESCENDING)], name="notif_log_user_date_idx"),
            IndexModel([("channel", ASCENDING)], name="notif_log_channel_idx"),
            IndexModel([("event_type", ASCENDING)], name="notif_log_event_idx"),
            IndexModel([("sent_at", DESCENDING)], name="notif_log_sent_at_idx"),
        ]
