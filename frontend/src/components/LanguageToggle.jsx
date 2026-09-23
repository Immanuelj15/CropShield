import React from 'react';

const LANGUAGES = [
  { code: 'ta', label: 'தமிழ்', short: 'TA' },
  { code: 'hi', label: 'हिंदी', short: 'HI' },
  { code: 'en', label: 'English', short: 'EN' },
];

export default function LanguageToggle({ currentLang = 'en', onLanguageChange }) {
  return (
    <div
      className="inline-flex items-center p-1 bg-stone-100 dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-semibold select-none"
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
            className={`px-2.5 py-1 rounded-lg transition-all duration-200 flex items-center gap-1 ${
              isActive
                ? 'bg-emerald-600 text-white shadow-sm font-bold scale-[1.02]'
                : 'text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white hover:bg-stone-200/60 dark:hover:bg-stone-700/60'
            }`}
          >
            <span>{lang.label}</span>
          </button>
        );
      })}
    </div>
  );
}
