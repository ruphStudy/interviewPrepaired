/**
 * Phase 3 ("Next Question Decision Engine") of the answer-aware-interviewer
 * effort — the decision CONTRACT (types/enums/the move→questionSource
 * mapping). The actual deterministic scoring logic lives in
 * `services/NextQuestionDecisionEngine.ts`; this module only declares the
 * shape both that engine and its callers (InterviewService,
 * InterviewAnswerOrchestratorService) share.
 *
 * Builds directly on Phase 1's `QuestionSource` (constants/interview.ts,
 * unchanged/reused here) and Phase 2's `IAnswerSignal`/
 * `FollowUpOpportunityType` (constants/answerSignal.ts, unchanged/reused
 * here) — this file adds nothing to either of those taxonomies.
 */

import { QuestionSource } from './interview';
import { FollowUpOpportunityType } from './answerSignal';

// ============================================================================
// Move taxonomy
// ============================================================================

export const NEXT_INTERVIEW_MOVE_TYPE_VALUES = [
  'FOLLOW_UP',
  'DEEPEN',
  'CLARIFY',
  'CHALLENGE_ASSUMPTION',
  'SCENARIO',
  'CLAIM_PROBE',
  'CONTRADICTION_PROBE',
  'MEMORY_CALLBACK',
  'SWITCH_COMPETENCY',
  'CONTINUE_BLUEPRINT',
] as const;
export type NextInterviewMoveType = (typeof NEXT_INTERVIEW_MOVE_TYPE_VALUES)[number];

export const DIFFICULTY_INTENT_VALUES = ['easier', 'same', 'harder'] as const;
export type DifficultyIntent = (typeof DIFFICULTY_INTENT_VALUES)[number];

export const DECISION_REASON_CODE_VALUES = [
  'answer_shallow',
  'answer_vague',
  'strong_followup_opportunity',
  'unresolved_claim',
  'contradiction_detected',
  'uncovered_high_priority_competency',
  'competency_sufficiently_covered',
  'followup_limit_reached',
  'repetition_penalty',
  'question_budget_low',
  'blueprint_progression',
  'difficulty_escalation',
  'difficulty_recovery',
  'no_answer',
  'off_topic',
  // Not produced by decideNextMove itself — reserved for the uploaded-mode
  // no-op decision recorder (uploaded mode never calls the real engine).
  'uploaded_sequence_fixed',
] as const;
export type DecisionReasonCode = (typeof DECISION_REASON_CODE_VALUES)[number];

/**
 * The engine's single decision output. Only `moveType`/`reasonCode`/
 * `priority`/`difficultyIntent`/`remainingBudget`/`questionSource` are
 * meaningful for every move; the rest are populated only when relevant to
 * that specific moveType (e.g. `targetConcept`/`candidateClaimReference`
 * are irrelevant for CONTINUE_BLUEPRINT and left undefined).
 */
export interface INextInterviewMove {
  moveType: NextInterviewMoveType;
  targetCompetency?: string;
  targetConcept?: string;
  sourceQuestionIndex?: number;
  sourceQuestionId?: string;
  reasonCode: DecisionReasonCode;
  /** Relative score that won the comparison — NOT a fixed 0-100 scale. Higher wins. Useful for audit/debugging, not for cross-interview comparison. */
  priority: number;
  difficultyIntent: DifficultyIntent;
  followUpType?: FollowUpOpportunityType;
  /** Bounded (<=160 char) claim text — never the full claim-verification record. */
  candidateClaimReference?: string;
  /** Bounded (<=160 char) contradiction description — never the full contradiction record. */
  contradictionReference?: string;
  /** Bounded (<=160 char) reference to what's being called back to. */
  memoryReference?: string;
  /**
   * Phase 4 (4A) — a short (<=160 char), bounded excerpt of the candidate's
   * OWN words this move should ground its follow-up in (e.g. the
   * `candidateEvidence` behind a missing/partial expected point). Purely a
   * directive-building aid — NEVER persisted on the resulting question's
   * `decision` metadata (see `buildQuestionTaggingFromMove`), same
   * ephemeral treatment as `candidateClaimReference`/`contradictionReference`.
   */
  sourcePhraseReference?: string;
  remainingBudget: number;
  questionSource: QuestionSource;
}

// ============================================================================
// Move -> QuestionSource mapping (ONE place — reuse everywhere a move needs
// to become a persisted question's questionSource; never re-derive this
// elsewhere).
// ============================================================================

const MOVE_TYPE_TO_QUESTION_SOURCE: Record<NextInterviewMoveType, QuestionSource> = {
  FOLLOW_UP: 'answer_followup',
  DEEPEN: 'answer_followup',
  CLARIFY: 'answer_followup',
  CHALLENGE_ASSUMPTION: 'answer_followup',
  CLAIM_PROBE: 'claim_probe',
  CONTRADICTION_PROBE: 'contradiction_probe',
  MEMORY_CALLBACK: 'memory_callback',
  SCENARIO: 'scenario',
  SWITCH_COMPETENCY: 'coverage_gap',
  CONTINUE_BLUEPRINT: 'blueprint',
};

export function questionSourceForMoveType(moveType: NextInterviewMoveType): QuestionSource {
  return MOVE_TYPE_TO_QUESTION_SOURCE[moveType];
}

/** The subset of moves that "probe into" a specific already-asked question — subject to `maxFollowUpsPerQuestion`. */
export const FOLLOW_UP_FAMILY_MOVE_TYPES: NextInterviewMoveType[] = [
  'FOLLOW_UP',
  'DEEPEN',
  'CLARIFY',
  'CHALLENGE_ASSUMPTION',
  'SCENARIO',
];
