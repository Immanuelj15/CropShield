"""
CropShield / AgriGuard — Chatbot Conversation Audit Log
Stores farmer dialogue history for intent auditability and gap analysis.
"""
from datetime import datetime
from typing import Optional
from beanie import Document, PydanticObjectId
from pymongo import IndexModel, ASCENDING, DESCENDING
from pydantic import Field


class ChatbotConversation(Document):
    user_id: Optional[PydanticObjectId] = None
    farm_id: Optional[PydanticObjectId] = None
    message: str
    reply: str
    detected_language: str = "en"
    intent_matched: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "chatbot_conversations"
        indexes = [
            IndexModel([("user_id", ASCENDING)], name="chat_user_id_idx"),
            IndexModel([("timestamp", DESCENDING)], name="chat_timestamp_idx"),
            IndexModel([("intent_matched", ASCENDING)], name="chat_intent_matched_idx"),
        ]
