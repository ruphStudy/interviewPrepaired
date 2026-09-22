/**
 * Phase 9D — bounded speaking-rate/pitch presets, per segment category.
 *
 * `SpeechSynthesisUtterance.rate`/`.pitch` (frontend/src/services/voice.service.ts)
 * is the ONLY place these numbers are ever consumed — this is a purely
 * client-side, browser-TTS concept, so (unlike the provider/voice/language
 * seam in backend/src/config/interviewerVoiceConfig.ts, which is genuinely
 * server-resolvable) it lives here rather than being duplicated server-side.
 *
 * `TECHNICAL_QUESTION`'s preset (0.9 / 1.0) is deliberately IDENTICAL to
 * `voice.service.ts`'s pre-Phase-9 hardcoded values — the primary dynamic
 * question path sounds byte-for-byte the same as before. The other five
 * categories are a genuinely new, additive Phase 9 capability (small,
 * bounded variation around that same baseline), not a bug fix, and are
 * applied only within the new presentation-plan audio queue
 * (utils/audioPlanBuilder.ts / hooks/useAudioPlaybackQueue.ts) — the
 * welcome/closing phrase sequences in InterviewScreen.tsx (a separate,
 * older static phrase table Phase 8 never touched either) are left calling
 * `speak()` with no explicit rate/pitch this phase, which keeps their
 * exact pre-existing 0.9/1.0 behavior unchanged.
 */

export type VoiceDynamicsSegmentCategory =
  | 'WELCOME'
  | 'NEUTRAL_ACK'
  | 'THINKING'
  | 'TECHNICAL_QUESTION'
  | 'CHALLENGE_SCENARIO'
  | 'CLOSING';

export interface VoiceDynamicsPreset {
  rate: number;
  pitch: number;
}

export const VOICE_DYNAMICS_BY_SEGMENT_CATEGORY: Record<VoiceDynamicsSegmentCategory, VoiceDynamicsPreset> = {
  WELCOME: { rate: 0.95, pitch: 1.0 },
  NEUTRAL_ACK: { rate: 1.0, pitch: 1.0 },
  THINKING: { rate: 0.95, pitch: 1.0 },
  // Unchanged from voice.service.ts's pre-existing hardcoded defaults.
  TECHNICAL_QUESTION: { rate: 0.9, pitch: 1.0 },
  CHALLENGE_SCENARIO: { rate: 0.9, pitch: 1.0 },
  CLOSING: { rate: 0.95, pitch: 1.0 },
};

export function getVoiceDynamicsPreset(category: VoiceDynamicsSegmentCategory): VoiceDynamicsPreset {
  return VOICE_DYNAMICS_BY_SEGMENT_CATEGORY[category];
}
