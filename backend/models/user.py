"""
CropShield / AgriGuard — User Beanie Document Model
"""
from datetime import datetime
from typing import Optional, Dict, Any, List
from beanie import Document, Indexed, PydanticObjectId
from pymongo import IndexModel, GEOSPHERE, ASCENDING
from pydantic import Field


class User(Document):
    name: str
    email: Indexed(str, unique=True)
    password_hash: str
    role: str = "farmer"  # "farmer" | "agronomist" | "admin"
    phone: Optional[str] = None
    region_assigned: Optional[str] = None  # agronomist only (e.g., "Coimbatore")
    farm_id: Optional[PydanticObjectId] = None  # farmer only (reference to farm)
    location: Optional[Dict[str, Any]] = None  # GeoJSON Point: {"type": "Point", "coordinates": [lon, lat]}
    district: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "users"
        indexes = [
            IndexModel([("location", GEOSPHERE)], name="user_location_2dsphere", sparse=True),
            IndexModel([("role", ASCENDING)], name="user_role_idx"),
        ]
