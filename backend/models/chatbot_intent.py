"""
CropShield / AgriGuard — Chatbot Intent Beanie Document Model
Condition-based intent definitions with multilingual keywords and parameterized response templates.
Deterministic and auditable rule matching for safety-critical agricultural advisory.
"""
from datetime import datetime
from typing import Dict, List, Optional
from beanie import Document
from pymongo import IndexModel, ASCENDING
from pydantic import Field


class ChatbotIntent(Document):
    intent_id: str
    keywords: Dict[str, List[str]] = Field(default_factory=dict)
    requires_live_data: bool = False
    response_template: Dict[str, str] = Field(default_factory=dict)
    example_queries: Optional[Dict[str, List[str]]] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "chatbot_intents"
        indexes = [
            IndexModel([("intent_id", ASCENDING)], unique=True, name="intent_id_unique_idx")
        ]
