import { useTranslation } from 'react-i18next';

/**
 * Pure function to extract localized string from a multi-language object or string.
 * @param {string|object} field - e.g. "Cotton Whitefly" or { en: "Cotton Whitefly", ta: "பருத்தி வெள்ளை ஈ", ... }
 * @param {string} lang - language code ('en', 'ta', 'hi', 'te', 'ml')
 * @returns {string}
 */
export function getLocalizedText(field, lang = 'en') {
  if (!field) return '';
  if (typeof field === 'string') return field;
  if (Array.isArray(field)) {
    return field.map((item) => getLocalizedText(item, lang));
  }
  if (typeof field === 'object') {
    const cleanLang = (lang || 'en').split('-')[0].toLowerCase();
    if (field[cleanLang]) return field[cleanLang];
    if (field['en']) return field['en'];
    // Fallback to first available value
    const firstVal = Object.values(field)[0];
    return typeof firstVal === 'string' ? firstVal : '';
  }
  return String(field);
}

/**
 * React hook to reactively resolve multi-language database content based on active i18n language.
 * Automatically re-evaluates when language changes.
 */
export function useLocalizedField() {
  const { i18n } = useTranslation();
  const currentLang = i18n.language ? i18n.language.split('-')[0].toLowerCase() : 'en';

  const localize = (field) => getLocalizedText(field, currentLang);

  return {
    localize,
    currentLang,
  };
}

export default useLocalizedField;
