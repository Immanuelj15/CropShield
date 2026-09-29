"""
AgriGuard AI — APScheduler Background Job Orchestrator
Registers daily 5:00 AM IST climate data ingestion across all 38 Tamil Nadu districts,
6:00 AM activity reminders, 3-day NDVI ingestion, the hourly retry queue sweep and the
15-minute quiet-hours notification delivery.

All jobs run on the HTTP event loop (AsyncIOScheduler), so every job must keep blocking work in
worker threads. Each job uses misfire_grace_time=3600, coalesce=True, max_instances=1 so a busy loop
at trigger time delays a run instead of silently skipping it, and runs never overlap.
"""

import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from backend.jobs.daily_ingestion_job import run_daily_ingestion_job
from backend.jobs.retry_queue import run_retry_queue_worker
from backend.jobs.ndvi_ingestion_job import run_ndvi_ingestion_job
from backend.jobs.activity_reminder_job import run_activity_reminder_job
from backend.jobs.locks import queued_notification_lock

logger = logging.getLogger("cropshield.scheduler")

SCHEDULER_TIMEZONE = "Asia/Kolkata"

JOB_DEFAULTS = {
    "misfire_grace_time": 3600,
    "coalesce": True,
    "max_instances": 1,
}

scheduler = AsyncIOScheduler(timezone=SCHEDULER_TIMEZONE, job_defaults=JOB_DEFAULTS)


async def run_queued_notification_delivery():
    """Delivers notifications held during farmers' quiet hours (idempotent, non-overlapping)."""
    if queued_notification_lock.locked():
        return {"status": "skipped"}
    async with queued_notification_lock:
        from backend.services.notification_service import deliver_queued_notifications
        return await deliver_queued_notifications()


def start_scheduler() -> bool:
    """
    Starts the background AsyncIOScheduler. Idempotent: calling it again while running is a no-op.
    Must only be called after MongoDB/Beanie initialised successfully (the caller in main.py decides).
    Returns True if the scheduler is running after the call.
    """
    if scheduler.running:
        logger.info("APScheduler already running; start_scheduler() ignored.")
        return True
    try:
        # 1. Daily Climate Ingestion at 5:00 AM IST (Asia/Kolkata)
        scheduler.add_job(
            run_daily_ingestion_job,
            CronTrigger(hour=5, minute=0, timezone=SCHEDULER_TIMEZONE),
            id="daily_climate_ingestion_38_districts",
            name="Daily 38-District Climate Ingestion & Risk Scoring",
            replace_existing=True,
            **JOB_DEFAULTS,
        )

        # 2. Daily Activity Reminders & Smart Farming Alerts at 6:00 AM IST (Asia/Kolkata)
        scheduler.add_job(
            run_activity_reminder_job,
            CronTrigger(hour=6, minute=0, timezone=SCHEDULER_TIMEZONE),
            id="daily_farm_activity_reminders",
            name="Daily Farm Activity Reminders & Smart Alerts",
            replace_existing=True,
            **JOB_DEFAULTS,
        )

        # 3. Hourly Retry Queue Sweep for Failed Items
        scheduler.add_job(
            run_retry_queue_worker,
            IntervalTrigger(hours=1, timezone=SCHEDULER_TIMEZONE),
            id="hourly_retry_queue_worker",
            name="Hourly Ingestion Retry Queue Sweep",
            replace_existing=True,
            **JOB_DEFAULTS,
        )

        # 4. Sentinel-2 NDVI Satellite Ingestion Every 3 Days at 4:00 AM IST
        scheduler.add_job(
            run_ndvi_ingestion_job,
            CronTrigger(day="*/3", hour=4, minute=0, timezone=SCHEDULER_TIMEZONE),
            id="sentinel2_ndvi_satellite_ingestion",
            name="3-Day Sentinel-2 NDVI Satellite Vegetation Ingestion",
            replace_existing=True,
            **JOB_DEFAULTS,
        )

        # 5. Deliver notifications queued during quiet hours (every 15 minutes, e.g. 06:00 IST onwards)
        scheduler.add_job(
            run_queued_notification_delivery,
            CronTrigger(minute="*/15", timezone=SCHEDULER_TIMEZONE),
            id="queued_notification_delivery",
            name="Quiet-hours Queued Notification Delivery",
            replace_existing=True,
            **JOB_DEFAULTS,
        )

        scheduler.start()
        logger.info("APScheduler started: 4 AM NDVI (3-day), 5 AM climate, 6 AM reminders, hourly retry, "
                    "15-min queued notification delivery (Asia/Kolkata).")
        return True
    except Exception as e:
        logger.error("Could not start APScheduler: %s", e)
        return False


def shutdown_scheduler():
    """Gracefully shuts down APScheduler."""
    try:
        if scheduler.running:
            scheduler.shutdown(wait=False)
            logger.info("APScheduler gracefully shut down.")
    except Exception as e:
        logger.warning(f"Error shutting down scheduler: {e}")
