"""
AgriGuard AI — Seed Multilingual Chatbot Intents (Tamil, Hindi, English)
Idempotent script to populate deterministic rule-matching intents into MongoDB.
"""

import asyncio
import os
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.db.mongodb import init_mongodb, close_mongodb, motor_client
from backend.models.chatbot_intent import ChatbotIntent

STARTER_INTENTS = [
    {
        "intent_id": "today_risk",
        "keywords": {
            "en": ["today risk", "risk today", "how is my crop", "warning today", "status", "risk", "warning", "crop condition"],
            "ta": ["இன்றைய ஆபத்து", "என் பயிர் நிலை", "இன்று எச்சரிக்கை", "ஆபத்து", "எச்சரிக்கை", "பயிர் நிலை", "பூச்சி தாக்குதல்"],
            "hi": ["आज का जोखिम", "मेरी फसल कैसी है", "आज चेतावनी", "जोखिम", "चेतावनी", "फसल कैसी", "कीट जोखिम"]
        },
        "requires_live_data": True,
        "response_template": {
            "en": "Your current risk for {crop} is {risk_level} ({risk_score}%). {top_reason}",
            "ta": "உங்கள் {crop} பயிரின் தற்போதைய ஆபத்து நிலை {risk_level} ({risk_score}%). {top_reason}",
            "hi": "आपकी {crop} फसल का वर्तमान जोखिम स्तर {risk_level} ({risk_score}%) है। {top_reason}"
        },
        "example_queries": {
            "en": ["What is my crop risk today?", "Check today's warning"],
            "ta": ["இன்றைய பயிர் ஆபத்து என்ன?", "இன்று எச்சரிக்கை நிலை"],
            "hi": ["आज मेरी फसल का जोखिम क्या है?", "आज की चेतावनी देखें"]
        }
    },
    {
        "intent_id": "treatment_advice",
        "keywords": {
            "en": ["treatment", "pesticide", "what to spray", "cure", "medicine for", "spray", "remedy", "fertilizer", "treat"],
            "ta": ["சிகிச்சை", "மருந்து", "என்ன தெளிக்க வேண்டும்", "தெளிப்பு", "பூச்சிக்கொல்லி", "நிவாரணம்", "மருந்து முறை"],
            "hi": ["इलाज", "कीटनाशक", "क्या छिड़कें", "दवा", "उपचार", "छिड़काव", "दवाई"]
        },
        "requires_live_data": True,
        "response_template": {
            "en": "For {pest_name}, recommended treatment: {treatment_text}",
            "ta": "{pest_name}-க்கு பரிந்துரைக்கப்படும் சிகிச்சை: {treatment_text}",
            "hi": "{pest_name} के लिए अनुशंसित उपचार: {treatment_text}"
        },
        "example_queries": {
            "en": ["What should I spray for pests?", "Treatment for whitefly"],
            "ta": ["பூச்சிக்கு என்ன மருந்து தெளிக்க வேண்டும்?", "சிகிச்சை முறை என்ன?"],
            "hi": ["कीटों के लिए क्या छिड़कना चाहिए?", "उपचार की सलाह दें"]
        }
    },
    {
        "intent_id": "weather_today",
        "keywords": {
            "en": ["weather", "rain today", "temperature", "humidity", "rain", "forecast", "climate", "rainfall"],
            "ta": ["வானிலை", "மழை", "வெப்பநிலை", "ஈரப்பதம்", "மழை வருமா", "மழை வாய்ப்பு"],
            "hi": ["मौसम", "बारिश", "तापमान", "नमी", "वर्षा", "मौसम का हाल"]
        },
        "requires_live_data": True,
        "response_template": {
            "en": "Today: {temp}°C, {humidity}% humidity, {rain}mm rain expected.",
            "ta": "இன்று: {temp}°C, {humidity}% ஈரப்பதம், {rain}மிமீ மழை எதிர்பார்க்கப்படுகிறது.",
            "hi": "आज: {temp}°C, {humidity}% नमी, {rain}मिमी बारिश की संभावना।"
        },
        "example_queries": {
            "en": ["What's the weather today?", "Will it rain today?"],
            "ta": ["இன்றைய வானிலை எப்படி?", "இன்று மழை பெய்யுமா?"],
            "hi": ["आज का मौसम कैसा रहेगा?", "क्या आज बारिश होगी?"]
        }
    },
    {
        "intent_id": "how_to_use",
        "keywords": {
            "en": ["how to use", "how does this work", "help", "guide", "features", "instructions"],
            "ta": ["எப்படி பயன்படுத்துவது", "இது எப்படி வேலை செய்கிறது", "உதவி", "வழிகாட்டி", "செயல்முறை"],
            "hi": ["कैसे उपयोग करें", "यह कैसे काम करता है", "मदद", "मार्गदर्शिका", "सहायता"]
        },
        "requires_live_data": False,
        "response_template": {
            "en": "Tap 'Today's Warning' to see your risk, 'Detect' to scan a leaf photo, and 'Advisories' for treatment guides.",
            "ta": "'இன்றைய எச்சரிக்கை' தட்டி உங்கள் ஆபத்தைக் காணவும், இலை படத்தை ஸ்கேன் செய்ய 'கண்டறி' தட்டவும், மற்றும் ஆலோசனை வழிகாட்டிகளைப் பார்க்கவும்.",
            "hi": "अपना जोखिम देखने के लिए 'आज की चेतावनी' दबाएं, पत्ती की फोटो स्कैन करने के लिए 'पहचानें' दबाएं, और उपचार गाइड देखें।"
        },
        "example_queries": {
            "en": ["How to use AgriGuard?", "How does this app work?"],
            "ta": ["AgriGuard-ஐ எப்படி பயன்படுத்துவது?", "உதவி வழிகாட்டி"],
            "hi": ["AgriGuard का उपयोग कैसे करें?", "यह कैसे काम करता है?"]
        }
    },
    {
        "intent_id": "greeting",
        "keywords": {
            "en": ["hi", "hello", "hey", "good morning", "vanakkam", "namaste", "greetings"],
            "ta": ["வணக்கம்", "ஹாய்", "காலை வணக்கம்", "நலமா"],
            "hi": ["नमस्ते", "हैलो", "हाय", "सुप्रभात", "प्रणाम", "राम राम"]
        },
        "requires_live_data": False,
        "response_template": {
            "en": "Vanakkam! I'm AgriGuard's assistant. Ask me about your crop risk, weather, or treatments.",
            "ta": "வணக்கம்! நான் AgriGuard உதவியாளர். உங்கள் பயிர் ஆபத்து, வானிலை அல்லது சிகிச்சைகள் பற்றி கேளுங்கள்.",
            "hi": "नमस्ते! मैं AgriGuard सहायक हूं। अपनी फसल के जोखिम, मौसम या उपचार के बारे में पूछें।"
        },
        "example_queries": {
            "en": ["Hello", "Vanakkam"],
            "ta": ["வணக்கம்", "ஹாய்"],
            "hi": ["नमस्ते", "हैलो"]
        }
    }
]


async def seed_chatbot_intents(close_db: bool = False):
    """Inserts starter chatbot intents idempotently."""
    if motor_client is None:
        await init_mongodb()

    print("Seeding AgriGuard Chatbot Intents (Tamil, Hindi, English)...")
    inserted = 0
    already_present = 0

    for item in STARTER_INTENTS:
        existing = await ChatbotIntent.find_one({"intent_id": item["intent_id"]})
        if existing:
            already_present += 1
            continue

        doc = ChatbotIntent(
            intent_id=item["intent_id"],
            keywords=item["keywords"],
            requires_live_data=item["requires_live_data"],
            response_template=item["response_template"],
            example_queries=item.get("example_queries"),
            created_at=datetime.utcnow()
        )
        await doc.insert()
        inserted += 1

    print(f"Chatbot Intents Seeding Complete: {inserted} inserted, {already_present} already present (Total: {len(STARTER_INTENTS)}).")
    if close_db:
        await close_mongodb()
    return inserted, already_present


if __name__ == "__main__":
    asyncio.run(seed_chatbot_intents(close_db=True))
