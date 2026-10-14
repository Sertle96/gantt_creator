import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import de from './de';
import en from './en';

export type Language = 'de' | 'en';
export const LANGUAGES: Language[] = ['de', 'en'];

const STORAGE_KEY = 'gantt-creator.language';

function initialLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'de' || stored === 'en') return stored;
  } catch {
    // storage unavailable
  }
  return navigator.language?.toLowerCase().startsWith('de') ? 'de' : 'en';
}

void i18n.use(initReactI18next).init({
  resources: { de: { translation: de }, en: { translation: en } },
  lng: initialLanguage(),
  fallbackLng: 'de',
  interpolation: { escapeValue: false },
  returnObjects: true,
});

export function setLanguage(lng: Language) {
  void i18n.changeLanguage(lng);
  document.documentElement.lang = lng;
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    // storage unavailable
  }
}

export function currentLanguage(): Language {
  return i18n.language === 'en' ? 'en' : 'de';
}

export function locale(): string {
  return currentLanguage() === 'de' ? 'de-DE' : 'en-GB';
}

export default i18n;
