"""
CropShield — Application Configuration
Loads settings from environment variables / .env file
"""

from functools import lru_cache
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


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
    SECRET_KEY: str = "dev-secret-key-change-in-prod"

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

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:3000"]

    # Default location: Kovilpatti, Tamil Nadu
    DEFAULT_LATITUDE: float = 9.1728
    DEFAULT_LONGITUDE: float = 77.8710
    DEFAULT_LOCATION: str = "Kovilpatti"

    # Multi-Channel Delivery: Web Push (VAPID)
    VAPID_PUBLIC_KEY: str = "BLTr3VWEsgyLojk6spmf-bvbCQDI0Tc3lGE8VeMK1nwToCSnUwZA--ym1fzPa7LAPQgVePGlP0j_IaFbhgBbezE"
    VAPID_PRIVATE_KEY: str = "-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgLmmRCu/ByDADrjcv\nKcYPmVgpgWowRuV5l3p/PGWkb3KhRANCAAS0691VhLIMi6I5OrKZn/m72wkAyNE3\nN5RhPFXjCtZ8E6Akp1MGQPvsptX8z2uywD0IFXjxpT9I/yGhW4YAW3sx\n-----END PRIVATE KEY-----"
    VAPID_CLAIMS_SUB: str = "mailto:admin@agriguard.in"

    # SMS / WhatsApp Gateway (Twilio / MSG91 fallback)
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_PHONE_NUMBER: str = ""
    TWILIO_WHATSAPP_NUMBER: str = ""


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
