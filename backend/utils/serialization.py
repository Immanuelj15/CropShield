"""
CropShield — JSON Serialization Utilities
Helpers to convert non-standard types (pandas, numpy, datetimes) to JSON-compatible types.
"""

from datetime import date, datetime
import numpy as np
import pandas as pd
from typing import Any


def sanitize_for_json(obj: Any) -> Any:
    """
    Recursively walk through an object and convert non-serializable 
    types into JSON-compatible equivalents.
    """
    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple, set)):
        return [sanitize_for_json(v) for v in obj]
    elif isinstance(obj, (pd.Timestamp, datetime)):
        return obj.isoformat()
    elif isinstance(obj, date):
        return obj.isoformat()
    elif isinstance(obj, (np.integer, np.uint64)):
        return int(obj)
    elif isinstance(obj, (np.floating, np.float32, np.float64)):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return sanitize_for_json(obj.tolist())
    elif pd.isna(obj):
        return None
    return obj
