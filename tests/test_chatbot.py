"""
AgriGuard AI — Multilingual Condition-Based Chatbot Tests
Tests Tamil, Hindi, and English rule matching, live database resolution,
and the POST /api/v1/chatbot/ask endpoint.
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from backend.main import app
from backend.db.mongodb import init_mongodb, close_mongodb
from backend.models.chatbot_intent import ChatbotIntent
from backend.models.chatbot_conversation import ChatbotConversation
from backend.services import chatbot_service
from scripts.seed_chatbot_intents import seed_chatbot_intents


@pytest_asyncio.fixture(scope="function")
async def client():
    await init_mongodb()
    await seed_chatbot_intents()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    await close_mongodb()


@pytest.mark.asyncio
async def test_detect_language():
    # Tamil Unicode block
    assert chatbot_service.detect_language("வணக்கம், என் பயிர் நிலை என்ன?") == "ta"
    assert chatbot_service.detect_language("இன்றைய வானிலை") == "ta"

    # Devanagari (Hindi) Unicode block
    assert chatbot_service.detect_language("नमस्ते, मेरी फसल कैसी है?") == "hi"
    assert chatbot_service.detect_language("आज का मौसम कैसा रहेगा?") == "hi"

    # English / Roman script
    assert chatbot_service.detect_language("What is my crop risk today?") == "en"
    assert chatbot_service.detect_language("Hello AgriGuard") == "en"


@pytest.mark.asyncio
async def test_condition_matching_engine(client: AsyncClient):
    # 1. English intent matching
    intent_en, lang_en = await chatbot_service.match_intent("What is my crop risk today?")
    assert intent_en is not None
    assert intent_en.intent_id == "today_risk"
    assert lang_en == "en"

    # 2. Tamil intent matching
    intent_ta, lang_ta = await chatbot_service.match_intent("இன்றைய ஆபத்து என்ன?")
    assert intent_ta is not None
    assert intent_ta.intent_id == "today_risk"
    assert lang_ta == "ta"

    # 3. Hindi intent matching
    intent_hi, lang_hi = await chatbot_service.match_intent("आज का मौसम कैसा है?")
    assert intent_hi is not None
    assert intent_hi.intent_id == "weather_today"
    assert lang_hi == "hi"

    # 4. Treatment advice in Tamil
    intent_treat, _ = await chatbot_service.match_intent("பூச்சிக்கு என்ன மருந்து தெளிக்க வேண்டும்?")
    assert intent_treat is not None
    assert intent_treat.intent_id == "treatment_advice"

    # 5. Greeting in Hindi
    intent_greet, _ = await chatbot_service.match_intent("नमस्ते AgriGuard")
    assert intent_greet is not None
    assert intent_greet.intent_id == "greeting"

    # 6. Unmatched query -> None (fallback trigger)
    intent_unmatched, _ = await chatbot_service.match_intent("random unrelated gibberish xyz123")
    assert intent_unmatched is None


@pytest.mark.asyncio
async def test_chatbot_ask_endpoint_and_audit_logging(client: AsyncClient):
    # 1. Authenticate as farmer
    login_resp = await client.post("/api/v1/auth/login", json={
        "email": "farmer@cropshield.org",
        "password": "farmer123"
    })
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Send English question: "What is my risk today?"
    resp_en = await client.post(
        "/api/v1/chatbot/ask",
        headers=headers,
        json={"message": "What is my risk today?", "language": "en"}
    )
    assert resp_en.status_code == 200
    data_en = resp_en.json()
    assert data_en["intent_matched"] == "today_risk"
    assert data_en["detected_language"] == "en"
    assert "risk for" in data_en["reply"].lower()
    assert len(data_en["suggested_queries"]) > 0

    # 3. Send Tamil question: "இன்றைய வானிலை எப்படி?"
    resp_ta = await client.post(
        "/api/v1/chatbot/ask",
        headers=headers,
        json={"message": "இன்றைய வானிலை எப்படி?"}
    )
    assert resp_ta.status_code == 200
    data_ta = resp_ta.json()
    assert data_ta["intent_matched"] == "weather_today"
    assert data_ta["detected_language"] == "ta"
    assert "இன்று:" in data_ta["reply"] or "°c" in data_ta["reply"].lower()

    # 4. Send Hindi question: "नमस्ते"
    resp_hi = await client.post(
        "/api/v1/chatbot/ask",
        headers=headers,
        json={"message": "नमस्ते"}
    )
    assert resp_hi.status_code == 200
    data_hi = resp_hi.json()
    assert data_hi["intent_matched"] == "greeting"
    assert data_hi["detected_language"] == "hi"
    assert "नमस्ते" in data_hi["reply"]

    # 5. Verify conversation logging in MongoDB
    logged_convo = await ChatbotConversation.find(
        ChatbotConversation.intent_matched == "today_risk"
    ).first_or_none()
    assert logged_convo is not None
    assert "risk today" in logged_convo.message.lower()

    # 6. Test GET /api/v1/chatbot/intents
    intents_resp = await client.get("/api/v1/chatbot/intents?lang=ta")
    assert intents_resp.status_code == 200
    intents_data = intents_resp.json()
    assert intents_data["total_intents"] >= 5
    assert len(intents_data["suggested_chips"]) > 0
