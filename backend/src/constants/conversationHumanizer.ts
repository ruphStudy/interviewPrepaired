/**
 * Phase 8 ("Conversation Humanizer") — the presentation-plan CONTRACT.
 *
 * Mirrors Phase 3's file split exactly: this module declares the shape
 * (`PresentationType`/`ConversationPresentationPlan`) and one small pure
 * mapping helper (`deriveHumanizerMode`); the actual deterministic
 * selection/composition logic lives in
 * `services/ConversationHumanizerService.ts`.
 *
 * `ConversationPresentationPlan` is presentation-ONLY output — every field
 * on it is already safe to speak/display verbatim by the time it leaves
 * `ConversationHumanizerService`. It never carries `moveType`/
 * `answerSignal`/`claimProbeType`/reason codes/priorities — those stay
 * server-side exactly as established by every prior phase's DTO-allowlist
 * discipline (see NextQuestionDecisionEngine.ts's own header comment).
 */

import { InterviewPurpose } from './interview';
import { HumanizerInterviewMode } from './phraseLibrary';

export { HUMANIZER_INTERVIEW_MODE_VALUES } from './phraseLibrary';
export type { HumanizerInterviewMode } from './phraseLibrary';

export const PRESENTATION_TYPE_VALUES = [
  'direct',
  'acknowledge_then_ask',
  'think_then_ask',
  'probe',
  'clarify',
  'challenge',
  'callback',
  'contradiction_clarification',
  'transition',
  'closing',
] as const;
export type PresentationType = (typeof PRESENTATION_TYPE_VALUES)[number];

/**
 * The FINAL, already-safe-to-speak presentation content for one turn's next
 * question. Additive-only field on the existing `submitAnswer`/next-question
 * response DTO (never a new endpoint) and additive-only field on
 * `IQuestion` (see interview.model.ts) — absent entirely whenever the
 * humanizer didn't run (uploaded/legacy/failure fallback) or produced a
 * pure-silence plan with nothing to say beyond the question itself.
 */
export interface ConversationPresentationPlan {
  presentationType: PresentationType;
  /** Phrase-library id of the chosen acknowledgement phrase, if any — kept so future turns' repetition-avoidance can scan persisted question history (see ConversationHumanizerService.deriveRecentPhraseHistory) without a new parallel field on Interview. */
  acknowledgementPhraseId?: string;
  acknowledgementText?: string;
  transitionPhraseId?: string;
  transitionText?: string;
  /** Presentation-only spoken-form question text — NEVER written back over `IQuestion.questionText`, which stays canonical/unchanged for evaluation/persistence/analytics. */
  spokenQuestionText: string;
  prePauseMs: number;
  betweenPauseMs: number;
  /** Reuses `PresentationState`'s exact vocabulary (useInterviewPresentationState.ts) — never a parallel vocabulary. Always `'ASKING_QUESTION'` today: every plan this service produces collapses into that one continuous frontend span (see Phase 7's bug fix this phase must not reintroduce). */
  avatarStateHint: string;
  /** true = nothing to say beyond the question itself (no acknowledgement AND no transition phrase) — the frontend's fast path: speak `spokenQuestionText` with no lead-in. */
  silenceOnly: boolean;
  toneHint?: string;
  /**
   * Phase 12B — optional, additive. Names one of the frontend's EXISTING
   * `VoiceDynamicsSegmentCategory` values (frontend/src/config/voiceDynamics.ts)
   * for the acknowledgement item's rate/pitch preset, reusing that same
   * shared-string-vocabulary convention `avatarStateHint` already
   * established between backend/frontend (never a new preset/number —
   * only ever one of the six category names that table already defines).
   * Absent whenever personality is PROFESSIONAL (baseline, unmodified) or
   * the ack category doesn't have a personality-appropriate nudge defined
   * — the frontend's existing derivation (ack category -> its own default
   * preset) applies automatically whenever this is absent.
   */
  voiceDynamicsHint?: string;
}

/**
 * The ONE place that maps real, already-in-scope `Interview` fields to the
 * humanizer's audience taxonomy — never re-derived ad hoc at a call site.
 * Deliberately takes only the minimal field subset (not the full
 * `IInterview`) so this stays import-cycle-safe: this module is imported by
 * interview.model.ts (for the `ConversationPresentationPlan` type on
 * `IQuestion`), so it must never import interview.model.ts back.
 *
 * Phase 12A fix — `organizationId` (institute) is now checked BEFORE
 * `interviewMode === 'uploaded'`. Before this fix, an institute-assigned
 * interview (which is ALWAYS created via `createInstituteUploadedInterview`,
 * setting BOTH `organizationId` and `interviewMode: 'uploaded'` — confirmed
 * since Phase 1) resolved to `'uploaded'` instead of `'institute'`, silently
 * losing the business-context signal in favor of an orthogonal
 * content-source one. Confirmed BEHAVIOR-INERT for every phrase currently in
 * `phraseLibrary.ts` (practice/uploaded/institute are treated identically by
 * every category except the practice-only WELCOME warmer, which excludes
 * uploaded AND institute equally) — this is a correctness fix for future
 * mode-specific content/policy (see constants/interviewModePolicy.ts), not a
 * behavior change to any existing phrase selection. A personal (non-org)
 * uploaded-question-set interview still resolves to `'uploaded'` exactly as
 * before.
 */
export function deriveHumanizerMode(interview: {
  purpose?: InterviewPurpose;
  interviewMode?: 'ai-generated' | 'uploaded';
  organizationId?: unknown;
}): HumanizerInterviewMode {
  if (interview.purpose === InterviewPurpose.HIRING_ASSESSMENT) return 'employer';
  if (interview.organizationId) return 'institute';
  if (interview.interviewMode === 'uploaded') return 'uploaded';
  return 'practice';
}
