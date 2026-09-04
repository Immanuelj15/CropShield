"""
AgriGuard AI — Tamil & English Voice Assistant API Router ("வேளாண் வழிகாட்டி")
Provides natural language text & voice query handling for agricultural advisory.
"""

from fastapi import APIRouter
from backend.models.schemas import ChatQueryRequest, ChatQueryResponse

router = APIRouter()

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
