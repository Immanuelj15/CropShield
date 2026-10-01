import React from 'react';

const LANGUAGES = [
  { code: 'ta', label: 'தமிழ்', short: 'TA' },
  { code: 'hi', label: 'हिंदी', short: 'HI' },
  { code: 'en', label: 'English', short: 'EN' },
];

export default function LanguageToggle({ currentLang = 'en', onLanguageChange }) {
  return (
    <div
      className="inline-flex items-center p-1 bg-stone-100 rounded-xl border border-stone-200 text-xs font-semibold select-none"
      role="radiogroup"
      aria-label="Language Selector"
    >
      {LANGUAGES.map((lang) => {
        const isActive = currentLang === lang.code;
        return (
          <button
            key={lang.code}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onLanguageChange && onLanguageChange(lang.code)}
            className={`px-2.5 py-1 rounded-lg transition-all duration-200 flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
              isActive
                ? 'bg-brand-600 text-white shadow-sm font-bold scale-[1.02]'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60'
            }`}
          >
            <span>{lang.label}</span>
          </button>
        );
      })}
    </div>
  );
}
