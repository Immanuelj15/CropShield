"""
CropShield / AgriGuard — Job Run Log Beanie Document Model
Tracks scheduled and manual batch execution telemetry for external API data ingestion.
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from beanie import Document
from pymongo import IndexModel, DESCENDING, ASCENDING
from pydantic import Field


class JobRunLog(Document):
    job_name: str = "daily_ingestion_job"
    status: str = "success"  # "success" | "partial_failure" | "failed" | "running"
    run_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    duration_seconds: float = 0.0
    farms_processed: int = 0
    success_count: int = 0
    failed_count: int = 0
    failures: List[Dict[str, Any]] = Field(default_factory=list)
    is_manual: bool = False

    class Settings:
        name = "job_run_logs"
        indexes = [
            IndexModel([("job_name", ASCENDING), ("run_at", DESCENDING)], name="job_log_run_at_idx"),
            IndexModel([("status", ASCENDING)], name="job_log_status_idx"),
        ]
