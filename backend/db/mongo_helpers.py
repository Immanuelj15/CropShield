"""
CropShield / AgriGuard — Small helpers for atomic MongoDB operations on Beanie models.
Used where Beanie's document-level save() would race (upserts, atomic claims, arrayFilters).
"""
from typing import Any


def get_collection(model: Any):
    """
    Returns the underlying async collection for a Beanie Document class.
    Beanie 1.x exposes get_motor_collection(); Beanie 2.x renamed it to get_pymongo_collection().
    """
    getter = getattr(model, "get_pymongo_collection", None) or getattr(model, "get_motor_collection")
    return getter()


def is_duplicate_key_error(exc: BaseException) -> bool:
    """True if exc is a MongoDB duplicate-key (E11000) error, without importing pymongo eagerly."""
    code = getattr(exc, "code", None)
    if code == 11000:
        return True
    return "E11000" in str(exc) or "duplicate key" in str(exc).lower()
