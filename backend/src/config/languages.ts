/**
 * Central supported-interview-language config. Adding a language later should
 * only require one new entry here (plus the matching frontend entry in
 * frontend/src/config/languages.ts) — no scattered if/else per language.
 */

export interface SupportedLanguage {
  code: string;
  label: string;
}

export const SUPPORTED_LANGUAGES = [
  { code: 'en-IN', label: 'English' },
  { code: 'hi-IN', label: 'Hindi' },
  { code: 'mr-IN', label: 'Marathi' },
] as const satisfies readonly SupportedLanguage[];

/** The authoritative language-code type — derived from SUPPORTED_LANGUAGES so it can never drift out of sync. */
export type SupportedLanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

export const SUPPORTED_LANGUAGE_CODES = SUPPORTED_LANGUAGES.map((l) => l.code) as [
  SupportedLanguageCode,
  ...SupportedLanguageCode[]
];

export const DEFAULT_LANGUAGE_CODE: SupportedLanguageCode = 'en-IN';

export function isSupportedLanguageCode(value: unknown): value is SupportedLanguageCode {
  return typeof value === 'string' && (SUPPORTED_LANGUAGE_CODES as readonly string[]).includes(value);
}

/** Normalizes to a supported code, falling back to English for missing/unknown values — never throws. */
export function normalizeLanguageCode(value: unknown): SupportedLanguageCode {
  return isSupportedLanguageCode(value) ? value : DEFAULT_LANGUAGE_CODE;
}

// One instruction per language, reused by every OpenAI prompt that produces
// user-visible text — avoids repeating/duplicating language guidance in each
// service. Technical/workplace English terms are deliberately NOT translated
// — natural code-mixed Hindi/Marathi is preferred over literal translation.
const LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  'en-IN': 'Respond in professional English suitable for an Indian interview.',
  'hi-IN':
    'Respond primarily in natural Hindi suitable for an Indian professional interview. Common technical and workplace terms (e.g. API, database, production, deployment, Node.js) may remain in English where that sounds natural — do not force literal translation of every technical term. Understand Hindi-English code-mixed candidate answers.',
  'mr-IN':
    'Respond primarily in natural Marathi suitable for an Indian professional interview. Common technical and workplace terms (e.g. API, database, production, deployment, Node.js) may remain in English where that sounds natural — do not force literal translation of every technical term. Understand Marathi-English code-mixed candidate answers.',
};

/** Never throws — unknown/missing language codes fall back to the English instruction. */
export function getLanguageInstruction(languageCode?: string | null): string {
  return LANGUAGE_INSTRUCTIONS[normalizeLanguageCode(languageCode)];
}

/**
 * Devanagari (Hindi/Marathi) text costs noticeably more tokens per unit of
 * meaning than English, which was truncating multi-field JSON responses
 * (e.g. evaluateAnswer's strengths/weaknesses/suggestions) mid-object and
 * failing to parse. English keeps its exact existing token budget; only
 * non-English requests get headroom, so this doesn't inflate English cost.
 */
export function getMaxTokensForLanguage(baseMaxTokens: number, languageCode?: string | null): number {
  return normalizeLanguageCode(languageCode) === DEFAULT_LANGUAGE_CODE
    ? baseMaxTokens
    : Math.round(baseMaxTokens * 1.5);
}
