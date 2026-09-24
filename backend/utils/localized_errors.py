"""
AgriGuard AI — Backend Localized Error & Validation Messages
Provides multilingual error responses across English (en), Tamil (ta), Hindi (hi), Telugu (te), Malayalam (ml).
"""

from typing import Optional, Dict, Any
from fastapi import Request

VALIDATION_MESSAGES: Dict[str, Dict[str, str]] = {
    "required_field": {
        "en": "This field is required",
        "ta": "இந்த புலம் தேவை",
        "hi": "यह फ़ील्ड आवश्यक है",
        "te": "ఈ ఫీల్డ్ అవసరం",
        "ml": "ഈ ഫീൽഡ് ആവശ്യമാണ്",
    },
    "invalid_credentials": {
        "en": "Invalid email or password.",
        "ta": "தவறான மின்னஞ்சல் அல்லது கடவுச்சொல்.",
        "hi": "अमान्य ईमेल या पासवर्ड।",
        "te": "చెల్లని ఇమెయిల్ లేదా పాస్‌వర్డ్.",
        "ml": "അസാധുവായ ഇമെയിൽ അല്ലെങ്കിൽ പാസ്‌വേഡ്.",
    },
    "email_already_registered": {
        "en": "Email already registered in system.",
        "ta": "மின்னஞ்சல் ஏற்கனவே பதிவு செய்யப்பட்டுள்ளது.",
        "hi": "ईमेल पहले से ही सिस्टम में पंजीकृत है।",
        "te": "ఇమెయిల్ ఇప్పటికే సిస్టమ్‌లో నమోదై ఉంది.",
        "ml": "ഇമെയിൽ ഇതിനകം സിസ്റ്റത്തിൽ രജിസ്റ്റർ ചെയ്തിട്ടുണ്ട്.",
    },
    "auth_token_required": {
        "en": "Authentication token required.",
        "ta": "அங்கீகார டோக்கன் தேவை.",
        "hi": "प्रमाणीकरण टोकन आवश्यक है।",
        "te": "ప్రామాణీకరణ టోకెన్ అవసరం.",
        "ml": "പ്രാമാണീകരണ ടോക്കൺ ആവശ്യമാണ്.",
    },
    "invalid_auth_token": {
        "en": "Invalid authentication token or token expired.",
        "ta": "தவறான அல்லது காலாவதியான அங்கீகார டோக்கன்.",
        "hi": "अमान्य प्रमाणीकरण टोकन या टोकन समाप्त हो गया है।",
        "te": "చెల్లని ప్రామాణీకరణ టోకెన్ లేదా టోకెన్ గడువు ముగిసింది.",
        "ml": "അസാധുവായ പ്രാമാണീകരണ ടോക്കൺ അല്ലെങ്കിൽ ടോക്കൺ കാലഹരണപ്പെട്ടു.",
    },
    "access_forbidden": {
        "en": "Access forbidden: insufficient permissions.",
        "ta": "அனுமதி மறுக்கப்பட்டது: போதுமான அனுமதிகள் இல்லை.",
        "hi": "पहुँच निषिद्ध: अपर्याप्त अनुमतियाँ।",
        "te": "యాక్సెస్ నిషేధించబడింది: సరిపోని అనుమతులు.",
        "ml": "ആക്സസ് നിരോധിച്ചിരിക്കുന്നു: ആവശ്യമായ അനുമതികളില്ല.",
    },
    "invalid_gps": {
        "en": "Invalid GPS coordinates",
        "ta": "தவறான GPS ஆயத்தொலைவுகள்",
        "hi": "अमान्य GPS निर्देशांक",
        "te": "చెల్లని GPS కోఆర్డినేట్లు",
        "ml": "അസാധുവായ GPS കോർഡിനേറ്റുകൾ",
    },
    "farm_not_found": {
        "en": "Farm record not found.",
        "ta": "பண்ணை பதிவு கிடைக்கவில்லை.",
        "hi": "खेत का रिकॉर्ड नहीं मिला।",
        "te": "వ్యవసాయ క్షేత్రం రికార్డు కనుగొనబడలేదు.",
        "ml": "ഫാം റെക്കോർഡ് കണ്ടെത്തിയില്ല.",
    },
    "weather_fetch_failed": {
        "en": "Could not retrieve NASA satellite weather reanalysis for coordinates.",
        "ta": "கொடுக்கப்பட்ட ஆயத்தொலைவுகளுக்கான நாசா செயற்கைக்கோள் வானிலையைப் பெற முடியவில்லை.",
        "hi": "निर्देशांकों के लिए नासा उपग्रह मौसम प्राप्त नहीं किया जा सका।",
        "te": "కోఆర్డినేట్ల కోసం నాసా ఉపగ్రహ వాతావరణ సమాచారం పొందడం సాధ్యం కాలేదు.",
        "ml": "നിർദ്ദിഷ്ട കോർഡിനേറ്റുകൾക്കായി നാസ ഉപഗ്രഹ കാലാവസ്ഥ വീണ്ടെടുക്കാനായില്ല.",
    },
    "leaf_image_required": {
        "en": "Please provide a valid crop leaf image.",
        "ta": "சரியான பயிர் இலை படத்தை வழங்கவும்.",
        "hi": "कृपया एक वैध फसल पत्ती की छवि प्रदान करें।",
        "te": "దయచేసి సరైన పంట ఆకు చిత్రాన్ని అందించండి.",
        "ml": "സാധുവായ വിള ഇല ചിത്രം നൽകുക.",
    },
    "disease_diagnosis_failed": {
        "en": "Diagnosis failed. Please verify image format and clarity.",
        "ta": "கண்டறிதல் தோல்வியடைந்தது. படத்தின் தரம் மற்றும் வடிவமைப்பை சரிபார்க்கவும்.",
        "hi": "निदान विफल रहा। कृपया छवि प्रारूप और स्पष्टता की जाँच करें।",
        "te": "వ్యాధి నిర్ధారణ విఫలమైంది. దయచేసి చిత్ర స్పష్టతను తనిఖీ చేయండి.",
        "ml": "രോഗനിർണയം പരാജയപ്പെട്ടു. ഇമേജ് ഫോർമാറ്റും വ്യക്തതയും പരിശോധിക്കുക.",
    },
    "language_updated": {
        "en": "Preferred language updated successfully.",
        "ta": "விருப்பமான மொழி வெற்றிகரமாக புதுப்பிக்கப்பட்டது.",
        "hi": "पसंदीदा भाषा सफलतापूर्वक अपडेट की गई।",
        "te": "ప్రాధాన్య భాష విజయవంతంగా నవీకరించబడింది.",
        "ml": "തിരഞ്ഞെടുത്ത ഭാഷ വിജയകരമായി അപ്‌ഡേറ്റുചെയ്‌തു.",
    },
}

SUPPORTED_LANGUAGES = ["en", "ta", "hi", "te", "ml"]

def resolve_lang(requested_lang: Optional[str]) -> str:
    """Normalize language code to one of 5 supported languages, default 'en'."""
    if not requested_lang:
        return "en"
    clean = requested_lang.strip().lower()[:2]
    return clean if clean in SUPPORTED_LANGUAGES else "en"

def localized_error(key: str, lang: str = "en") -> str:
    """Retrieves localized message with English fallback."""
    l = resolve_lang(lang)
    entry = VALIDATION_MESSAGES.get(key, {})
    return entry.get(l, entry.get("en", key))

def get_request_lang(request: Request, user_lang: Optional[str] = None) -> str:
    """Resolves language from user preference or Accept-Language header."""
    if user_lang:
        return resolve_lang(user_lang)
    header = request.headers.get("accept-language", "")
    if header:
        parts = [p.strip().split(";")[0] for p in header.split(",")]
        for p in parts:
            cand = resolve_lang(p)
            if cand != "en" or p.startswith("en"):
                return cand
    return "en"
