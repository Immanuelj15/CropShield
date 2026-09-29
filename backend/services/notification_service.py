"""
AgriGuard AI — Multi-Channel Alert Delivery Service
Implements intelligent delivery: Web Push (PWA) -> SMS -> WhatsApp fallback.
Respects quiet hours (evaluated in Asia/Kolkata; urgent 'high_risk' alerts bypass quiet hours),
logs all delivery attempts, and delivers alerts held during quiet hours via
`deliver_queued_notifications()` (scheduled job).

All blocking network I/O (pywebpush, Twilio) runs in worker threads with explicit timeouts so a
stalled push endpoint or carrier API can never freeze the shared asyncio event loop.
"""

import re
import json
import asyncio
import logging
from datetime import datetime, time, timedelta
from typing import Optional, Dict, Any
from zoneinfo import ZoneInfo

from beanie import PydanticObjectId

try:  # pywebpush is optional at import time (dev envs without it still boot)
    from pywebpush import webpush, WebPushException
except ImportError:  # pragma: no cover
    webpush = None

    class WebPushException(Exception):  # type: ignore[no-redef]
        response = None

from backend.utils.config import settings
from backend.models.notification_preference import NotificationPreference
from backend.models.notification_log import NotificationLog
from backend.db.mongo_helpers import get_collection

logger = logging.getLogger("cropshield.notifications")

IST = ZoneInfo("Asia/Kolkata")

# Network timeouts (seconds) for external delivery providers
PUSH_TIMEOUT_SECONDS = 10
TWILIO_TIMEOUT_SECONDS = 10

# Events delivered immediately even during quiet hours
QUIET_HOURS_BYPASS_EVENTS = {"high_risk"}

# Queued (quiet-hours) notifications older than this are expired instead of delivered late
QUEUED_MAX_AGE_HOURS = 24

# Legacy placeholder number that older code wrote into preferences; never deliver to it.
PLACEHOLDER_PHONE_NUMBERS = {"+919876543210"}

_PHONE_RE = re.compile(r"^\+?\d{8,15}$")


def has_real_phone(phone_number: Optional[str]) -> bool:
    """True only for a plausible, non-placeholder phone number."""
    if not phone_number:
        return False
    cleaned = re.sub(r"[\s\-()]", "", str(phone_number))
    if cleaned in PLACEHOLDER_PHONE_NUMBERS:
        return False
    return bool(_PHONE_RE.match(cleaned))


def is_quiet_hours(quiet_hours: Optional[Dict[str, str]], now: Optional[datetime] = None) -> bool:
    """
    Checks whether the current time in Asia/Kolkata falls inside quiet hours.
    The window is [start, end): at exactly `end` quiet hours are over.
    """
    if not quiet_hours:
        return False
    try:
        start_str = quiet_hours.get("start", "21:00")
        end_str = quiet_hours.get("end", "06:00")
        sh, sm = map(int, start_str.split(":"))
        eh, em = map(int, end_str.split(":"))

        local_now = (now.astimezone(IST) if (now and now.tzinfo) else (now or datetime.now(IST)))
        now_t = local_now.time().replace(tzinfo=None)
        start_t = time(sh, sm)
        end_t = time(eh, em)

        if start_t == end_t:
            return False
        if start_t > end_t:  # Overnight span, e.g. 21:00 to 06:00
            return now_t >= start_t or now_t < end_t
        return start_t <= now_t < end_t
    except Exception as e:
        logger.warning("Invalid quiet_hours %r: %s", quiet_hours, e)
        return False


def _user_id_variants(user_id: Any):
    """Preferences may have been stored with an ObjectId or its string form."""
    variants = []
    if isinstance(user_id, PydanticObjectId):
        variants.append(user_id)
    elif isinstance(user_id, str) and PydanticObjectId.is_valid(user_id):
        variants.append(PydanticObjectId(user_id))
    variants.append(str(user_id))
    return variants


