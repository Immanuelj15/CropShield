import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { MessageSquare, X, Send, Mic, MicOff, Trash2, Bot, Sparkles, AlertCircle } from 'lucide-react';
import api from '../utils/api';
import LanguageToggle from './LanguageToggle';
import ChatMessage from './ChatMessage';
import { useToast } from './ui/Toast';

const GREETINGS = {
  ta: {
    sender: 'bot',
    text: 'வணக்கம்! நான் AgriGuard வேளாண் உதவியாளர். உங்கள் பயிர் ஆபத்து, வானிலை அல்லது சிகிச்சைகள் பற்றி கேளுங்கள்.',
    timestamp: new Date().toISOString(),
  },
  hi: {
    sender: 'bot',
    text: 'नमस्ते! मैं AgriGuard कृषि सहायक हूँ। अपनी फसल के जोखिम, मौसम या उपचार के बारे में पूछें।',
    timestamp: new Date().toISOString(),
  },
  en: {
    sender: 'bot',
    text: "Vanakkam! I'm AgriGuard's advisory assistant. Ask me about today's crop risk, weather, or treatments.",
    timestamp: new Date().toISOString(),
  },
};

const PLACEHOLDERS = {
  ta: 'கேள்வி கேட்கவும் (எ.கா. இன்றைய ஆபத்து என்ன?)...',
  hi: 'प्रश्न पूछें (जैसे: आज का जोखिम क्या है?)...',
  en: "Type your question (e.g., What's my risk today?)...",
};

// Backend /chatbot/ask supports ta | hi | en; start in the UI language when it is one of those.
const CHAT_LANGS = ['ta', 'hi', 'en'];
const initialChatLang = (lng) => {
  const code = (lng || 'en').split('-')[0].toLowerCase();
  return CHAT_LANGS.includes(code) ? code : 'en';
};

