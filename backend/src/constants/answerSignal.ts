/**
 * Phase 2 ("fast answer signal") of the answer-aware-interviewer effort.
 *
 * A compact, DETERMINISTIC signal computed per answer from data the
 * existing `InterviewService.submitAnswer` flow already produces on every
 * turn (the OpenAI evaluation, the existing claim-verification/
 * contradiction-detection subsystems) — see `AnswerSignalService` for the
 * derivation logic. This module only declares the shape; it never calls
 * an AI provider itself.
 *
 * Explicitly NOT in scope here: choosing/acting on a follow-up (that is
 * Phase 3's "Next Question Decision Engine" — this phase only records the
 * signal), and no raw AI reasoning/chain-of-thought text is stored — every
 * string field here is a short, bounded summary, never a verbatim
 * `evaluatorReason`/`explanation` dump.
 */

// ============================================================================
// Union types (mirrors the `as const` + derived-type pattern used by
// QUESTION_SOURCE_VALUES/QuestionSource in constants/interview.ts)
// ============================================================================

export const ANSWER_QUALITY_VALUES = ['strong', 'adequate', 'partial', 'weak', 'unusable'] as const;
export type AnswerQuality = (typeof ANSWER_QUALITY_VALUES)[number];

export const ANSWER_DEPTH_VALUES = ['deep', 'medium', 'shallow', 'none'] as const;
export type AnswerDepth = (typeof ANSWER_DEPTH_VALUES)[number];

export const CONVERSATION_SIGNAL_VALUES = [
  'CONFIDENT_COMPLETE',
  'CORRECT_BUT_SHALLOW',
  'PARTIALLY_CORRECT',
  'VAGUE',
  'OFF_TOPIC',
  'CONTRADICTORY',
  'STRONG_EXAMPLE',
  'NO_ANSWER',
] as const;
export type ConversationSignal = (typeof CONVERSATION_SIGNAL_VALUES)[number];

export const FOLLOW_UP_OPPORTUNITY_TYPE_VALUES = [
  'deepen',
  'clarify',
  'practical_example',
  'edge_case',
  'failure_scenario',
  'claim_verification',
  'tradeoff',
  'contradiction_clarification',
] as const;
export type FollowUpOpportunityType = (typeof FOLLOW_UP_OPPORTUNITY_TYPE_VALUES)[number];

export const PROBE_WORTHINESS_VALUES = ['high', 'medium', 'low'] as const;
export type ProbeWorthiness = (typeof PROBE_WORTHINESS_VALUES)[number];

// Phase 4 (4D) — purely DESCRIPTIVE verbosity metadata, computed cheaply
// from the answer's own word count. Deliberately NEVER used as a proxy for
// quality/depth/probeWorthiness anywhere in AnswerSignalService — a long
// answer is not automatically strong, a short one is not automatically
// unusable (see AnswerSignalService.test.ts for the tests proving both
// directions).
export const VERBOSITY_CLASS_VALUES = ['concise', 'normal', 'verbose'] as const;
export type VerbosityClass = (typeof VERBOSITY_CLASS_VALUES)[number];

// Bounded lengths — kept small deliberately so nothing here can become a
// dumping ground for raw AI reasoning text.
export const MAX_FOLLOW_UP_OPPORTUNITIES = 5;
export const MAX_UNCLEAR_POINTS = 5;
export const MAX_CLAIM_HINTS = 5;
export const MAX_CONTRADICTION_HINTS = 5;
export const MAX_SHORT_STRING_LENGTH = 160;

// ============================================================================
// Structured signal shapes
// ============================================================================

export interface IFollowUpOpportunity {
  topic: string;
  type: FollowUpOpportunityType;
  reason: string;
  priority: number;
  relatedCompetency?: string;
  sourcePhrase?: string;
}

export interface IAnswerSignal {
  quality: AnswerQuality;
  depth: AnswerDepth;
  conversationSignal: ConversationSignal;
  /** Canonical concept-registry keys mentioned in the answer (see constants/conceptRegistry.ts). */
  concepts: string[];
  /** Short, bounded summaries of missing/partial coverage — never a verbatim evaluator explanation. */
  unclearPoints: string[];
  followUpOpportunities: IFollowUpOpportunity[];
  /** The question's own Phase 1 `competencyName` tag, if any — never re-derived here. */
  probableCompetency?: string;
  probeWorthiness: ProbeWorthiness;
  isOffTopic: boolean;
  isNoAnswer: boolean;
  /** Short claim summaries, reusing the existing claim-verification system's output — never a duplicate extractor. */
  claimHints: string[];
  /** Short contradiction summaries, reusing the existing contradiction-detection system's output. */
  contradictionHints: string[];
  /** 0-100: how much real signal was available to derive this (see AnswerSignalService for the rule). */
  confidence: number;
  /** Word count of the raw answer text — descriptive only, see VERBOSITY_CLASS_VALUES doc comment above. */
  wordCount?: number;
  /** The answer's spoken/typed duration in seconds, when available (already collected by submitAnswer) — descriptive only. */
  durationSeconds?: number;
  /** Cheap bucketing of `wordCount` — descriptive only, never a quality/depth proxy. */
  verbosityClass?: VerbosityClass;
  generatedAt?: Date;
}
