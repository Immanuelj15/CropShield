"""
AgriGuard AI — APScheduler Background Job Orchestrator
Registers daily 5:00 AM IST climate data ingestion across all 38 Tamil Nadu districts,
plus hourly retry queue processing.
"""

import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from backend.jobs.daily_ingestion_job import run_daily_ingestion_job
from backend.jobs.retry_queue import run_retry_queue_worker

logger = logging.getLogger("cropshield.scheduler")

scheduler = AsyncIOScheduler()


def start_scheduler():
    """Starts the background AsyncIOScheduler with daily and hourly jobs."""
    try:
        # 1. Daily Climate Ingestion at 5:00 AM IST (Asia/Kolkata)
        scheduler.add_job(
            run_daily_ingestion_job,
            CronTrigger(hour=5, minute=0, timezone="Asia/Kolkata"),
            id="daily_climate_ingestion_38_districts",
            name="Daily 38-District Climate Ingestion & Risk Scoring",
            replace_existing=True
        )

        # 2. Hourly Retry Queue Sweep for Failed Items
        scheduler.add_job(
            run_retry_queue_worker,
            IntervalTrigger(hours=1),
            id="hourly_retry_queue_worker",
            name="Hourly Ingestion Retry Queue Sweep",
            replace_existing=True
        )

        scheduler.start()
        logger.info("APScheduler started: Daily 5:00 AM IST ingestion & Hourly retry sweep active.")
    except Exception as e:
        logger.warning(f"Could not start APScheduler: {e}")


def shutdown_scheduler():
    """Gracefully shuts down APScheduler."""
    try:
        if scheduler.running:
            scheduler.shutdown(wait=False)
            logger.info("APScheduler gracefully shut down.")
    except Exception as e:
        logger.warning(f"Error shutting down scheduler: {e}")