export default function ChatbotWidget() {
  const { i18n } = useTranslation();
  const toast = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [language, setLanguage] = useState(() => initialChatLang(i18n.language));
  const [inputQuery, setInputQuery] = useState('');
  const [messages, setMessages] = useState(() => [GREETINGS[initialChatLang(i18n.language)]]);
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [suggestedChips, setSuggestedChips] = useState([]);
  const [hasPulsed, setHasPulsed] = useState(false);

  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const shouldReduceMotion = useReducedMotion();

  // 1. One-time pulse check per session
  useEffect(() => {
    const pulsedSession = sessionStorage.getItem('agriguard_chat_pulsed');
    if (!pulsedSession) {
      setHasPulsed(true);
      sessionStorage.setItem('agriguard_chat_pulsed', 'true');
    }
  }, []);

  // 2. Fetch suggested question chips when language changes
  useEffect(() => {
    async function loadChips() {
      try {
        const res = await api.get('/chatbot/intents', { params: { lang: language } });
        if (res.data?.suggested_chips) {
          setSuggestedChips(res.data.suggested_chips);
        }
      } catch (err) {
        // Fallback default chips
        if (language === 'ta') {
          setSuggestedChips(['இன்றைய பயிர் ஆபத்து என்ன?', 'பூச்சிக்கு என்ன மருந்து?', 'இன்றைய வானிலை எப்படி?']);
        } else if (language === 'hi') {
          setSuggestedChips(['आज मेरी फसल का जोखिम क्या है?', 'क्या छिड़काव करें?', 'आज का मौसम कैसा रहेगा?']);
        } else {
          setSuggestedChips(["What is my crop risk today?", 'What should I spray for pests?', "What's the weather today?"]);
        }
      }
    }
    loadChips();
  }, [language]);

  // 3. Update initial greeting if user switches language on empty chat
  const handleLanguageChange = (newLang) => {
    setLanguage(newLang);
    if (messages.length <= 1) {
      setMessages([GREETINGS[newLang]]);
    }
  };

  // 4. Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, loading, isOpen]);

  // 5. Send message to backend
  const handleSendMessage = async (textToSend = null) => {
    const query = (textToSend || inputQuery).trim();
    if (!query || loading) return;

    const userMessage = {
      sender: 'user',
      text: query,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!textToSend) setInputQuery('');
    setLoading(true);

    try {
      // Shared axios instance attaches the session Bearer token (P2-3) so replies use the user's farm context
      const res = await api.post('/chatbot/ask', {
        message: query,
        language: language,
      });

      const botReply = {
        sender: 'bot',
        text: res.data.reply,
        intent: res.data.intent_matched,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, botReply]);

      if (res.data.suggested_queries?.length > 0) {
        setSuggestedChips(res.data.suggested_queries);
      }
    } catch (err) {
      const fallbackText =
        language === 'ta'
          ? 'மன்னிக்கவும், தகவலைப் பெற முடியவில்லை. Today Warning பக்கத்தைப் பார்க்கவும்.'
          : language === 'hi'
          ? 'क्षमा करें, सलाह प्राप्त करने में असमर्थ। कृपया Today Warning पृष्ठ देखें।'
          : 'Unable to reach advisory engine. Please check Today Warning page.';

      setMessages((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: fallbackText,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // 6. Speech-to-Text setup
  const toggleSpeechRecognition = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Speech recognition is not supported in this browser. Please use Google Chrome or Edge.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = language === 'ta' ? 'ta-IN' : language === 'hi' ? 'hi-IN' : 'en-IN';

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      if (transcript) {
        setInputQuery(transcript);
        handleSendMessage(transcript);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  // 7. Text-to-Speech audio playback
  const handleSpeakText = (text) => {
    if (!('speechSynthesis' in window)) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language === 'ta' ? 'ta-IN' : language === 'hi' ? 'hi-IN' : 'en-US';
    utterance.rate = 0.95;

    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const handleClearChat = () => {
    setMessages([GREETINGS[language]]);
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  return (
    <>
      {/* ── Floating Action Button (FAB) ────────────────────── */}
      <div className="fixed bottom-24 right-4 sm:bottom-6 sm:right-6 z-40">
        <motion.button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className={`relative p-3.5 sm:p-4 rounded-2xl shadow-xl flex items-center justify-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
            isOpen
              ? 'bg-stone-800 text-white'
              : 'bg-brand-600 hover:bg-brand-700 text-white border-2 border-brand-400/40'
          }`}
          aria-label={isOpen ? "Close AgriGuard AI advisory chat" : "Open AgriGuard AI advisory chat"}
          aria-expanded={isOpen}
        >
          {isOpen ? (
            <X size={24} />
          ) : (
            <>
              <Bot size={24} />
              {/* Optional first session pulse badge */}
              {hasPulsed && (
                <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-300 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-brand-400" />
                </span>
              )}
            </>
          )}
        </motion.button>
      </div>

      {/* ── Slide-up Chat Drawer ────────────────────────────── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 35, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 30, scale: 0.96 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="fixed bottom-36 right-3 sm:bottom-20 sm:right-6 z-40 w-[94vw] sm:w-[420px] h-[560px] max-h-[calc(100vh-10rem)] bg-white rounded-3xl shadow-2xl border border-stone-200 flex flex-col overflow-hidden"
          >
            {/* ── Header ────────────────────────────────────────── */}
            <div className="bg-gradient-to-r from-brand-800 via-brand-700 to-brand-900 p-4 text-white flex items-center justify-between shrink-0 shadow-sm">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center text-brand-200">
                  <Bot size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-sm leading-tight flex items-center gap-1.5">
                    {language === 'ta' ? 'வேளாண் உதவியாளர்' : language === 'hi' ? 'कृषि सहायक' : 'AgriGuard Assistant'}
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-white/15 text-brand-100 font-medium">
                      Rule Engine
                    </span>
                  </h3>
                  <p className="text-xs text-brand-100">
                    {language === 'ta' ? 'உடனடி பூச்சி & பயிர் பாதுகாப்பு' : language === 'hi' ? 'त्वरित फसल एवं मौसम सलाह' : 'Verifiable, Zero-Cost Advisory'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleClearChat}
                  title="Clear chat"
                  aria-label="Clear chat"
                  className="p-1.5 rounded-lg text-brand-100 hover:bg-white/15 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <Trash2 size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  title="Close"
                  aria-label="Close chat"
                  className="p-1.5 rounded-lg text-brand-100 hover:bg-white/15 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* ── Language Switcher Sub-Bar ──────────────────────── */}
            <div className="px-4 py-2 bg-stone-50 border-b border-stone-200/80 flex items-center justify-between">
              <span className="text-xs font-medium text-stone-600">
                {language === 'ta' ? 'மொழி தேர்ந்தெடுக்கவும்:' : language === 'hi' ? 'भाषा चुनें:' : 'Language:'}
              </span>
              <LanguageToggle currentLang={language} onLanguageChange={handleLanguageChange} />
            </div>

            {/* ── Messages Container ────────────────────────────── */}
            <div className="flex-1 p-4 overflow-y-auto bg-stone-100/50" role="log" aria-live="polite">
              {messages.map((m, idx) => (
                <ChatMessage
                  key={idx}
                  message={m}
                  language={language}
                  onSpeak={m.sender === 'bot' ? handleSpeakText : null}
                  isSpeaking={isSpeaking}
                />
              ))}

              {loading && <ChatMessage isTyping={true} language={language} />}

              <div ref={messagesEndRef} />
            </div>

            {/* ── Suggested Question Chips ──────────────────────── */}
            {suggestedChips?.length > 0 && (
              <div className="px-3 py-2 bg-stone-50 border-t border-stone-200/70 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
                <Sparkles size={13} className="text-brand-600 shrink-0 ml-1" />
                {suggestedChips.map((chip, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendMessage(chip)}
                    className="px-2.5 py-1 text-xs bg-white hover:bg-brand-50 text-stone-700 border border-stone-300 hover:border-brand-500 rounded-full shrink-0 transition-colors font-medium text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}

            {/* ── Input Box ─────────────────────────────────────── */}
            <div className="p-3 bg-white border-t border-stone-200 flex items-center gap-2 shrink-0">
              {/* Microphone STT Button */}
              <button
                type="button"
                onClick={toggleSpeechRecognition}
                className={`p-2.5 rounded-xl border transition-all ${
                  isListening
                    ? 'bg-red-500 text-white border-red-600 animate-pulse'
                    : 'bg-stone-100 text-stone-600 hover:bg-brand-50 hover:text-brand-600 border-stone-200'
                }`}
                title={isListening ? 'Listening... Tap to stop' : 'Voice input (speak your question)'}
                aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
                aria-pressed={isListening}
              >
                {isListening ? <MicOff size={18} /> : <Mic size={18} />}
              </button>

              {/* Text Input */}
              <input
                type="text"
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                onKeyDown={(e) => {
                  // Ignore Enter while an IME (Tamil/Hindi keyboards) is composing a word.
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSendMessage();
                }}
                placeholder={PLACEHOLDERS[language] || PLACEHOLDERS['en']}
                aria-label={PLACEHOLDERS[language] || PLACEHOLDERS['en']}
                maxLength={2000}
                className="flex-1 min-w-0 px-3.5 py-2 text-sm bg-stone-100 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 text-stone-900 placeholder-stone-400"
              />

              {/* Send Button */}
              <button
                type="button"
                onClick={() => handleSendMessage()}
                disabled={!inputQuery.trim() || loading}
                className="p-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-all shadow-sm shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                title="Send"
                aria-label="Send message"
              >
                <Send size={18} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