async def _find_preferences(user_id: Any) -> Optional[NotificationPreference]:
    for uid in _user_id_variants(user_id):
        try:
            pref = await NotificationPreference.find_one(NotificationPreference.user_id == uid)
        except Exception as e:
            logger.warning("NotificationPreference lookup failed for %s: %s", user_id, e)
            pref = None
        if pref:
            return pref
    return None


async def get_or_create_preferences(user_id: Any) -> NotificationPreference:
    """Retrieve or initialize default notification preferences for a farmer (no phone by default)."""
    pref = await _find_preferences(user_id)
    if pref:
        return pref

    pref = NotificationPreference(
        user_id=user_id,
        sms_enabled=True,          # SMS is only attempted once a real phone number is saved
        whatsapp_enabled=False,
        phone_number=None,
        preferred_language="en",
        quiet_hours={"start": "21:00", "end": "06:00"},
        updated_at=datetime.utcnow(),
    )
    try:
        await pref.insert()
    except Exception as e:
        # Concurrent insert hit the unique user_id index: return the stored document instead.
        existing = await _find_preferences(user_id)
        if existing:
            return existing
        logger.warning("Could not persist NotificationPreference for %s: %s", user_id, e)
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
        logger.warning("Failed to save NotificationLog: %s", e)
    return log_entry


# ── Blocking provider calls (run via asyncio.to_thread) ─────────────

_twilio_client = None


def _get_twilio_client():
    """Lazily builds a Twilio client whose HTTP transport has an explicit timeout."""
    global _twilio_client
    if _twilio_client is None:
        from twilio.rest import Client
        try:
            from twilio.http.http_client import TwilioHttpClient
            http_client = TwilioHttpClient(timeout=TWILIO_TIMEOUT_SECONDS)
            _twilio_client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN, http_client=http_client)
        except ImportError:
            _twilio_client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    return _twilio_client


def send_sms_gateway(phone_number: str, message: str) -> bool:
    """
    Sends SMS using Twilio if configured, or executes simulated carrier delivery.
    BLOCKING — call via `await asyncio.to_thread(...)` (or `send_sms_async`) from async code.
    """
    if not has_real_phone(phone_number):
        raise ValueError("No valid phone number on file")
    if settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_PHONE_NUMBER:
        try:
            _get_twilio_client().messages.create(
                body=message,
                from_=settings.TWILIO_PHONE_NUMBER,
                to=phone_number,
            )
            return True
        except Exception as e:
            logger.warning("[SMS] Twilio delivery failed: %s", e)
            raise
    # Simulated carrier gateway output for field test / dev environment
    logger.info("[SMS-CARRIER-GATEWAY] (simulated) Delivered to %s: %s", phone_number, message)
    return True


def send_whatsapp_gateway(phone_number: str, message: str) -> bool:
    """Sends WhatsApp message using Twilio WhatsApp API or simulated sandbox. BLOCKING."""
    if not has_real_phone(phone_number):
        raise ValueError("No valid phone number on file")
    if settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_WHATSAPP_NUMBER:
        try:
            _get_twilio_client().messages.create(
                body=message,
                from_=f"whatsapp:{settings.TWILIO_WHATSAPP_NUMBER}",
                to=f"whatsapp:{phone_number}",
            )
            return True
        except Exception as e:
            logger.warning("[WhatsApp] Twilio WhatsApp failed: %s", e)
            raise
    logger.info("[WHATSAPP-GATEWAY] (simulated) Delivered to %s: %s", phone_number, message)
    return True


async def send_sms_async(phone_number: str, message: str) -> bool:
    return await asyncio.to_thread(send_sms_gateway, phone_number, message)


async def send_whatsapp_async(phone_number: str, message: str) -> bool:
    return await asyncio.to_thread(send_whatsapp_gateway, phone_number, message)


def _send_webpush_blocking(subscription_info: Dict[str, Any], payload: str) -> None:
    if webpush is None:
        raise RuntimeError("pywebpush is not installed")
    webpush(
        subscription_info=subscription_info,
        data=payload,
        vapid_private_key=settings.VAPID_PRIVATE_KEY,
        vapid_claims={"sub": settings.VAPID_CLAIMS_SUB},
        timeout=PUSH_TIMEOUT_SECONDS,
    )


