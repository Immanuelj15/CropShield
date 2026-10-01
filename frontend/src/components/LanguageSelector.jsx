import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, ChevronDown, Check } from 'lucide-react';
import clsx from 'clsx';
import { updateUserLanguage } from '../utils/api';
import { getToken } from '../utils/http';

export const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English', sub: 'Standard Agronomic English' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்', sub: 'தமிழ்நாடு விவசாய மொழி' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी', sub: 'राष्ट्रीय संपर्क भाषा' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు', sub: 'ఆంధ్రప్రదేశ్ & తెలంగాణ' },
  { code: 'ml', label: 'Malayalam', native: 'മലയാളം', sub: 'കേരള കാർഷിക ഭാഷ' },
];

export default function LanguageSelector({ variant = 'dropdown', className = '' }) {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const currentCode = (i18n.language || 'en').split('-')[0].toLowerCase();
  const currentLang = LANGUAGES.find((l) => l.code === currentCode) || LANGUAGES[0];

  const handleSelectLanguage = async (code) => {
    try {
      await i18n.changeLanguage(code);
      localStorage.setItem('cropshield_lang', code);
      localStorage.setItem('i18nextLng', code);
      if (typeof document !== 'undefined') {
        document.body.dataset.lang = code;
        document.documentElement.lang = code;
      }

      // If user is authenticated, sync to profile in backend
      if (getToken()) {
        updateUserLanguage(code).catch(() => { /* best effort: UI language already changed locally */ });
      }
    } catch (err) {
      console.error('Failed to change language:', err);
    } finally {
      setIsOpen(false);
    }
  };

  // 1. Pill variant (e.g. for login page or first launch banner)
  if (variant === 'pill') {
    return (
      <div className={clsx('flex flex-wrap items-center justify-center gap-1.5 p-1 bg-stone-100 rounded-2xl border border-stone-200/80', className)}>
        {LANGUAGES.map((lang) => {
          const isSelected = currentCode === lang.code;
          return (
            <button
              key={lang.code}
              type="button"
              onClick={() => handleSelectLanguage(lang.code)}
              aria-pressed={isSelected}
              lang={lang.code}
              className={clsx(
                'px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                isSelected
                  ? 'bg-brand-600 text-white shadow-sm font-bold'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-white/80'
              )}
            >
              {lang.native}
            </button>
          );
        })}
      </div>
    );
  }

  // 2. Dropdown variant (standard navbar item)
  return (
    <div className={clsx('relative inline-block text-left', className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-800 transition shadow-sm cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        aria-label={`Select language (current: ${currentLang.label})`}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <Globe size={15} className="text-brand-700 shrink-0" />
        <span className="font-bold">{currentLang.native}</span>
        <ChevronDown size={13} className={clsx('text-stone-500 transition-transform duration-200', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          {/* Menu */}
          <div className="absolute right-0 mt-2 w-52 rounded-2xl bg-white shadow-xl border border-stone-200 py-1.5 z-50 animate-fade-in">
            <div className="px-3 py-1.5 border-b border-stone-100 text-xs font-bold text-stone-500 uppercase tracking-wider">
              Select Language / மொழி
            </div>
            {LANGUAGES.map((lang) => {
              const isSelected = currentCode === lang.code;
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => handleSelectLanguage(lang.code)}
                  aria-current={isSelected ? "true" : undefined}
                  lang={lang.code}
                  className={clsx(
                    'w-full text-left px-3.5 py-2.5 flex items-center justify-between text-xs sm:text-sm transition-colors hover:bg-brand-50 cursor-pointer focus:outline-none focus-visible:bg-brand-50',
                    isSelected ? 'font-bold text-brand-900 bg-brand-50/50' : 'text-stone-700'
                  )}
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">{lang.native}</span>
                    <span className="text-xs text-stone-500 font-normal">{lang.label} · {lang.sub}</span>
                  </div>
                  {isSelected && <Check size={15} className="text-brand-700 shrink-0" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
