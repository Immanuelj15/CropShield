"""
AgriGuard AI — Multilingual Condition-Based Farmer Chatbot Engine
Supports Tamil (தமிழ்), Hindi (हिंदी), and English (en).

Architecture: Deterministic & Auditable Rule / Condition Matching Engine
- Zero ongoing API costs (pure local evaluation, zero external LLMs).
- Fully deterministic: every answer traces to audited agronomic rules or database logs.
- High resilience: operates reliably under low-bandwidth rural mobile connectivity.
- Layerable: free-form LLM can be appended as an optional fallback in future phases.
"""

import re
import unicodedata
import logging
from typing import Optional, Tuple, Dict, Any, List
from beanie import PydanticObjectId

from backend.models.chatbot_intent import ChatbotIntent
from backend.models.chatbot_conversation import ChatbotConversation
from backend.models.farm import Farm
from backend.models.pest_warning_log import PestWarningLog
from backend.models.weather_snapshot import WeatherSnapshot
from backend.models.advisory import PestDiseaseAdvisory

logger = logging.getLogger("cropshield.chatbot")

FALLBACK_RESPONSES = {
    "en": "Sorry, I didn't understand that. Try asking: 'What is my risk today?', 'What should I spray?', or 'How is the weather today?'",
    "ta": "மன்னிக்கவும், புரியவில்லை. 'இன்று என் பயிர் ஆபத்து என்ன?', 'என்ன மருந்து தெளிக்க வேண்டும்?', அல்லது 'இன்றைய வானிலை எப்படி?' என்று கேட்டுப் பாருங்கள்.",
    "hi": "क्षमा करें, समझ नहीं आया। पूछें: 'आज मेरी फसल का जोखिम क्या है?', 'क्या छिड़काव करें?', या 'आज का मौसम कैसा है?'",
}

DEFAULT_SUGGESTED_QUERIES = {
    "en": [
        "What is my crop risk today?",
        "What should I spray for pests?",
        "What's the weather today?",
        "How to use AgriGuard?"
    ],
    "ta": [
        "இன்றைய பயிர் ஆபத்து என்ன?",
        "பூச்சிக்கு என்ன மருந்து தெளிக்க வேண்டும்?",
        "இன்றைய வானிலை எப்படி?",
        "AgriGuard-ஐ எப்படி பயன்படுத்துவது?"
    ],
    "hi": [
        "आज मेरी फसल का जोखिम क्या है?",
        "कीटों के लिए क्या छिड़कना चाहिए?",
        "आज का मौसम कैसा रहेगा?",
        "AgriGuard का उपयोग कैसे करें?"
    ]
}


def normalize(text: str, lang: str) -> str:
    """Unicode normalizes and lowercases (for English) or standardizes scripts."""
    if not text:
        return ""
    text = unicodedata.normalize("NFC", text.strip())
    return text.lower() if lang == "en" else text


def detect_language(text: str) -> str:
    """
    Determines language via Unicode script block inspection:
    - Tamil Unicode block: \u0B80 - \u0BFF
    - Devanagari (Hindi) block: \u0900 - \u097F
    - Defaults to English ('en')
    Deterministic, instant, and requires zero heavyweight ML packages.
    """
    if re.search(r"[\u0B80-\u0BFF]", text):
        return "ta"
    if re.search(r"[\u0900-\u097F]", text):
        return "hi"
    return "en"


async def match_intent(message: str, lang: Optional[str] = None) -> Tuple[Optional[ChatbotIntent], str]:
    """
    Matches incoming farmer prompt against indexed intents for the chosen or detected language.
    Returns (matched_intent, effective_language).
    """
    detected_lang = lang if lang in ["ta", "hi", "en"] else detect_language(message)
    normalized_msg = normalize(message, detected_lang)

    intents = await ChatbotIntent.find_all().to_list()

    # 1. Match in primary detected language
    for intent in intents:
        keywords = intent.keywords.get(detected_lang, [])
        for kw in keywords:
            if normalize(kw, detected_lang) in normalized_msg:
                return intent, detected_lang

    # 2. Cross-language fallback check (e.g. user toggled 'en' but typed in Tamil script)
    for check_lang in ["ta", "hi", "en"]:
        if check_lang == detected_lang:
            continue
        norm_cross = normalize(message, check_lang)
        for intent in intents:
            for kw in intent.keywords.get(check_lang, []):
                if normalize(kw, check_lang) in norm_cross:
                    return intent, check_lang

    return None, detected_lang