async def _prune_push_subscription(prefs: NotificationPreference) -> None:
    """Removes a push subscription the push service reported as gone (404/410)."""
    prefs.push_subscription = None
    if getattr(prefs, "id", None) is None:
        return
    try:
        await get_collection(NotificationPreference).update_one(
            {"_id": prefs.id},
            {"$set": {"push_subscription": None, "updated_at": datetime.utcnow()}},
        )
        logger.info("Pruned expired push subscription for user %s", prefs.user_id)
    except Exception as e:
        logger.warning("Failed to prune push subscription for user %s: %s", prefs.user_id, e)


# ── Dispatcher ─────────────────────────────────────────────────────

async def _deliver(prefs: NotificationPreference, user_id: Any, event_type: str, message: str) -> Dict[str, Any]:
    """Delivers over the available channels (no quiet-hours check). Logs every attempt."""
    delivered = False
    results: Dict[str, str] = {}

    # 1. Attempt Web Push (installed PWA / browser push) — only when VAPID keys are configured
    if prefs.push_subscription and getattr(settings, "VAPID_PRIVATE_KEY", None):
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
            await asyncio.to_thread(_send_webpush_blocking, prefs.push_subscription, payload)
            await log_notification(user_id, "push", event_type, message, "sent")
            return {"status": "sent", "channel": "push", "message": message}
        except WebPushException as ex:
            status_code = getattr(getattr(ex, "response", None), "status_code", None)
            if status_code in (404, 410):
                await _prune_push_subscription(prefs)
            await log_notification(user_id, "push", event_type, message, "failed", str(ex))
            results["push"] = f"failed: {ex}"
        except Exception as e:
            await log_notification(user_id, "push", event_type, message, "failed", str(e))
            results["push"] = f"failed: {e}"

    phone_ok = has_real_phone(prefs.phone_number)

    # 2. Fallback to SMS if Web Push was absent or failed (only with a real phone number)
    if prefs.sms_enabled and phone_ok:
        try:
            await send_sms_async(prefs.phone_number, message)
            await log_notification(user_id, "sms", event_type, message, "sent")
            delivered = True
            results["sms"] = "sent"
        except Exception as e:
            await log_notification(user_id, "sms", event_type, message, "failed", str(e))
            results["sms"] = f"failed: {e}"

    # 3. Deliver to WhatsApp if opted in
    if prefs.whatsapp_enabled and phone_ok:
        try:
            await send_whatsapp_async(prefs.phone_number, message)
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


async def notify_farmer(user_id: Any, event_type: str, message_by_lang: Dict[str, str]) -> Dict[str, Any]:
    """
    Multi-channel alert dispatcher:
    1. Skips entirely when there is no real user (e.g. seeded reference farms without owner_id).
    2. Looks up preferences and picks farmer's preferred language.
    3. Respects quiet hours in Asia/Kolkata (non-urgent alerts are queued and delivered by
       deliver_queued_notifications() once quiet hours end; high_risk bypasses immediately).
    4. Attempts Web Push first if subscription exists, then SMS/WhatsApp (real phone only).
    5. Logs every attempt (sent/failed/queued) to MongoDB.
    """
    if not user_id:
        logger.info("notify_farmer skipped for event %s: no owner user id", event_type)
        return {"status": "skipped", "reason": "no_owner"}
    try:
        prefs = await get_or_create_preferences(user_id)
        lang = prefs.preferred_language or "en"
        message = message_by_lang.get(lang, message_by_lang.get("en", list(message_by_lang.values())[0] if message_by_lang else "AgriGuard Alert"))

        # Quiet hours evaluation (IST)
        if event_type not in QUIET_HOURS_BYPASS_EVENTS and is_quiet_hours(prefs.quiet_hours):
            await log_notification(
                user_id=user_id,
                channel="queue",
                event_type=event_type,
                message=message,
                status="queued",
                error="Held during farmer quiet hours; will deliver after quiet hours window.",
            )
            return {"status": "queued", "reason": "quiet_hours", "message": message}

        return await _deliver(prefs, user_id, event_type, message)

    except Exception as e:
        logger.warning("Error in notify_farmer: %s", e)
        return {"status": "error", "error": str(e)}


