/**
 * Phase 9D — TTS exact-text cache INTERFACE, plus a deterministic cache-key
 * builder and an honest today-implementation.
 *
 * The KEY LOGIC (`buildTtsCacheKey`) is the real, valuable, testable
 * artifact here: same (text, locale, provider, voice, rate) must always
 * produce the same key, and any single differing field must produce a
 * different key, so a future real cache (backed by a provider that returns
 * retrievable audio bytes) can be dropped in behind this interface with no
 * call-site changes.
 *
 * `noopTtsCache` is deliberately an always-miss no-op — NOT a fake
 * in-memory cache that pretends to store/reuse browser-synthesized audio.
 * The Web Speech API (`window.speechSynthesis`) provides no mechanism to
 * capture or replay the bytes it synthesizes — `SpeechSynthesisUtterance`
 * is fire-and-forget, there is no `MediaRecorder`-style tap on its output
 * — so there is genuinely nothing real to cache while browser TTS is the
 * only provider. This is honest behavior for today's provider landscape,
 * not a stub to "fill in later" within this phase.
 */

export interface CachedAudioRef {
  /** A retrievable URL/blob reference — only ever populated by a REAL provider integration, never fabricated. */
  url?: string;
  createdAt: number;
}

export interface TtsCacheKeyParams {
  text: string;
  locale: string;
  provider: string;
  voice: string;
  rate: number;
}

/** Same normalization convention used by the backend's exact-text hashing (constants/audioAssetManifest.ts / InterviewAnswerOrchestratorService.normalizeAnswer): trim + collapse internal whitespace, case-insensitive (a cache key is not a display value, so case shouldn't fragment it). */
function normalizeCacheText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Deterministic, normalized-text-based cache key. Every field that could
 * legitimately produce DIFFERENT audio (different provider, different
 * voice, different speaking rate, different locale) is part of the key —
 * omitting any of them would risk serving mismatched cached audio once a
 * real cache exists.
 */
export function buildTtsCacheKey(params: TtsCacheKeyParams): string {
  const { text, locale, provider, voice, rate } = params;
  return [normalizeCacheText(text), locale, provider, voice, String(rate)].join('|');
}

export interface TtsCache {
  get(key: string): CachedAudioRef | undefined;
  set(key: string, ref: CachedAudioRef): void;
}

/** The only honest implementation today — see file header. */
export const noopTtsCache: TtsCache = {
  get: () => undefined,
  set: () => {
    /* no-op: nothing real to store */
  },
};
