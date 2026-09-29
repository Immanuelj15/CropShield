"""
AgriGuard AI — Automated Retry Queue Worker
Re-attempts failed farm climate ingestion and ML risk inference.
Triggered hourly or on demand to resolve temporary satellite API outages.

Concurrency: shares backend.jobs.locks.ingestion_lock with run_daily_ingestion_job (skips if held).
Items are claimed atomically (find_one_and_update pending -> processing), so no item is processed twice.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, Any

from pymongo import ReturnDocument

from backend.models.farm import Farm as MongoFarm
from backend.models.retry_queue import RetryQueue as MongoRetryQueue
from backend.jobs.daily_ingestion_job import process_single_farm_ingestion
from backend.jobs.locks import ingestion_lock
from backend.db.mongo_helpers import get_collection

logger = logging.getLogger("cropshield.retry_queue")

MAX_RETRIES = 5
BATCH_LIMIT = 50
# A "processing" item older than this was orphaned by a crash and may be reclaimed
STALE_PROCESSING_AFTER = timedelta(hours=1)


async def run_retry_queue_worker() -> Dict[str, Any]:
    """Scans pending items in the retry queue and re-executes the ingestion pipeline."""
    if ingestion_lock.locked():
        logger.info("Retry queue sweep skipped: an ingestion run is in progress.")
        return {"status": "skipped", "reason": "ingestion_in_progress", "processed_count": 0, "resolved_count": 0}

    async with ingestion_lock:
        return await _run_retry_sweep()


async def _run_retry_sweep() -> Dict[str, Any]:
    coll = get_collection(MongoRetryQueue)
    processed = resolved_count = failed_count = 0
    seen_ids = []  # an item that fails goes back to "pending"; don't re-claim it in the same sweep

    for _ in range(BATCH_LIMIT):
        now = datetime.utcnow()
        item = await coll.find_one_and_update(
            {
                "_id": {"$nin": seen_ids},
                "retry_count": {"$lt": MAX_RETRIES},
                "$or": [
                    {"status": "pending"},
                    {"status": "processing", "last_attempt_at": {"$lt": now - STALE_PROCESSING_AFTER}},
                ],
            },
            {"$set": {"status": "processing", "last_attempt_at": now}, "$inc": {"retry_count": 1}},
            sort=[("created_at", 1)],
            return_document=ReturnDocument.AFTER,
        )
        if not item:
            break
        processed += 1
        item_id = item["_id"]
        seen_ids.append(item_id)
        retry_count = int(item.get("retry_count", 1))

        farm = await MongoFarm.get(item["farm_id"])
        if not farm:
            await coll.update_one({"_id": item_id}, {"$set": {"status": "abandoned", "error_message": "Farm no longer exists"}})
            continue

        try:
            await process_single_farm_ingestion(farm)
            await coll.update_one({"_id": item_id}, {"$set": {"status": "resolved"}})
            resolved_count += 1
            logger.info(f"Successfully resolved retry item for farm {farm.farm_name}")
        except Exception as e:
            failed_count += 1
            new_status = "abandoned" if retry_count >= MAX_RETRIES else "pending"
            try:
                await coll.update_one({"_id": item_id}, {"$set": {"status": new_status, "error_message": str(e)}})
            except Exception as upd_err:
                # e.g. a new pending item for this farm was created meanwhile (unique pending index)
                logger.warning("Could not return retry item %s to %s: %s", item_id, new_status, upd_err)
                await coll.update_one({"_id": item_id}, {"$set": {"status": "abandoned", "error_message": str(e)}})
            logger.warning(f"Retry attempt {retry_count} failed for farm {farm.farm_name}: {e}")

        await asyncio.sleep(0.1)

    if not processed:
        return {"status": "idle", "processed_count": 0, "resolved_count": 0}

    return {
        "status": "completed",
        "processed_count": processed,
        "resolved_count": resolved_count,
        "failed_count": failed_count,
        "timestamp": datetime.utcnow().isoformat()
    }
