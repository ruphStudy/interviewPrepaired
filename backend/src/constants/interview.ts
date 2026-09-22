/**
 * Authoritative interview lifecycle status values — the exact same strings
 * already used by the Mongo schema/active code today, just centralized so
 * they aren't duplicated as raw literals across the model/service/routes.
 * Existing stored documents are unaffected: these values are unchanged.
 */
export enum InterviewStatus {
  /** Shell persisted, but no usable first question yet — never returned to the client as a successful start. */
  CREATED = 'created',
  /** First question exists — the only status that can accept an answer. */
  IN_PROGRESS = 'in-progress',
  /** Stored/validated for existing-data compatibility; pause/resume behavior is not implemented. */
  PAUSED = 'paused',
  COMPLETED = 'completed',
  EVALUATED = 'evaluated',
}

/** Only IN_PROGRESS interviews may accept an answer submission. */
export function isAnswerableStatus(status: InterviewStatus): boolean {
  return status === InterviewStatus.IN_PROGRESS;
}

/**
 * What an interview is FOR (20E) — orthogonal to `status` above. Defaults
 * to PRACTICE for every existing/ordinary interview (personal or
 * institute-assigned); HIRING_ASSESSMENT is used only for the employer
 * candidate-invitation session-creation flow.
 */
export enum InterviewPurpose {
  PRACTICE = 'practice',
  HIRING_ASSESSMENT = 'hiring_assessment',
}

// Shared safety bound for any non-AI-generated question list (uploaded-file
// parsing, saved/manual question sets) — not the AI-generated-interview 1–10
// cap. Used by InterviewService and QuestionSetService; keep it in one place
// so the two never drift out of sync.
export const MAX_UPLOADED_QUESTIONS = 200;

/**
 * Where a question came from (Phase 1 of the answer-aware-interviewer
 * effort — see IQuestion in interview.model.ts). `'ai'` and `'uploaded'`
 * are the original two values and MUST NEVER be removed/renamed: existing
 * stored questions use them and the schema enum must keep accepting them.
 *
 * The remaining values are additive taxonomy for how a question was
 * decided, most of them reserved for LATER phases' actual decision logic:
 * - `'blueprint'`: chosen deterministically to target a specific, not-yet-
 *   covered/least-covered blueprint competency — this is the ONLY new value
 *   this phase actually sets (see InterviewService.buildQuestionTagging).
 * - `'answer_followup' | 'claim_probe' | 'contradiction_probe' |
 *   'coverage_gap' | 'scenario' | 'memory_callback'`: reserved for a later
 *   phase's answer-aware follow-up/probing decision engine — added to the
 *   type/enum now so that engine has somewhere to record its decision, but
 *   nothing in this codebase sets them yet.
 */
export const QUESTION_SOURCE_VALUES = [
  'ai',
  'uploaded',
  'blueprint',
  'answer_followup',
  'claim_probe',
  'contradiction_probe',
  'coverage_gap',
  'scenario',
  'memory_callback',
] as const;

export type QuestionSource = (typeof QUESTION_SOURCE_VALUES)[number];

/**
 * Phase 11 ("Interview Phase Controller") — a NEW, additive, server-
 * authoritative field on `Interview` (`interview.interviewPhase`),
 * ORTHOGONAL to `InterviewStatus` above (a `COMPLETED` interview's
 * `interviewPhase` is `COMPLETED` too, but the two track different things:
 * `status` is lifecycle/persistence state, `interviewPhase` is a coarse,
 * human-readable label for "what part of the conversation are we in").
 *
 * This is a THIN, DERIVED LABEL — never a second decision system. It is
 * computed from `NextQuestionDecisionEngine.decideNextMove`'s ALREADY-
 * decided output (see `deriveInterviewPhase` in NextQuestionDecisionEngine.ts)
 * and never influences that engine's own choice of move.
 *
 * - `WELCOME`: set at interview creation (`InterviewService.startInterview`
 *   and its uploaded/institute-assignment siblings) — before the first
 *   answer is submitted.
 * - `WARM_UP`: reserved for a future optional interactive warm-up exchange.
 *   Deliberately UNUSED today (see InterviewService's own header comment on
 *   why Phase 11 scoped that specific sub-feature out) — kept in the enum
 *   for the same "define the full taxonomy now, wire it up later" reason
 *   `QUESTION_SOURCE_VALUES` above already documents for its own reserved
 *   values, and the same reason phraseLibrary.ts's `DELAY_BRIDGE` category
 *   is defined-but-not-currently-selected.
 * - `CORE`: breadth-oriented progression (SWITCH_COMPETENCY/
 *   CONTINUE_BLUEPRINT moves).
 * - `DEEP_PROBING`: a genuine follow-up/claim/contradiction/memory-callback
 *   probe that cleared the engine's own worthiness bar — never set for a
 *   trivial follow-up.
 * - `WRAP_UP`: reserved — see `deriveInterviewPhase`'s doc comment for why
 *   the actually-persisted terminal value is `COMPLETED` directly rather
 *   than a separate WRAP_UP step (the existing `isCompleted` response flag
 *   already carries the "this is the closing turn" signal the frontend
 *   needs, so a distinct persisted WRAP_UP state would be redundant).
 * - `COMPLETED`: terminal — mirrors `InterviewStatus.COMPLETED`/`EVALUATED`.
 */
export enum InterviewPhase {
  WELCOME = 'WELCOME',
  WARM_UP = 'WARM_UP',
  CORE = 'CORE',
  DEEP_PROBING = 'DEEP_PROBING',
  WRAP_UP = 'WRAP_UP',
  COMPLETED = 'COMPLETED',
}
