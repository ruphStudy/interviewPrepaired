/**
 * Phase 9 ("Hybrid Audio Architecture") — the hybrid routing DECISION.
 *
 * Pure, deterministic, no I/O of its own (the injectable
 * `lookupManifestEntry`/`isDynamicTtsProviderAvailable`/
 * `isAudioAssetCdnAvailable` params default to the real, honest functions
 * in `constants/audioAssetManifest.ts`/`config/ttsProviderRegistry.ts`, but
 * are swappable in tests to exercise a "what if a provider WERE
 * registered" branch without touching global/env state).
 *
 * Preference order, per the master prompt's product strategy:
 *   FIXED phrase:     asset -> dynamic TTS (if appropriate/cheap) -> browser -> skip
 *   DYNAMIC question:  dynamic TTS -> cached exact-match audio -> browser -> text-only
 *
 * TODAY, both `isDynamicTtsProviderAvailable()` and `isAudioAssetCdnAvailable()`
 * are honestly `false` (no such provider exists anywhere in this codebase —
 * see `config/ttsProviderRegistry.ts`), so EVERY real call into this module
 * resolves to `browser_tts` (or `skip` for genuinely empty input) — proving
 * that honest degradation is this file's single most important correctness
 * property, not an incidental side effect. The "cached exact-match audio"
 * tier for dynamic questions is NOT decided here: whether cached audio
 * exists is runtime/session state the frontend's `TtsCache`
 * (frontend/src/utils/ttsCache.ts) owns, not something this pure,
 * server-side, per-request function can know ahead of time — this service
 * only decides the METHOD (`dynamic_tts`), and the frontend queue is
 * responsible for checking its cache before actually executing a
 * `dynamic_tts` item (today, always an honest cache miss — see
 * ttsCache.ts's own header).
 */

import { HumanizerInterviewMode, PHRASE_LIBRARY, PhraseCategory } from '../constants/phraseLibrary';
import { getManifestEntry, ManifestEntry } from '../constants/audioAssetManifest';
import { isAudioAssetCdnRegistered, isDynamicTtsProviderRegistered } from '../config/ttsProviderRegistry';

export type AudioRoutingMethod = 'asset' | 'dynamic_tts' | 'browser_tts' | 'skip';

export interface AudioRoutingDecision {
  method: AudioRoutingMethod;
  assetRef?: ManifestEntry;
  /** Human-readable justification — for tests/debugging/logging only, never spoken or sent verbatim to the candidate. */
  reason: string;
}

export interface FixedPhraseSegment {
  kind: 'fixed_phrase';
  phraseId: string;
  category: PhraseCategory;
}

export interface DynamicQuestionSegment {
  kind: 'dynamic_question';
  text: string;
}

export type AudioRoutingSegment = FixedPhraseSegment | DynamicQuestionSegment;

export interface AudioRoutingParams {
  segment: AudioRoutingSegment;
  locale: string;
  interviewMode: HumanizerInterviewMode;
  /** Injectable seams — default to the real, honest registry checks. Override only in tests. */
  isDynamicTtsProviderAvailable?: () => boolean;
  isAudioAssetCdnAvailable?: () => boolean;
  lookupManifestEntry?: (phraseId: string, locale: string) => ManifestEntry | undefined;
}

export function routeAudioSegment(params: AudioRoutingParams): AudioRoutingDecision {
  const {
    segment,
    locale,
    interviewMode,
    isDynamicTtsProviderAvailable = isDynamicTtsProviderRegistered,
    isAudioAssetCdnAvailable = isAudioAssetCdnRegistered,
    lookupManifestEntry = getManifestEntry,
  } = params;

  if (interviewMode === 'employer') {
    // Confirmed (Phase 8, re-verified this phase): the employer/hiring
    // candidate-facing flow never produces a ConversationHumanizerService
    // presentation plan at all — there is nothing for THIS service to route
    // audio for in that flow today. If it's ever invoked for that mode
    // regardless (defensive only), degrade to the cheapest/safest path
    // rather than considering a paid provider for a flow this phase never
    // actually wires up.
    if (segment.kind === 'fixed_phrase' && !PHRASE_LIBRARY.some((p) => p.id === segment.phraseId)) {
      return { method: 'skip', reason: 'employer mode + unknown phraseId — nothing to speak' };
    }
    if (segment.kind === 'dynamic_question' && !segment.text.trim()) {
      return { method: 'skip', reason: 'employer mode + empty dynamic question text — nothing to speak' };
    }
    return { method: 'browser_tts', reason: 'employer mode has no wired presentation-plan audio routing today; safe browser_tts degrade' };
  }

  if (segment.kind === 'fixed_phrase') {
    const phraseExists = PHRASE_LIBRARY.some((p) => p.id === segment.phraseId);
    if (!phraseExists) {
      return { method: 'skip', reason: 'unknown phraseId — nothing to speak' };
    }

    const assetEntry = lookupManifestEntry(segment.phraseId, locale);
    if (assetEntry && isAudioAssetCdnAvailable()) {
      return { method: 'asset', assetRef: assetEntry, reason: 'enabled manifest asset available on a registered asset CDN' };
    }

    if (isDynamicTtsProviderAvailable()) {
      // "Appropriate/cheap" for a short fixed phrase: today this branch is
      // only reachable when a real provider has been registered — until
      // then it never fires (see file header for why that's the point).
      return {
        method: 'dynamic_tts',
        reason: 'no asset available; a dynamic TTS provider is registered and considered appropriate for a short fixed phrase',
      };
    }

    return { method: 'browser_tts', reason: 'no asset, no dynamic TTS provider registered — honest degrade to browser TTS' };
  }

  // dynamic_question
  if (!segment.text || !segment.text.trim()) {
    return { method: 'skip', reason: 'empty dynamic question text — nothing to speak (question text itself is always shown separately, per Phase 7)' };
  }

  if (isDynamicTtsProviderAvailable()) {
    return { method: 'dynamic_tts', reason: 'dynamic TTS provider registered for per-turn question text' };
  }

  return {
    method: 'browser_tts',
    reason: 'no dynamic TTS provider registered — honest degrade to browser TTS (Phase 7/8\'s existing behavior)',
  };
}
