import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Volume2, VolumeX, Bot, User } from 'lucide-react';

export default function ChatMessage({
  message,
  isTyping = false,
  language = 'en',
  onSpeak,
  isSpeaking = false,
}) {
  const shouldReduceMotion = useReducedMotion();

  if (isTyping) {
    return (
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex items-start gap-2.5 mb-3"
      >
        <div className="w-8 h-8 rounded-xl bg-brand-700 text-white flex items-center justify-center shrink-0 shadow-sm">
          <Bot size={16} />
        </div>
        <div className="bg-white border border-stone-200 px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-brand-600 animate-bounce [animation-delay:-0.3s]" />
          <span className="w-2 h-2 rounded-full bg-brand-500 animate-bounce [animation-delay:-0.15s]" />
          <span className="w-2 h-2 rounded-full bg-brand-400 animate-bounce" />
          <span className="text-xs text-stone-500 ml-2 font-medium">
            {language === 'ta' ? 'சிந்திக்கிறது...' : language === 'hi' ? 'सोच रहा है...' : 'Checking advisories...'}
          </span>
        </div>
      </motion.div>
    );
  }

  const isUser = message?.sender === 'user';

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className={`flex items-start gap-2.5 mb-3.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar Icon */}
      <div
        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
          isUser
            ? 'bg-stone-700 text-white'
            : 'bg-brand-700 text-brand-100'
        }`}
      >
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>

      {/* Message Bubble */}
      <div
        className={`max-w-[82%] sm:max-w-[78%] px-4 py-3 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-sm ${
          isUser
            ? 'bg-brand-600 text-white rounded-tr-sm font-medium'
            : 'bg-white text-stone-800 border border-stone-200 rounded-tl-sm'
        }`}
      >
        <p className="whitespace-pre-wrap select-text">{message?.text}</p>

        {/* Footer Meta & TTS */}
        <div
          className={`flex items-center justify-between gap-3 mt-1.5 pt-1 text-xs ${
            isUser ? 'text-brand-100' : 'text-stone-500'
          }`}
        >
          <span>
            {message?.timestamp
              ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : 'Now'}
          </span>

          {!isUser && onSpeak && (
            <button
              type="button"
              onClick={() => onSpeak(message?.text)}
              className="inline-flex items-center gap-1 rounded hover:text-brand-700 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              title={isSpeaking ? 'Stop audio' : 'Listen'}
              aria-label={isSpeaking ? 'Stop reading aloud' : 'Read this reply aloud'}
            >
              {isSpeaking ? (
                <>
                  <VolumeX size={12} className="text-amber-500" />
                  <span>Stop</span>
                </>
              ) : (
                <>
                  <Volume2 size={12} />
                  <span>Audio</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
