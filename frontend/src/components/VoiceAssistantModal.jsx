import { useEffect, useRef, useState } from 'react'
import { Volume2, X, Send, Sparkles, Bot, Bug, Leaf } from 'lucide-react'
import api from '../utils/api'
import { MODAL_Z_INDEX } from './ui/Modal'

// Public POST /chatbot/query — backend answers in 'ta' or 'en' only.
export default function VoiceAssistantModal({ isOpen, onClose }) {
  const [query, setQuery] = useState('')
  const [language, setLanguage] = useState('ta') // 'ta' or 'en'
  const [messages, setMessages] = useState([
    {
      sender: 'bot',
      text: 'வணக்கம்! நான் வேளாண் வழிகாட்டி (AgriGuard Voice Assistant). உங்கள் பயிர் பாதுகாப்பு அல்லது பூச்சி தாக்குதல் பற்றி கேளுங்கள்.',
      script: 'Vanakkam! Naan AgriGuard Voice Assistant.'
    }
  ])
  const [loading, setLoading] = useState(false)
  const endRef = useRef(null)

  // Escape closes; stop any speech when the modal closes/unmounts.
  useEffect(() => {
    if (!isOpen) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
    }
  }, [isOpen, onClose])

  useEffect(() => {
    if (isOpen) endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, isOpen])

  if (!isOpen) return null

  const handleSend = async (customQuery) => {
    const textToSend = (customQuery || query).trim()
    if (!textToSend || loading) return

    // Functional updates so concurrent sends/replies never overwrite each other (stale closure fix)
    setMessages((prev) => [...prev, { sender: 'user', text: textToSend }])
    if (!customQuery) setQuery('')
    setLoading(true)

    try {
      const res = await api.post('/chatbot/query', {
        query: textToSend,
        language: language
      })
      setMessages((prev) => [...prev, { sender: 'bot', text: res.data?.response_text || '', script: res.data?.audio_script }])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: language === 'ta'
            ? 'மன்னிக்கவும், தகவலைப் பெற முடியவில்லை. இன்றைய எச்சரிக்கை பக்கத்தைப் பார்க்கவும்.'
            : "Sorry, unable to fetch advisory. Please check the Today's Warning page.",
          script: 'Sorry'
        }
      ])
    } finally {
      setLoading(false)
    }
  }

  const speakText = (text) => {
    if ('speechSynthesis' in window && text) {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = language === 'ta' ? 'ta-IN' : 'en-IN'
      window.speechSynthesis.speak(utterance)
    }
  }

  const chips = language === 'ta'
    ? [
        { icon: Bug, label: 'பூச்சி எச்சரிக்கை', query: 'பூச்சி எச்சரிக்கை' },
        { icon: Leaf, label: 'நோய் சிகிச்சை', query: 'நோய் சிகிச்சை' },
      ]
    : [
        { icon: Bug, label: 'Pest Warning', query: 'Today pest warning' },
        { icon: Leaf, label: 'Disease Advisory', query: 'Disease Treatment' },
      ]

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: MODAL_Z_INDEX }}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="voice-assistant-title"
        className="relative bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col h-[550px] max-h-[calc(100vh-2rem)] border border-stone-200 animate-fade-in"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-brand-800 to-brand-700 p-4 sm:p-5 text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center border border-white/20 shrink-0" aria-hidden="true">
              <Bot size={22} className="text-brand-100" />
            </div>
            <div className="min-w-0">
              <h3 id="voice-assistant-title" className="font-bold text-base">வேளாண் வழிகாட்டி</h3>
              <p className="text-xs text-brand-100 truncate">AgriGuard Voice Assistant (தமிழ் / English)</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setLanguage(l => l === 'ta' ? 'en' : 'ta')}
              aria-label={language === 'ta' ? 'Switch to English' : 'தமிழுக்கு மாற்று'}
              className="px-2.5 py-1 bg-white/20 hover:bg-white/30 text-xs font-bold rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {language === 'ta' ? 'தமிழ்' : 'English'}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1 rounded-lg hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-stone-50" role="log" aria-live="polite">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] p-3.5 rounded-2xl text-sm leading-relaxed ${
                m.sender === 'user'
                  ? 'bg-brand-600 text-white rounded-br-none shadow-sm'
                  : 'bg-white text-stone-800 border border-stone-200 rounded-bl-none shadow-sm space-y-2'
              }`}>
                <p className="whitespace-pre-wrap">{m.text}</p>
                {m.sender === 'bot' && m.text && (
                  <button
                    type="button"
                    onClick={() => speakText(m.text)}
                    className="flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800 pt-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <Volume2 size={13} aria-hidden="true" /> {language === 'ta' ? 'கேட்க' : 'Listen'}
                  </button>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start" role="status">
              <div className="bg-white p-3 rounded-2xl border border-stone-200 text-xs text-stone-500 flex items-center gap-2">
                <Sparkles size={14} className="animate-spin text-brand-600" aria-hidden="true" />
                {language === 'ta' ? 'யோசிக்கிறது...' : 'AgriGuard AI is thinking...'}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Quick Voice Chips */}
        <div className="p-2.5 bg-stone-100 border-t border-stone-200 flex gap-2 overflow-x-auto no-scrollbar text-xs">
          {chips.map(({ icon: Icon, label, query: q }) => (
            <button
              key={label}
              type="button"
              onClick={() => handleSend(q)}
              disabled={loading}
              className="px-3 py-1.5 bg-white border border-stone-300 rounded-full font-medium text-stone-700 hover:border-brand-500 shrink-0 inline-flex items-center gap-1.5 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <Icon size={13} className="text-brand-600" aria-hidden="true" /> {label}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="p-3 bg-white border-t border-stone-200 flex items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && handleSend()}
            placeholder={language === 'ta' ? 'கேள்வி கேட்கவும்...' : 'Type or ask a question...'}
            aria-label={language === 'ta' ? 'கேள்வி கேட்கவும்' : 'Type your question'}
            className="flex-1 min-w-0 px-4 py-2.5 text-sm border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <button
            type="button"
            onClick={() => handleSend()}
            disabled={!query.trim() || loading}
            aria-label="Send"
            className="p-2.5 bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            <Send size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}
