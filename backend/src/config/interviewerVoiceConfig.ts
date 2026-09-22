/**
 * Phase 9 ("Hybrid Audio Architecture") — centralized "which provider/voice
 * speaks this segment type" config, keyed by `AudioSegmentType`
 * (constants/audioSegmentType.ts).
 *
 * TODAY every segment type resolves to the exact same honest answer: there
 * is no backend TTS provider anywhere in this codebase (see
 * config/ttsProviderRegistry.ts) — the only producer of audible interviewer
 * speech is the browser's native `window.speechSynthesis` via
 * `frontend/src/services/voice.service.ts`, whose own `selectBestVoice`
 * already picks the best-installed voice for the interview's language at
 * speak-time. `voiceName` is deliberately left `undefined` here — there is
 * no server-resolvable "named voice" to hand it; inventing a fake voice
 * name (e.g. a Chirp3 voice id) today would be exactly the "fake provider"
 * fabrication this phase must not do. Once a real provider is registered
 * (`ttsProviderRegistry.ts` flips to `true`), this table becomes the place
 * to assign its actual per-segment-type voice names — additive, no
 * migration needed since every consumer already treats `voiceName` as
 * optional.
 *
 * Bounded speaking-rate/pitch presets (9D) are a BROWSER-ONLY concept
 * (`SpeechSynthesisUtterance.rate`/`.pitch`) and therefore live on the
 * frontend (`frontend/src/config/voiceDynamics.ts`), not here — this file
 * only owns the provider/voice/language seam that is genuinely
 * server-resolvable today (and will matter once a real provider exists).
 */

import { AudioSegmentType } from '../constants/audioSegmentType';
import { DEFAULT_LANGUAGE_CODE } from './languages';

export type InterviewerVoiceProvider = 'browser_tts';

export interface InterviewerVoiceConfig {
  provider: InterviewerVoiceProvider;
  voiceName?: string;
  language: string;
}

const BASE_CONFIG: InterviewerVoiceConfig = { provider: 'browser_tts', language: DEFAULT_LANGUAGE_CODE };

export const INTERVIEWER_VOICE_CONFIG_BY_SEGMENT_TYPE: Record<AudioSegmentType, InterviewerVoiceConfig> = {
  FIXED_REACTION: { ...BASE_CONFIG },
  FIXED_TRANSITION: { ...BASE_CONFIG },
  FIXED_THINKING: { ...BASE_CONFIG },
  FIXED_WELCOME: { ...BASE_CONFIG },
  FIXED_CLOSING: { ...BASE_CONFIG },
  DYNAMIC_QUESTION: { ...BASE_CONFIG },
  DYNAMIC_CONTEXTUAL_FOLLOWUP: { ...BASE_CONFIG },
};

/** Never throws; falls back to `DEFAULT_LANGUAGE_CODE` base config for an unrecognized segment type (defensive only — `AudioSegmentType` is a closed union). */
export function getInterviewerVoiceConfig(
  segmentType: AudioSegmentType,
  language: string = DEFAULT_LANGUAGE_CODE
): InterviewerVoiceConfig {
  const base = INTERVIEWER_VOICE_CONFIG_BY_SEGMENT_TYPE[segmentType] ?? BASE_CONFIG;
  return { ...base, language };
}
