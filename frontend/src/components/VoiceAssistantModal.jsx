import { useState } from 'react'
import { Mic, Volume2, X, Send, Sparkles, Bot } from 'lucide-react'
import axios from 'axios'

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

  if (!isOpen) return null

  const handleSend = async (customQuery) => {
    const textToSend = customQuery || query
    if (!textToSend.trim()) return

    const newMessages = [...messages, { sender: 'user', text: textToSend }]
    setMessages(newMessages)
    if (!customQuery) setQuery('')
    setLoading(true)

    try {
      const res = await axios.post('/api/v1/chatbot/query', {
        query: textToSend,
        language: language
      })
      setMessages([...newMessages, { sender: 'bot', text: res.data.response_text, script: res.data.audio_script }])
    } catch (err) {
      setMessages([
        ...newMessages,
        {
          sender: 'bot',
          text: language === 'ta' 
            ? 'மன்னிக்கவும், தகவலைப் பெற முடியவில்லை. Today Warning பக்கத்தைப் பார்க்கவும்.' 
            : 'Sorry, unable to fetch advisory. Please check Today Warning page.',
          script: 'Sorry'
        }
      ])
    } finally {
      setLoading(false)
    }
  }

  const speakText = (text) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = language === 'ta' ? 'ta-IN' : 'en-US'
      window.speechSynthesis.speak(utterance)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col h-[550px] border border-stone-200 animate-fadeIn">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-800 to-teal-700 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center border border-white/20">
              <Bot size={22} className="text-emerald-200" />
            </div>
            <div>
              <h3 className="font-bold text-base">வேளாண் வழிகாட்டி</h3>
              <p className="text-xs text-emerald-100">AgriGuard Multilingual Voice Assistant</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setLanguage(l => l === 'ta' ? 'en' : 'ta')}
              className="px-2.5 py-1 bg-white/20 hover:bg-white/30 text-xs font-bold rounded-lg transition-colors"
            >
              {language === 'ta' ? 'தமிழ்' : 'English'}
            </button>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/20">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-stone-50">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                m.sender === 'user' 
                  ? 'bg-emerald-600 text-white rounded-br-none shadow-sm' 
                  : 'bg-white text-stone-800 border border-stone-200 rounded-bl-none shadow-sm space-y-2'
              }`}>
                <p>{m.text}</p>
                {m.sender === 'bot' && (
                  <button
                    onClick={() => speakText(m.text)}
                    className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 pt-1"
                  >
                    <Volume2 size={13} /> Listen Audio
                  </button>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white p-3 rounded-2xl border border-stone-200 text-xs text-stone-500 flex items-center gap-2">
                <Sparkles size={14} className="animate-spin text-emerald-600" /> AgriGuard AI is thinking...
              </div>
            </div>
          )}
        </div>

        {/* Quick Voice Chips */}
        <div className="p-2.5 bg-stone-100 border-t border-stone-200 flex gap-2 overflow-x-auto text-xs">
          <button
            onClick={() => handleSend(language === 'ta' ? 'பூச்சி எச்சரிக்கை' : 'Today pest warning')}
            className="px-3 py-1.5 bg-white border border-stone-300 rounded-full font-medium text-stone-700 hover:border-emerald-500 shrink-0"
          >
            🐛 {language === 'ta' ? 'பூச்சி எச்சரிக்கை' : 'Pest Warning'}
          </button>
          <button
            onClick={() => handleSend(language === 'ta' ? 'நோய் சிகிச்சை' : 'Disease Treatment')}
            className="px-3 py-1.5 bg-white border border-stone-300 rounded-full font-medium text-stone-700 hover:border-emerald-500 shrink-0"
          >
            🍃 {language === 'ta' ? 'நோய் சிகிச்சை' : 'Disease Advisory'}
          </button>
        </div>

        {/* Input */}
        <div className="p-3 bg-white border-t border-stone-200 flex items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={language === 'ta' ? 'கேள்வி கேட்கவும்...' : 'Type or ask a question...'}
            className="flex-1 px-4 py-2.5 text-xs sm:text-sm border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            onClick={() => handleSend()}
            className="p-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
