"""
AgriGuard multi-channel notification delivery (audit P1-1 / P1-4 / P1-5).
- No default phone number: SMS/WhatsApp are only attempted for a real, saved number.
- The legacy placeholder +919876543210 counts as "no phone".
- Quiet hours are evaluated in Asia/Kolkata.
Twilio / VAPID are blanked by conftest.py, so delivery here is always the simulated gateway.
"""
from datetime import datetime, timezone

import pytest

from backend.services.notification_service import (
    has_real_phone,
    is_quiet_hours,
    send_sms_gateway,
    send_whatsapp_gateway,
)

REAL_TEST_PHONE = "+919000000001"
PLACEHOLDER_PHONE = "+919876543210"


def test_quiet_hours_are_ist():
    qh = {"start": "21:00", "end": "06:00"}
    # 16:00 UTC = 21:30 IST -> quiet; 01:00 UTC = 06:30 IST -> not quiet
    assert is_quiet_hours(qh, now=datetime(2026, 9, 1, 16, 0, tzinfo=timezone.utc)) is True
    assert is_quiet_hours(qh, now=datetime(2026, 9, 1, 1, 0, tzinfo=timezone.utc)) is False
    # [start, end): exactly at end (06:00 IST = 00:30 UTC) quiet hours are over
    assert is_quiet_hours(qh, now=datetime(2026, 9, 1, 0, 30, tzinfo=timezone.utc)) is False
    assert is_quiet_hours(None) is False


def test_placeholder_phone_is_not_a_real_phone():
    assert has_real_phone(REAL_TEST_PHONE)
    assert has_real_phone("+91 98401 12345")
    assert not has_real_phone(PLACEHOLDER_PHONE)
    assert not has_real_phone(None)
    assert not has_real_phone("")
    assert not has_real_phone("call me")


def test_gateways_simulated_without_twilio_and_refuse_placeholder():
    assert send_sms_gateway(REAL_TEST_PHONE, "Test SMS delivery") is True
    assert send_whatsapp_gateway(REAL_TEST_PHONE, "Test WhatsApp delivery") is True
    with pytest.raises(ValueError):
        send_sms_gateway(PLACEHOLDER_PHONE, "must not be sent")
    with pytest.raises(ValueError):
        send_whatsapp_gateway("", "must not be sent")


@pytest.mark.asyncio
async def test_notify_farmer_skips_without_owner():
    from backend.services.notification_service import notify_farmer

    res = await notify_farmer(None, "high_risk", {"en": "x"})
    assert res["status"] == "skipped"


@pytest.mark.mongo
@pytest.mark.asyncio
async def test_notify_farmer_needs_a_real_phone(mongo_db):
    from beanie import PydanticObjectId
    from backend.models.notification_log import NotificationLog
    from backend.services.notification_service import get_or_create_preferences, notify_farmer

    user_id = PydanticObjectId()
    messages = {
        "en": "AgriGuard Alert: High pest risk detected.",
        "ta": "அக்ரிகார்ட் எச்சரிக்கை: அதிக ஆபத்து.",
        "hi": "एग्रीगार्ड चेतावनी: उच्च जोखिम।",
    }

    pref = await get_or_create_preferences(user_id)
    assert pref.phone_number is None  # no default/placeholder phone any more

    # Default preferences: nothing can be delivered, and that is logged
    res = await notify_farmer(user_id, "high_risk", messages)
    assert res["status"] == "failed"
    assert res.get("reason") == "no_channels"

    # With a real number (and high_risk bypassing quiet hours) SMS goes out via the simulated gateway
    pref.phone_number = REAL_TEST_PHONE
    await pref.save()
    res = await notify_farmer(user_id, "high_risk", messages)
    assert res["status"] == "delivered"
    assert res["channels"].get("sms") == "sent"

    sent = await NotificationLog.find_one({"user_id": user_id, "channel": "sms", "status": "sent"})
    assert sent is not None
