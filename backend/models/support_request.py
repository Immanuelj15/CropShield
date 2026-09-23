"""
CropShield / AgriGuard — Farmer Support Request Beanie Document Model
Farmer diagnostic queries submitted to regional agronomists for tailored treatment response
"""
from datetime import datetime
from typing import Optional
from beanie import Document, PydanticObjectId
from pymongo import IndexModel, ASCENDING, DESCENDING
from pydantic import Field


class SupportRequest(Document):
    farmer_id: PydanticObjectId
    farmer_name: str
    farmer_email: str
    farm_id: Optional[PydanticObjectId] = None
    district: str = "Tamil Nadu"
    crop_type: str = "Cotton"
    query_text: str
    image_url: Optional[str] = None
    status: str = "pending"  # "pending" | "resolved"
    response_text: Optional[str] = None
    responded_by: Optional[PydanticObjectId] = None
    agronomist_name: Optional[str] = None
    responded_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "support_requests"
        indexes = [
            IndexModel([("farmer_id", ASCENDING)], name="support_farmer_id_idx"),
            IndexModel([("status", ASCENDING)], name="support_status_idx"),
            IndexModel([("district", ASCENDING)], name="support_district_idx"),
            IndexModel([("created_at", DESCENDING)], name="support_created_at_idx"),
        ]