async def build_response(
    intent: Optional[ChatbotIntent],
    lang: str,
    user_id: Optional[PydanticObjectId] = None,
    farm_id: Optional[PydanticObjectId] = None
) -> str:
    """
    Renders parameterized template using live context from MongoDB when required.
    Reuses existing models and services with zero redundant calculation.
    """
    if intent is None:
        return FALLBACK_RESPONSES.get(lang, FALLBACK_RESPONSES["en"])

    template = intent.response_template.get(lang, intent.response_template.get("en", ""))
    if not intent.requires_live_data:
        return template

    # Locate relevant farm context
    farm: Optional[Farm] = None
    if farm_id:
        farm = await Farm.get(farm_id)
    if not farm and user_id:
        farm = await Farm.find_one({"owner_id": user_id})
    if not farm:
        # Fallback to reference centroid or general farm
        farm = await Farm.find_one({"is_reference_point": True}) or await Farm.find_one()

    # 1. Today's Risk Intent
    if intent.intent_id == "today_risk":
        log_query = {"farm_id": farm.id} if farm else {}
        log = await PestWarningLog.find(log_query).sort(-PestWarningLog.created_at).first_or_none()

        crop = farm.crop_type if farm else (log.crop_type if log else "Cotton")
        risk_level = log.risk_level if log else "Low"
        risk_score = round((log.risk_score if log else 0.20) * 100)

        top_reason = ""
        if log and log.shap_explanation:
            feature_name = log.shap_explanation[0].get("feature", "climate")
            feature_clean = feature_name.replace("_", " ").title()
            if lang == "ta":
                top_reason = f"முக்கிய காரணம்: {feature_clean} வானிலை நிலை."
            elif lang == "hi":
                top_reason = f"मुख्य कारण: {feature_clean} मौसमी स्थिति।"
            else:
                top_reason = f"Primary driver: {feature_clean} conditions."
        elif risk_level in ["Medium", "High"]:
            if lang == "ta":
                top_reason = "அதிகரித்த ஈரப்பதம் பூச்சி பெருக்கத்திற்கு சாதகமாக உள்ளது."
            elif lang == "hi":
                top_reason = "उच्च आर्द्रता कीट वृद्धि के लिए अनुकूल है।"
            else:
                top_reason = "Elevated humidity favors pest proliferation."
        else:
            if lang == "ta":
                top_reason = "பயிர் பாதுகாப்பு நிலை சீராக உள்ளது."
            elif lang == "hi":
                top_reason = "फसल सुरक्षा स्थिति स्थिर है।"
            else:
                top_reason = "Crop conditions remain within normal thresholds."

        return template.format(
            crop=crop,
            risk_level=risk_level,
            risk_score=risk_score,
            top_reason=top_reason
        )

    # 2. Treatment Advice Intent
    if intent.intent_id == "treatment_advice":
        log_query = {"farm_id": farm.id} if farm else {}
        log = await PestWarningLog.find(log_query).sort(-PestWarningLog.created_at).first_or_none()

        pest_name = "Pests"
        if log and log.detected_pests:
            p0 = log.detected_pests[0]
            pest_name = p0.get("pest_name") or p0.get("name") or "Pests"
        elif farm:
            pest_name = "Pink Bollworm" if farm.crop_type == "Cotton" else "Stem Borer"

        # Check knowledge base advisory
        advisory = await PestDiseaseAdvisory.find_one({
            "pest_or_disease": {"$regex": pest_name, "$options": "i"}
        })

        if advisory and (advisory.chemical_treatment or advisory.organic_treatment):
            treatment_text = advisory.chemical_treatment or advisory.organic_treatment
        else:
            if lang == "ta":
                treatment_text = "வேப்ப எண்ணெய் 5 மி.லி/லிட்டர் தண்ணீரில் கலந்து தெளிக்கவும் அல்லது மஞ்சள் ஒட்டும் பொறிகளைப் பயன்படுத்தவும்."
            elif lang == "hi":
                treatment_text = "नीम का तेल 5 मिली/लीटर पानी में मिलाकर छिड़कें या पीले चिपचिपे जाल का प्रयोग करें।"
            else:
                treatment_text = "Apply Neem oil (5ml/L) or install yellow sticky traps; scout field within 24 hours."

        return template.format(
            pest_name=pest_name,
            treatment_text=treatment_text
        )

    # 3. Weather Today Intent
    if intent.intent_id == "weather_today":
        snap_query = {"farm_id": farm.id} if farm else {}
        snap = await WeatherSnapshot.find(snap_query).sort(-WeatherSnapshot.created_at).first_or_none()

        if snap:
            temp = snap.temperature_c if snap.temperature_c is not None else float(snap.raw.get("t2m", snap.raw.get("T2M", 28.5)))
            humidity = snap.humidity_pct if snap.humidity_pct is not None else float(snap.raw.get("rh2m", snap.raw.get("RH2M", 65.0)))
            rain = snap.rainfall_mm if snap.rainfall_mm is not None else float(snap.raw.get("prectotcorr", snap.raw.get("PRECTOTCORR", 0.0)))
        else:
            temp = 29.5
            humidity = 68.0
            rain = 0.0

        return template.format(
            temp=round(float(temp), 1),
            humidity=round(float(humidity), 1),
            rain=round(float(rain), 1)
        )

    return template


async def get_suggested_queries(lang: str = "en") -> List[str]:
    """Retrieves suggested question chips for UI initialization."""
    lang = lang if lang in ["ta", "hi", "en"] else "en"
    intents = await ChatbotIntent.find_all().to_list()
    suggestions = []

    for intent in intents:
        if intent.example_queries and lang in intent.example_queries:
            suggestions.extend(intent.example_queries[lang])

    if not suggestions:
        suggestions = DEFAULT_SUGGESTED_QUERIES.get(lang, DEFAULT_SUGGESTED_QUERIES["en"])

    return suggestions[:5]
