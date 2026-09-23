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
from backend.models.treatment import Treatment
from backend.models.support_request import SupportRequest
from backend.models.retraining_log import RetrainingLog
from backend.models.job_run_log import JobRunLog
from backend.models.retry_queue import RetryQueue
from backend.models.chatbot_intent import ChatbotIntent
from backend.models.chatbot_conversation import ChatbotConversation

DOCUMENT_MODELS = [
    User,
    Farm,
    WeatherSnapshot,
    PestWarningLog,
    DiseaseDetection,
    RegionalRiskGrid,
    PestDiseaseAdvisory,
    Alert,
    Treatment,
    SupportRequest,
    RetrainingLog,
    JobRunLog,
    RetryQueue,
    ChatbotIntent,
    ChatbotConversation,
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
    "Treatment",
    "SupportRequest",
    "RetrainingLog",
    "JobRunLog",
    "RetryQueue",
    "ChatbotIntent",
    "ChatbotConversation",
    "DOCUMENT_MODELS",
]

