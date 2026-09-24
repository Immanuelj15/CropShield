import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// English
import enCommon from './locales/en/common.json';
import enAuth from './locales/en/auth.json';
import enFarmer from './locales/en/farmer.json';
import enAgronomist from './locales/en/agronomist.json';
import enAdmin from './locales/en/admin.json';
import enValidation from './locales/en/validation.json';

// Tamil
import taCommon from './locales/ta/common.json';
import taAuth from './locales/ta/auth.json';
import taFarmer from './locales/ta/farmer.json';
import taAgronomist from './locales/ta/agronomist.json';
import taAdmin from './locales/ta/admin.json';
import taValidation from './locales/ta/validation.json';

// Hindi
import hiCommon from './locales/hi/common.json';
import hiAuth from './locales/hi/auth.json';
import hiFarmer from './locales/hi/farmer.json';
import hiAgronomist from './locales/hi/agronomist.json';
import hiAdmin from './locales/hi/admin.json';
import hiValidation from './locales/hi/validation.json';

// Telugu
import teCommon from './locales/te/common.json';
import teAuth from './locales/te/auth.json';
import teFarmer from './locales/te/farmer.json';
import teAgronomist from './locales/te/agronomist.json';
import teAdmin from './locales/te/admin.json';
import teValidation from './locales/te/validation.json';

// Malayalam
import mlCommon from './locales/ml/common.json';
import mlAuth from './locales/ml/auth.json';
import mlFarmer from './locales/ml/farmer.json';
import mlAgronomist from './locales/ml/agronomist.json';
import mlAdmin from './locales/ml/admin.json';
import mlValidation from './locales/ml/validation.json';

const resources = {
  en: {
    common: enCommon,
    auth: enAuth,
    farmer: enFarmer,
    agronomist: enAgronomist,
    admin: enAdmin,
    validation: enValidation,
  },
  ta: {
    common: taCommon,
    auth: taAuth,
    farmer: taFarmer,
    agronomist: taAgronomist,
    admin: taAdmin,
    validation: taValidation,
  },
  hi: {
    common: hiCommon,
    auth: hiAuth,
    farmer: hiFarmer,
    agronomist: hiAgronomist,
    admin: hiAdmin,
    validation: hiValidation,
  },
  te: {
    common: teCommon,
    auth: teAuth,
    farmer: teFarmer,
    agronomist: teAgronomist,
    admin: teAdmin,
    validation: teValidation,
  },
  ml: {
    common: mlCommon,
    auth: mlAuth,
    farmer: mlFarmer,
    agronomist: mlAgronomist,
    admin: mlAdmin,
    validation: mlValidation,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    ns: ['common', 'auth', 'farmer', 'agronomist', 'admin', 'validation'],
    defaultNS: 'common',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
  });

// Set document data-lang attribute on initialize and change
const applyLangAttribute = (lang) => {
  if (typeof document !== 'undefined') {
    const cleanLang = (lang || 'en').split('-')[0];
    document.body.dataset.lang = cleanLang;
    document.documentElement.lang = cleanLang;
  }
};

applyLangAttribute(i18n.language);
i18n.on('languageChanged', (lng) => {
  applyLangAttribute(lng);
});

export default i18n;
