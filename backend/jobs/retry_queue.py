"""
AgriGuard AI — Automated Retry Queue Worker
Re-attempts failed farm climate ingestion and ML risk inference.
Triggered hourly or on demand to resolve temporary satellite API outages.
"""

import asyncio
import logging
from datetime import datetime
from typing import Dict, Any

from backend.models.farm import Farm as MongoFarm
from backend.models.retry_queue import RetryQueue as MongoRetryQueue
from backend.jobs.daily_ingestion_job import process_single_farm_ingestion

logger = logging.getLogger("cropshield.retry_queue")

MAX_RETRIES = 5


async def run_retry_queue_worker() -> Dict[str, Any]:
    """
    Scans pending items in the retry queue and re-executes ingestion pipeline.
    """
    pending_items = await MongoRetryQueue.find(
        {"status": "pending", "retry_count": {"$lt": MAX_RETRIES}}
    ).limit(50).to_list()

    if not pending_items:
        return {"status": "idle", "processed_count": 0, "resolved_count": 0}

    logger.info(f"Processing {len(pending_items)} pending retry queue entries...")
    resolved_count = 0
    failed_count = 0

    for item in pending_items:
        farm = await MongoFarm.get(item.farm_id)
        if not farm:
            item.status = "abandoned"
            item.last_attempt_at = datetime.utcnow()
            await item.save()
            continue

        item.last_attempt_at = datetime.utcnow()
        item.retry_count += 1

        try:
            await process_single_farm_ingestion(farm)
            item.status = "resolved"
            await item.save()
            resolved_count += 1
            logger.info(f"Successfully resolved retry item for farm {farm.farm_name}")
        except Exception as e:
            failed_count += 1
            item.error_message = str(e)
            if item.retry_count >= MAX_RETRIES:
                item.status = "abandoned"
            await item.save()
            logger.warning(f"Retry attempt {item.retry_count} failed for farm {farm.farm_name}: {e}")

        await asyncio.sleep(0.1)

    return {
        "status": "completed",
        "processed_count": len(pending_items),
        "resolved_count": resolved_count,
        "failed_count": failed_count,
        "timestamp": datetime.utcnow().isoformat()
    }
