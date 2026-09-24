"""
CropShield / AgriGuard — Farm Revenue Document Model
Records actual crop yield sales and mandi revenues received during a season.
"""
from datetime import datetime
from typing import Optional
from beanie import Document
from pymongo import IndexModel, ASCENDING, DESCENDING
from pydantic import Field


class FarmRevenue(Document):
    revenue_id: Optional[str] = Field(default=None, index=True)
    farm_id: str = Field(..., index=True)
    district: Optional[str] = Field(default=None)
    season: str = Field(..., index=True, description="e.g. 'Kharif 2025', 'Kharif 2026'")
    crop_type: str = Field(..., index=True)
    quantity_sold_kg: float = Field(..., ge=0.0)
    price_per_kg: float = Field(..., ge=0.0)
    total_revenue: float = Field(..., ge=0.0, description="quantity_sold_kg * price_per_kg")
    sale_date: str = Field(..., description="YYYY-MM-DD format")
    buyer_or_mandi: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "farm_revenue"
        indexes = [
            IndexModel([("farm_id", ASCENDING), ("season", ASCENDING)]),
            IndexModel([("crop_type", ASCENDING)]),
            IndexModel([("sale_date", DESCENDING)]),
        ]
