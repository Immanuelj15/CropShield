"""
CropShield — Application Configuration
Loads settings from environment variables / .env file
"""

import json
import logging
from functools import lru_cache
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("cropshield.config")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file="config/.env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # App
    APP_ENV: str = "development"
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000
    DEBUG: bool = True
    # JWT signing secret. MUST come from the environment (SECRET_KEY) — see
    # backend/utils/auth_utils.py for dev fallback / production enforcement.
    SECRET_KEY: str = ""

    # Database
    MONGODB_URL: str = "mongodb://localhost:27017/cropshield_db"
    MONGODB_DB_NAME: str = "cropshield_db"
    DATABASE_URL: str = "sqlite:///./cropshield.db"

    # NASA POWER
    NASA_POWER_BASE_URL: str = "https://power.larc.nasa.gov/api/temporal/daily/point"

    # ML Model paths
    MODEL_PATH: str = "ml/training/saved_models/pest_risk_model.joblib"
    SCALER_PATH: str = "ml/training/saved_models/scaler.joblib"
    FEATURE_NAMES_PATH: str = "ml/training/saved_models/feature_names.json"

    # CORS — comma-separated list or JSON array of allowed origins.
    # Kept as a plain string so a comma-separated env value does not break
    # pydantic-settings' JSON parsing of List fields. Use `cors_origins_list`.
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Default location: Kovilpatti, Tamil Nadu
    DEFAULT_LATITUDE: float = 9.1728
    DEFAULT_LONGITUDE: float = 77.8710
    DEFAULT_LOCATION: str = "Kovilpatti"

    # Multi-Channel Delivery: Web Push (VAPID)
    # Keys MUST be supplied via environment (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).
    # When either is missing, web push is disabled (see `push_enabled`).
    VAPID_PUBLIC_KEY: str = ""
    VAPID_PRIVATE_KEY: str = ""
    VAPID_CLAIMS_SUB: str = "mailto:admin@agriguard.in"

    # SMS / WhatsApp Gateway (Twilio / MSG91 fallback)
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_PHONE_NUMBER: str = ""
    TWILIO_WHATSAPP_NUMBER: str = ""

    @property
    def is_production(self) -> bool:
        return (self.APP_ENV or "").strip().lower() in ("production", "prod")

    @property
    def cors_origins_list(self) -> List[str]:
        raw = (self.CORS_ORIGINS or "").strip()
        if not raw:
            return []
        if raw.startswith("["):
            try:
                return [str(o).strip() for o in json.loads(raw) if str(o).strip()]
            except ValueError:
                pass
        return [o.strip() for o in raw.split(",") if o.strip()]

    @property
    def push_enabled(self) -> bool:
        """Web push is only enabled when both VAPID keys are provided via env."""
        return bool(self.VAPID_PUBLIC_KEY.strip() and self.VAPID_PRIVATE_KEY.strip())


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

if not settings.push_enabled:
    logger.warning(
        "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set in environment — web push notifications are DISABLED."
    )
