/**
 * Phase 9C — the typed, pure, directly-unit-testable Audio Plan builder.
 *
 * Extracted from Phase 8's inline `speakPresentationSequence` sequencing
 * logic in `pages/InterviewScreen.tsx` (ack -> pause -> transition -> pause
 * -> question), which this module now OWNS as a pure function. It never
 * calls `voiceService`/`speak()` itself and has no side effects — the
 * playback queue (`hooks/useAudioPlaybackQueue.ts`) is the only consumer
 * that executes a plan.
 *
 * Structural guarantee: `ConversationPresentationPlan`
 * (api/interviewApi.ts, mirroring backend/src/constants/conversationHumanizer.ts)
 * has exactly ONE optional `acknowledgementText` field and exactly ONE
 * optional `transitionText` field — there is no array, no list, nothing
 * that could ever hold a second one. Since `buildAudioPlan` below reads
 * each of those fields exactly once, it is structurally (not just
 * conventionally) impossible for the returned plan to contain more than
 * one acknowledgement-family item or more than one transition-family item
 * before the question item — see `audioPlanBuilder.scratch.ts` for the
 * property proof referenced in this phase's report.
 *
 * Routing: every item defaults to `'browser_tts'` — the only real,
 * honestly-available method today (no backend TTS/asset provider exists —
 * see `backend/src/services/AudioRoutingService.ts`'s header). An optional
 * `AudioPlanRoutingDecisions` override exists purely so the architecture is
 * ready to be driven by a real routing decision once one exists; it is
 * never populated by any real call site in this phase (see this phase's
 * report for why no manifest-fetch endpoint was added).
 */

import { ConversationPresentationPlan } from '../api/interviewApi';
import { VOICE_DYNAMICS_BY_SEGMENT_CATEGORY, VoiceDynamicsSegmentCategory } from '../config/voiceDynamics';

/** Type guard for `ConversationPresentationPlan.voiceDynamicsHint` (Phase 12B) — a plain, unvalidated string on the wire; only forward it into the EXISTING preset table when it names one of that table's real keys, otherwise fall back to the category the caller already derived. */
function isKnownVoiceDynamicsCategory(value: string | undefined): value is VoiceDynamicsSegmentCategory {
  return !!value && Object.prototype.hasOwnProperty.call(VOICE_DYNAMICS_BY_SEGMENT_CATEGORY, value);
}

export type AudioItemMethod = 'asset' | 'dynamic_tts' | 'browser_tts' | 'skip';

/**
 * Phase 10B — an optional per-item semantic hint, reusing
 * `PresentationState`'s exact vocabulary (useInterviewPresentationState.ts)
 * string-for-string, mirroring `ConversationPresentationPlan.avatarStateHint`
 * (backend/src/constants/conversationHumanizer.ts) field-for-field — never a
 * second/parallel vocabulary. `buildAudioPlan` below sets this from the
 * REAL `presentationPlan.avatarStateHint` the backend already computed
 * (previously read by nothing on the frontend), not a re-derived guess.
 *
 * Deliberately a single value shared by every item in one plan today,
 * exactly matching `ConversationPresentationPlan.avatarStateHint`'s own
 * "always `'ASKING_QUESTION'`" contract (see that field's doc comment) —
 * differentiating it per item (e.g. showing "ACKNOWLEDGING" for the
 * acknowledgement item and "ASKING_QUESTION" only for the question item)
 * would reintroduce the exact flicker this whole lead-in+question span was
 * deliberately made continuous to avoid: `InterviewScreen.tsx` already
 * calls `beginAsking()` (entering the reducer's own `ASKING_QUESTION`)
 * BEFORE any lead-in item plays, so the avatar is genuinely, correctly
 * "speaking" for the acknowledgement/transition/question alike — there is
 * no real distinct visual for "speaking an acknowledgement" vs "speaking
 * the question" today (one looping video, see InterviewAvatar.tsx).
 */
export type AudioPlanAvatarHint = string;

export interface PauseItem {
  type: 'pause';
  durationMs: number;
}

export interface SilenceItem {
  type: 'silence';
}

export interface AssetItem {
  type: 'asset';
  phraseId: string;
  /** A real, retrievable audio URL — always `undefined` today (no manifest entry is ever `enabled` yet). */
  url?: string;
  /** The exact text to fall back to if `url` is absent/unplayable — every `AssetItem` the queue ever actually executes today degrades through this, never silently drops the segment. */
  fallbackText: string;
  rate?: number;
  pitch?: number;
  avatarState?: AudioPlanAvatarHint;
}

export interface DynamicTtsItem {
  type: 'dynamic_tts';
  text: string;
  rate?: number;
  pitch?: number;
  avatarState?: AudioPlanAvatarHint;
}

export interface BrowserTtsItem {
  type: 'browser_tts';
  text: string;
  rate?: number;
  pitch?: number;
  avatarState?: AudioPlanAvatarHint;
}

export type AudioPlanItem = PauseItem | SilenceItem | AssetItem | DynamicTtsItem | BrowserTtsItem;

export interface AudioPlanRoutingDecisions {
  acknowledgement?: AudioItemMethod;
  transition?: AudioItemMethod;
  /** Dynamic question text can never genuinely route to `'asset'` (it is never a fixed library phrase) — `'skip'` is also excluded since visible question text is always shown separately (Phase 7) regardless of audio. */
  question?: 'dynamic_tts' | 'browser_tts';
}

