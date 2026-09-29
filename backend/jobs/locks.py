"""
CropShield / AgriGuard — Shared in-process job locks.

The scheduler (AsyncIOScheduler), the admin "run now" endpoints and the hourly retry sweep all run on
the same event loop, so a module-level asyncio.Lock is enough to stop overlapping ingestion runs from
processing the same farm twice. (Single-process only; a multi-worker deployment needs a Mongo lease.)
"""
import asyncio

# Guards run_daily_ingestion_job() and run_retry_queue_worker(): never run concurrently.
ingestion_lock = asyncio.Lock()

# Guards run_activity_reminder_job() (scheduled 06:00 run vs admin "run reminders now").
activity_reminder_lock = asyncio.Lock()

# Guards deliver_queued_notifications() (quiet-hours queue delivery).
queued_notification_lock = asyncio.Lock()
