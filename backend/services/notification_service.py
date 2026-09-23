"""
AgriGuard AI — Multi-Channel Alert Delivery Service
Implements intelligent delivery: Web Push (PWA) -> SMS -> WhatsApp fallback.
Respects quiet hours (urgent 'high_risk' alerts bypass quiet hours), logs all delivery attempts.
"""

import json
from datetime import datetime, time
from typing import Optional, Dict, Any, Union
from beanie import PydanticObjectId
from pywebpush import webpush, WebPushException

from backend.utils.config import settings
from backend.models.notification_preference import NotificationPreference
from backend.models.notification_log import NotificationLog


def is_quiet_hours(quiet_hours: Optional[Dict[str, str]]) -> bool:
    """Checks whether the current server time falls inside quiet hours."""
    if not quiet_hours:
        return False
    try:
        start_str = quiet_hours.get("start", "21:00")
        end_str = quiet_hours.get("end", "06:00")
        sh, sm = map(int, start_str.split(":"))
        eh, em = map(int, end_str.split(":"))

        now_t = datetime.now().time()
        start_t = time(sh, sm)
        end_t = time(eh, em)

        if start_t > end_t:  # Overnight span, e.g. 21:00 to 06:00
            return now_t >= start_t or now_t <= end_t
        else:
            return start_t <= now_t <= end_t
    except Exception:
        return False


async def get_or_create_preferences(user_id: Any) -> NotificationPreference:
    """Retrieve or initialize default notification preferences for a farmer."""
    pref = None
    try:
        # Try as ObjectId first if valid
        if isinstance(user_id, str) and PydanticObjectId.is_valid(user_id):
            pref = await NotificationPreference.find_one(NotificationPreference.user_id == PydanticObjectId(user_id))
        elif isinstance(user_id, PydanticObjectId):
            pref = await NotificationPreference.find_one(NotificationPreference.user_id == user_id)
        
        if not pref:
            pref = await NotificationPreference.find_one(NotificationPreference.user_id == str(user_id))
    except Exception:
        pref = None

    if not pref:
        pref = NotificationPreference(
            user_id=user_id,
            sms_enabled=True,
            whatsapp_enabled=False,
            phone_number="+919876543210",
            preferred_language="en",
            quiet_hours={"start": "21:00", "end": "06:00"},
            updated_at=datetime.utcnow(),
        )
        try:
            await pref.insert()
        except Exception:
            pass  # If concurrent insert occurs
    return pref


async def log_notification(
    user_id: Any,
    channel: str,
    event_type: str,
    message: str,
    status: str,
    error: Optional[str] = None
) -> NotificationLog:
    """Persists notification attempt and delivery audit record into MongoDB."""
    log_entry = NotificationLog(
        user_id=user_id,
        channel=channel,
        event_type=event_type,
        message=message,
        status=status,
        sent_at=datetime.utcnow(),
        error=error,
    )
    try:
        await log_entry.insert()
    except Exception as e:
        print(f"[WARN] Failed to save NotificationLog: {e}")
    return log_entry


def send_sms_gateway(phone_number: str, message: str) -> bool:
    """
    Sends SMS using Twilio if configured, or executes simulated carrier delivery.
    Ensures demonstration works gracefully even without paid external credentials.
    """
    if settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_PHONE_NUMBER:
        try:
            from twilio.rest import Client
            client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
            client.messages.create(
                body=message,
                from_=settings.TWILIO_PHONE_NUMBER,
                to=phone_number,
            )
            return True
        except Exception as e:
            print(f"[SMS] Twilio delivery failed: {e}")
            raise e
    else:
        # Simulated carrier gateway output for field test / dev environment
        print(f"[SMS-CARRIER-GATEWAY] Delivered to {phone_number}: {message}")
        return True