async def deliver_queued_notifications(limit: int = 500) -> Dict[str, Any]:
    """
    Scheduled job: delivers notifications that were held during quiet hours.
    Idempotent — each queued log is claimed atomically (queued -> delivering) before sending, so
    overlapping runs can never deliver the same item twice. Items whose owner is still inside
    quiet hours are released back to `queued`; items older than QUEUED_MAX_AGE_HOURS expire.
    """
    coll = get_collection(NotificationLog)
    now = datetime.utcnow()
    stats = {"delivered": 0, "requeued": 0, "expired": 0, "failed": 0}

    try:
        from pymongo import ReturnDocument
    except ImportError:  # pragma: no cover
        ReturnDocument = None

    # Expire stale queued items in one shot
    try:
        res = await coll.update_many(
            {"status": "queued", "sent_at": {"$lt": now - timedelta(hours=QUEUED_MAX_AGE_HOURS)}},
            {"$set": {"status": "expired", "error": "Quiet-hours hold expired before delivery"}},
        )
        stats["expired"] = getattr(res, "modified_count", 0)
    except Exception as e:
        logger.warning("Could not expire stale queued notifications: %s", e)

    # Reclaim items stuck in 'delivering' by a crashed run
    try:
        await coll.update_many(
            {"status": "delivering", "claimed_at": {"$lt": now - timedelta(minutes=30)}},
            {"$set": {"status": "queued"}},
        )
    except Exception as e:
        logger.debug("Could not reclaim stale delivering notifications: %s", e)

    requeue_ids = []
    for _ in range(limit):
        kwargs = {"return_document": ReturnDocument.AFTER} if ReturnDocument else {}
        doc = await coll.find_one_and_update(
            {"status": "queued", "_id": {"$nin": requeue_ids}},
            {"$set": {"status": "delivering", "claimed_at": datetime.utcnow()}},
            sort=[("sent_at", 1)],
            **kwargs,
        )
        if not doc:
            break

        user_id = doc.get("user_id")
        event_type = doc.get("event_type", "alert")
        message = doc.get("message", "")
        try:
            prefs = await _find_preferences(user_id) if user_id else None
            if prefs is None:
                await coll.update_one({"_id": doc["_id"]}, {"$set": {"status": "failed", "error": "No notification preferences / owner"}})
                stats["failed"] += 1
                continue
            if is_quiet_hours(prefs.quiet_hours):
                await coll.update_one({"_id": doc["_id"]}, {"$set": {"status": "queued"}})
                requeue_ids.append(doc["_id"])
                stats["requeued"] += 1
                continue

            result = await _deliver(prefs, user_id, event_type, message)
            final_status = "delivered_from_queue" if result.get("status") in ("sent", "delivered") else "failed"
            await coll.update_one(
                {"_id": doc["_id"]},
                {"$set": {"status": final_status, "delivered_at": datetime.utcnow(),
                          "error": None if final_status != "failed" else str(result)}},
            )
            stats["delivered" if final_status != "failed" else "failed"] += 1
        except Exception as e:
            stats["failed"] += 1
            logger.warning("Queued notification %s delivery error: %s", doc.get("_id"), e)
            try:
                await coll.update_one({"_id": doc["_id"]}, {"$set": {"status": "failed", "error": str(e)}})
            except Exception:
                logger.exception("Could not mark queued notification %s as failed", doc.get("_id"))

    if any(stats.values()):
        logger.info("Queued notification delivery: %s", stats)
    return {"status": "completed", **stats, "timestamp": now.isoformat()}
