"""
CropShield / AgriGuard — Beanie Document Models Export
"""
from backend.models.user import User
from backend.models.farm import Farm
from backend.models.weather_snapshot import WeatherSnapshot
from backend.models.pest_warning_log import PestWarningLog
from backend.models.disease_detection import DiseaseDetection
from backend.models.regional_risk_grid import RegionalRiskGrid
from backend.models.advisory import PestDiseaseAdvisory
from backend.models.alert import Alert

DOCUMENT_MODELS = [
    User,
    Farm,
    WeatherSnapshot,
    PestWarningLog,
    DiseaseDetection,
    RegionalRiskGrid,
    PestDiseaseAdvisory,
    Alert,
]

__all__ = [
    "User",
    "Farm",
    "WeatherSnapshot",
    "PestWarningLog",
    "DiseaseDetection",
    "RegionalRiskGrid",
    "PestDiseaseAdvisory",
    "Alert",
    "DOCUMENT_MODELS",
]
