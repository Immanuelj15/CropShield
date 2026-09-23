"""
AgriGuard AI — Multilingual Condition-Based Farmer Chatbot API
Supports Tamil (தமிழ்), Hindi (हिंदी), and English (en).
Deterministic rule-matching engine for verifiable, zero-cost agricultural advisory.
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from beanie import PydanticObjectId

from backend.models.user import User as MongoUser
from backend.models.farm import Farm as MongoFarm
from backend.models.chatbot_intent import ChatbotIntent
from backend.models.chatbot_conversation import ChatbotConversation
from backend.models.schemas import ChatQueryRequest, ChatQueryResponse
from backend.services import chatbot_service
from backend.utils.auth_utils import require_roles, get_optional_current_user

router = APIRouter()


class AskChatbotRequest(BaseModel):
    message: str = Field(..., description="Farmer question in Tamil, Hindi, or English")
    language: Optional[str] = Field(None, description="Language override: 'ta' | 'hi' | 'en' (auto-detected if omitted)")
    farm_id: Optional[str] = Field(None, description="Optional farm ID for contextual predictions")


class AskChatbotResponse(BaseModel):
    reply: str
    detected_language: str
    intent_matched: Optional[str] = None
    suggested_queries: List[str] = []


# ── 1. Main Condition-Based Chatbot Endpoint ───────────────────

@router.post(
    "/chatbot/ask",
    response_model=AskChatbotResponse,
    summary="Ask AgriGuard Multilingual Assistant",
    description=(
        "Processes farmer queries in Tamil, Hindi, or English using a deterministic "
        "condition-matching engine. Returns contextual live advisories based on MongoDB "
        "pest warning logs, weather snapshots, and verified treatments."
    )
)
async def ask_chatbot(
    req: AskChatbotRequest,
    current_user: MongoUser = Depends(require_roles(["farmer", "agronomist", "admin"]))
):
    if not req.message or not req.message.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message text cannot be empty."
        )

    # 1. Match Intent & Detect Language
    matched_intent, effective_lang = await chatbot_service.match_intent(
        message=req.message,
        lang=req.language
    )

    # 2. Resolve Farm Context
    target_farm_id: Optional[PydanticObjectId] = None
    if req.farm_id:
        try:
            target_farm_id = PydanticObjectId(req.farm_id)
        except Exception:
            pass

    if not target_farm_id and current_user:
        # Check user's registered farm
        user_farm = await MongoFarm.find_one({"owner_id": current_user.id})
        if user_farm:
            target_farm_id = user_farm.id

    # 3. Build Dynamic or Static Response
    reply = await chatbot_service.build_response(
        intent=matched_intent,
        lang=effective_lang,
        user_id=current_user.id if current_user else None,
        farm_id=target_farm_id
    )

    intent_id = matched_intent.intent_id if matched_intent else None

    # 4. Audit Log Exchange to ChatbotConversation Collection
    try:
        convo_log = ChatbotConversation(
            user_id=current_user.id if current_user else None,
            farm_id=target_farm_id,
            message=req.message.strip(),
            reply=reply,
            detected_language=effective_lang,
            intent_matched=intent_id,
            timestamp=datetime.utcnow()
        )
        await convo_log.insert()
    except Exception as log_err:
        pass  # Do not block response if logging fails

    # 5. Suggested Follow-up Queries
    suggestions = await chatbot_service.get_suggested_queries(effective_lang)

    return AskChatbotResponse(
        reply=reply,
        detected_language=effective_lang,
        intent_matched=intent_id,
        suggested_queries=suggestions
    )


# ── 2. Query Suggested Chips & Active Intents ─────────────────

@router.get(
    "/chatbot/intents",
    summary="List Active Chatbot Intents & Starter Chips",
    description="Returns all registered intents and suggested starter questions for the UI."
)
async def list_chatbot_intents(lang: str = "en"):
    clean_lang = lang if lang in ["ta", "hi", "en"] else "en"
    intents = await ChatbotIntent.find_all().to_list()
    suggestions = await chatbot_service.get_suggested_queries(clean_lang)

    return {
        "language": clean_lang,
        "total_intents": len(intents),
        "intents": [
            {
                "intent_id": i.intent_id,
                "requires_live_data": i.requires_live_data,
                "keywords": i.keywords.get(clean_lang, []),
                "example_queries": i.example_queries.get(clean_lang, []) if i.example_queries else []
            }
            for i in intents
        ],
        "suggested_chips": suggestions
    }


# ── 3. Backward Compatibility Endpoint ─────────────────────────

TAMIL_KNOWLEDGE = {
    "pest": {
        "text": "இன்றைய பூச்சி தாக்குதல் அபாயத்தைக் கண்டறிய 'Today Warning' பக்கத்தைப் பார்க்கவும். பருத்தி மற்றும் நெல் பயிர்களுக்கு வேப்ப எண்ணெய் 5 மி.லி/லிட்டர் தெளிக்கவும்.",
        "script": "Indraya poochi thakuthal abayathai kandariya Today Warning pakkathai paarkavum."
    },
    "disease": {
        "text": "இலை நோய் அறிகுறிகளை ஸ்கேன் செய்ய உங்கள் பயிர் இலையின் புகைப்படத்தைப் பதிவேற்றவும். எங்கள் AI நோய் வகை மற்றும் மருந்து பரிந்துரையை வழங்கும்.",
        "script": "Ilai noi arigurigalai scan seiya ungal ilaiyin pugaippadathai padiveatravum."
    },
    "weather": {
        "text": "இன்றைய வானிலை: வெப்பநிலை 34°C, ஈரப்பதம் 78%. அடுத்த 3 நாட்களுக்கு மழை வாய்ப்பு குறைவு. மருந்து தெளிக்க ஏற்ற நேரம்.",
        "script": "Indraya vanilai: veppanilai 34 degree C, eerappatham 78 percent."
    },
    "yield": {
        "text": "உங்கள் மகசூலை உயர்த்த சொட்டு நீர் பாசனம் மற்றும் சமச்சீர் NPK உரங்களைப் பயன்படுத்தவும்.",
        "script": "Ungal magasoolai uyartha sottu neer paasanam matrum samacheer NPK urangalai payanpaduthavum."
    }
}

ENGLISH_KNOWLEDGE = {
    "pest": {
        "text": "To check today's pest outbreak risk, navigate to Today's Warning. Recommended organic spray: Neem oil 5ml/L with sticky traps.",
        "script": "To check today's pest outbreak risk, navigate to Today's Warning."
    },
    "disease": {
        "text": "Upload a clear leaf image in the Disease Scanner. AgriGuard AI will diagnose the pathogen and prescribe organic and chemical treatments.",
        "script": "Upload a clear leaf image in the Disease Scanner."
    },
    "weather": {
        "text": "Current Microclimate: Temp 34°C, Humidity 78%. Ideal spraying window is between 6:00 AM and 9:00 AM today.",
        "script": "Current microclimate is optimal for morning spraying."
    },
    "yield": {
        "text": "Optimize soil Nitrogen and Potassium levels using split applications to increase yield by up to 18%.",
        "script": "Optimize soil Nitrogen and Potassium levels."
    }
}

@router.post("/chatbot/query", response_model=ChatQueryResponse)
def query_agri_chatbot(req: ChatQueryRequest):
    q = req.query.lower()
    lang = req.language if req.language in ["ta", "en"] else "ta"
    knowledge = TAMIL_KNOWLEDGE if lang == "ta" else ENGLISH_KNOWLEDGE

    intent = "general"
    if "பூச்சி" in q or "pest" in q or "risk" in q or "warning" in q:
        intent = "pest"
    elif "நோய்" in q or "disease" in q or "leaf" in q or "spot" in q:
        intent = "disease"
    elif "மழை" in q or "வானிலை" in q or "weather" in q or "rain" in q:
        intent = "weather"
    elif "மகசூல்" in q or "yield" in q or "fertilizer" in q:
        intent = "yield"

    item = knowledge.get(intent, knowledge["pest"])
    return {
        "response_text": item["text"],
        "language": lang,
        "audio_script": item["script"],
        "preset_intent": intent
    }
