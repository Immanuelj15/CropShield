"""
CropShield / AgriGuard — Season P&L Summary Document Model
Aggregates actual expenses vs revenues and compares against AI predicted profit ranges.
"""
from datetime import datetime
from typing import Dict, Any, Optional
from beanie import Document
from pymongo import IndexModel, ASCENDING, DESCENDING
from pydantic import Field


class SeasonPnlSummary(Document):
    farm_id: str = Field(..., index=True)
    season: str = Field(..., index=True, description="e.g. 'Kharif 2025', 'Kharif 2026'")
    crop_type: Optional[str] = Field(default="All")
    district: Optional[str] = Field(default=None)
    total_expenses: float = Field(default=0.0)
    expense_breakdown: Dict[str, float] = Field(
        default_factory=lambda: {
            "seeds": 0.0,
            "fertilizer": 0.0,
            "labor": 0.0,
            "irrigation": 0.0,
            "pesticides": 0.0,
            "other": 0.0,
        }
    )
    total_revenue: float = Field(default=0.0)
    actual_profit: float = Field(default=0.0, description="total_revenue - total_expenses")
    predicted_profit_range: Optional[Dict[str, float]] = Field(
        default=None,
        description="{'min': float, 'max': float} from pre-season Crop Recommendation / Economic Impact"
    )
    prediction_accuracy: Optional[Dict[str, Any]] = Field(
        default=None,
        description="{'actual_within_predicted_range': bool, 'deviation_pct': float}"
    )
    last_updated: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "season_pnl_summary"
        indexes = [
            IndexModel([("farm_id", ASCENDING), ("season", ASCENDING)], unique=True),
            IndexModel([("crop_type", ASCENDING)]),
            IndexModel([("last_updated", DESCENDING)]),
        ]