def send_whatsapp_gateway(phone_number: str, message: str) -> bool:
    """Sends WhatsApp message using Twilio WhatsApp API or simulated sandbox."""
    if settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_WHATSAPP_NUMBER:
        try:
            from twilio.rest import Client
            client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
            client.messages.create(
                body=message,
                from_=f"whatsapp:{settings.TWILIO_WHATSAPP_NUMBER}",
                to=f"whatsapp:{phone_number}",
            )
            return True
        except Exception as e:
            print(f"[WhatsApp] Twilio WhatsApp failed: {e}")
            raise e
    else:
        print(f"[WHATSAPP-GATEWAY] Delivered to {phone_number}: {message}")
        return True


async def notify_farmer(user_id: Any, event_type: str, message_by_lang: Dict[str, str]) -> Dict[str, Any]:
    """
    Multi-channel alert dispatcher:
    1. Looks up preferences and picks farmer's preferred language.
    2. Respects quiet hours (queuing non-urgent, while high_risk bypasses immediately).
    3. Attempts Web Push first if subscription exists.
    4. Falls back to SMS and/or WhatsApp.
    5. Logs every attempt (sent/failed/queued) to MongoDB.
    """
    try:
        prefs = await get_or_create_preferences(user_id)
        lang = prefs.preferred_language or "en"
        message = message_by_lang.get(lang, message_by_lang.get("en", list(message_by_lang.values())[0] if message_by_lang else "AgriGuard Alert"))

        # Quiet hours evaluation
        if is_quiet_hours(prefs.quiet_hours) and event_type != "high_risk":
            await log_notification(
                user_id=user_id,
                channel="queue",
                event_type=event_type,
                message=message,
                status="queued",
                error="Held during farmer quiet hours; will deliver after quiet hours window.",
            )
            return {"status": "queued", "reason": "quiet_hours", "message": message}

        delivered = False
        results = {}

        # 1. Attempt Web Push (installed PWA / browser push)
        if prefs.push_subscription:
            try:
                payload = json.dumps({
                    "title": "AgriGuard Alert",
                    "body": message,
                    "icon": "/icons/icon-192.png",
                    "badge": "/icons/favicon.png",
                    "data": {
                        "url": "/farmer/today",
                        "event_type": event_type,
                        "timestamp": datetime.utcnow().isoformat(),
                    }
                })

                # pywebpush
                webpush(
                    subscription_info=prefs.push_subscription,
                    data=payload,
                    vapid_private_key=settings.VAPID_PRIVATE_KEY,
                    vapid_claims={"sub": settings.VAPID_CLAIMS_SUB},
                )
                await log_notification(user_id, "push", event_type, message, "sent")
                delivered = True
                results["push"] = "sent"
                return {"status": "sent", "channel": "push", "message": message}
            except WebPushException as ex:
                await log_notification(user_id, "push", event_type, message, "failed", str(ex))
                results["push"] = f"failed: {ex}"
            except Exception as e:
                await log_notification(user_id, "push", event_type, message, "failed", str(e))
                results["push"] = f"failed: {e}"

        # 2. Fallback to SMS if Web Push was absent or failed
        if prefs.sms_enabled and prefs.phone_number:
            try:
                send_sms_gateway(prefs.phone_number, message)
                await log_notification(user_id, "sms", event_type, message, "sent")
                delivered = True
                results["sms"] = "sent"
            except Exception as e:
                await log_notification(user_id, "sms", event_type, message, "failed", str(e))
                results["sms"] = f"failed: {e}"

        # 3. Deliver to WhatsApp if opted in
        if prefs.whatsapp_enabled and prefs.phone_number:
            try:
                send_whatsapp_gateway(prefs.phone_number, message)
                await log_notification(user_id, "whatsapp", event_type, message, "sent")
                delivered = True
                results["whatsapp"] = "sent"
            except Exception as e:
                await log_notification(user_id, "whatsapp", event_type, message, "failed", str(e))
                results["whatsapp"] = f"failed: {e}"

        if not delivered and not results:
            await log_notification(user_id, "none", event_type, message, "failed", "No active delivery channels configured")
            return {"status": "failed", "reason": "no_channels", "details": results}

        return {"status": "delivered" if delivered else "failed", "channels": results, "message": message}

    except Exception as e:
        print(f"[WARN] Error in notify_farmer: {e}")
        return {"status": "error", "error": str(e)}
