"""
CropShield / AgriGuard — Market Price Beanie Document Model
Mandi market prices sourced from Agmarknet (agmarknet.gov.in)
"""
from datetime import datetime
from typing import Optional
from beanie import Document
from pymongo import IndexModel, ASCENDING, DESCENDING
from pydantic import Field


class MarketPrice(Document):
    crop_type: str
    district: str
    price_per_kg: float
    date: str  # Format: "YYYY-MM-DD"
    source: str = "Agmarknet"
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "market_prices"
        indexes = [
            IndexModel(
                [("crop_type", ASCENDING), ("district", ASCENDING)],
                name="market_price_crop_dist_idx",
            ),
            IndexModel([("crop_type", ASCENDING)], name="market_price_crop_idx"),
            IndexModel([("date", DESCENDING)], name="market_price_date_idx"),
        ]
