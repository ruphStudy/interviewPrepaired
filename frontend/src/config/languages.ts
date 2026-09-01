/**
 * Central supported-interview-language config. Adding a language later
 * should only require one new entry here (plus the matching backend entry
 * in backend/src/config/languages.ts) — never scattered if/else per language.
 */

export interface LanguageOption {
  code: string;
  key: string;
  label: string;
  nativeLabel: string;
  speechRecognitionLang: string;
  speechSynthesisLang: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  {
    code: 'en-IN',
    key: 'english',
    label: 'English',
    nativeLabel: 'English',
    speechRecognitionLang: 'en-IN',
    speechSynthesisLang: 'en-IN',
  },
  {
    code: 'hi-IN',
    key: 'hindi',
    label: 'Hindi',
    nativeLabel: 'हिंदी',
    speechRecognitionLang: 'hi-IN',
    speechSynthesisLang: 'hi-IN',
  },
  {
    code: 'mr-IN',
    key: 'marathi',
    label: 'Marathi',
    nativeLabel: 'मराठी',
    speechRecognitionLang: 'mr-IN',
    speechSynthesisLang: 'mr-IN',
  },
];

export const DEFAULT_LANGUAGE_CODE = 'en-IN';

export function getLanguageByCode(code?: string | null): LanguageOption {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code) || SUPPORTED_LANGUAGES[0];
}