function toFixedPhraseItem(
  text: string,
  phraseId: string | undefined,
  method: AudioItemMethod,
  preset: { rate: number; pitch: number },
  avatarState: AudioPlanAvatarHint
): AudioPlanItem | null {
  if (method === 'skip') return null;
  if (method === 'asset' && phraseId) {
    return { type: 'asset', phraseId, fallbackText: text, rate: preset.rate, pitch: preset.pitch, avatarState };
  }
  if (method === 'dynamic_tts') {
    return { type: 'dynamic_tts', text, rate: preset.rate, pitch: preset.pitch, avatarState };
  }
  return { type: 'browser_tts', text, rate: preset.rate, pitch: preset.pitch, avatarState };
}

/**
 * Builds the full ordered plan — `[pause?, ack?, pause?, transition?,
 * question]` — for one presentation turn. `fallbackQuestionText` mirrors
 * `speakPresentationSequence`'s existing `presentation.spokenQuestionText
 * || fallbackQuestionText` precedent (an older/degraded plan could in
 * principle carry an empty `spokenQuestionText`).
 *
 * Callers that need to preserve Phase 7's "askCurrentQuestion is always the
 * final step that mints the question generation" contract (see
 * `InterviewScreen.tsx`) should play everything EXCEPT the last item
 * through the queue, then invoke `askCurrentQuestion` themselves for the
 * question — `splitLeadInAndQuestion` below does exactly that split.
 */
export function buildAudioPlan(
  presentationPlan: ConversationPresentationPlan,
  fallbackQuestionText: string,
  routing: AudioPlanRoutingDecisions = {}
): AudioPlanItem[] {
  const items: AudioPlanItem[] = [];
  const questionText = presentationPlan.spokenQuestionText || fallbackQuestionText;

  const pushQuestionItem = () => {
    if (!questionText) return; // matches askCurrentQuestion's own `if (!question) return;` guard — no dead-air item for genuinely empty text
    const category =
      presentationPlan.presentationType === 'challenge' || presentationPlan.presentationType === 'contradiction_clarification'
        ? 'CHALLENGE_SCENARIO'
        : 'TECHNICAL_QUESTION';
    const preset = VOICE_DYNAMICS_BY_SEGMENT_CATEGORY[category];
    const method = routing.question ?? 'browser_tts';
    const avatarState = presentationPlan.avatarStateHint;
    items.push(
      method === 'dynamic_tts'
        ? { type: 'dynamic_tts', text: questionText, rate: preset.rate, pitch: preset.pitch, avatarState }
        : { type: 'browser_tts', text: questionText, rate: preset.rate, pitch: preset.pitch, avatarState }
    );
  };

  if (presentationPlan.silenceOnly) {
    pushQuestionItem();
    return items;
  }

  if (presentationPlan.acknowledgementText) {
    if (presentationPlan.prePauseMs > 0) items.push({ type: 'pause', durationMs: presentationPlan.prePauseMs });
    const defaultAckCategory: VoiceDynamicsSegmentCategory = presentationPlan.presentationType === 'think_then_ask' ? 'THINKING' : 'NEUTRAL_ACK';
    // Phase 12B — a personality-nudged hint from the backend overrides the
    // default category ONLY when it names a real, already-existing preset
    // key (never a new number) — absent/unrecognized falls back to the
    // exact pre-Phase-12 derivation above, unchanged.
    const ackCategory = isKnownVoiceDynamicsCategory(presentationPlan.voiceDynamicsHint) ? presentationPlan.voiceDynamicsHint : defaultAckCategory;
    const ackItem = toFixedPhraseItem(
      presentationPlan.acknowledgementText,
      presentationPlan.acknowledgementPhraseId,
      routing.acknowledgement ?? 'browser_tts',
      VOICE_DYNAMICS_BY_SEGMENT_CATEGORY[ackCategory],
      presentationPlan.avatarStateHint
    );
    if (ackItem) items.push(ackItem);
  }

  if (presentationPlan.transitionText) {
    if (presentationPlan.betweenPauseMs > 0) items.push({ type: 'pause', durationMs: presentationPlan.betweenPauseMs });
    // Transition phrases are short, neutral filler — same treatment as an acknowledgement, never a parallel preset table entry.
    const transitionItem = toFixedPhraseItem(
      presentationPlan.transitionText,
      presentationPlan.transitionPhraseId,
      routing.transition ?? 'browser_tts',
      VOICE_DYNAMICS_BY_SEGMENT_CATEGORY.NEUTRAL_ACK,
      presentationPlan.avatarStateHint
    );
    if (transitionItem) items.push(transitionItem);
  }

  pushQuestionItem();
  return items;
}

/**
 * Splits a built plan into everything BEFORE the final (question) item and
 * the question item itself — `InterviewScreen.tsx` plays `leadIn` through
 * `useAudioPlaybackQueue`, then always calls its own `askCurrentQuestion`
 * for `question` (or the fallback text if the plan produced none), keeping
 * Phase 7's exact "askCurrentQuestion is the one place that mints the final
 * question generation" contract intact.
 */
export function splitLeadInAndQuestion(plan: AudioPlanItem[]): {
  leadIn: AudioPlanItem[];
  questionItem: DynamicTtsItem | BrowserTtsItem | undefined;
} {
  if (plan.length === 0) return { leadIn: [], questionItem: undefined };
  const last = plan[plan.length - 1];
  if (last.type === 'dynamic_tts' || last.type === 'browser_tts') {
    return { leadIn: plan.slice(0, -1), questionItem: last };
  }
  // Defensive only — buildAudioPlan always ends on a dynamic_tts/browser_tts
  // question item (or produces an empty plan for empty text), so this
  // branch is unreachable in practice.
  return { leadIn: plan, questionItem: undefined };
}
