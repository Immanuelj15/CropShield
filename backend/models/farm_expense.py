"""
CropShield / AgriGuard — Farm Expense Document Model
Records actual real-world production expenses incurred during a season.
"""
from datetime import datetime
from typing import Optional
from beanie import Document
from pymongo import IndexModel, ASCENDING, DESCENDING
from pydantic import Field


class FarmExpense(Document):
    expense_id: Optional[str] = Field(default=None, index=True)
    farm_id: str = Field(..., index=True)
    district: Optional[str] = Field(default=None)
    season: str = Field(..., index=True, description="e.g. 'Kharif 2025', 'Kharif 2026'")
    crop_type: str = Field(..., index=True)
    category: str = Field(..., description="seeds | fertilizer | labor | irrigation | pesticides | other")
    amount: float = Field(..., ge=0.0)
    date: str = Field(..., description="YYYY-MM-DD format")
    notes: Optional[str] = Field(default="")
    receipt_photo_url: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "farm_expenses"
        indexes = [
            IndexModel([("farm_id", ASCENDING), ("season", ASCENDING)]),
            IndexModel([("category", ASCENDING)]),
            IndexModel([("date", DESCENDING)]),
        ]
