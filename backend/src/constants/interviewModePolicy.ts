/**
 * Phase 12A ("Interview Mode Policy") — the ONE centralized, typed
 * resolution point for "what audience/business-context is this interview,
 * and what presentation policy follows from that". Everything here is a
 * THIN wrapper/confirmation of guarantees Phases 8-11 already established
 * (the phrase library's own `allowedModes` gating, `deriveHumanizerMode`'s
 * existing mode mapping) — this file deliberately does NOT invent a second,
 * parallel mode model. See `resolveInterviewModePolicy`'s own doc comment
 * for why most of its output is, quite deliberately, identical across every
 * mode today.
 *
 * ---------------------------------------------------------------------------
 * Why a NEW `InterviewBusinessMode` (3 values) exists alongside the
 * pre-existing `HumanizerInterviewMode` (4 values, phraseLibrary.ts):
 * ---------------------------------------------------------------------------
 * `HumanizerInterviewMode` conflates two orthogonal things:
 *   (a) REAL business context — who this interview is actually for
 *       (an individual practicing, an institute's assigned student, an
 *       employer's hiring candidate), and
 *   (b) content SOURCE — whether the questions were AI-generated or
 *       uploaded (`Interview.interviewMode`), which is completely
 *       independent: an institute-assigned interview is uploaded-mode
 *       UNDER THE HOOD (confirmed since Phase 1 — institute assignment
 *       always goes through `createInstituteUploadedInterview`, which sets
 *       BOTH `organizationId` and `interviewMode: 'uploaded'`), and a plain
 *       personal/B2C candidate can equally choose to upload their own
 *       question set while still just "practicing".
 *
 * `deriveHumanizerMode`'s pre-Phase-12 field order checked
 * `interviewMode === 'uploaded'` BEFORE `organizationId`, so an
 * institute-uploaded interview resolved to `'uploaded'`, silently losing
 * the "this is actually institute" signal. Phase 12 fixes that ordering
 * (see `deriveHumanizerMode` in conversationHumanizer.ts) so business
 * context always wins over content-source for THAT function too — but the
 * cleaner, permanent fix is this module's `deriveInterviewBusinessMode`,
 * which never looks at `interviewMode` at all, so no future reordering bug
 * can reintroduce the conflation for anything that consults it (in
 * particular, personality-compatibility policy below, which has nothing to
 * do with content source).
 *
 * IMPORTANT — this fix is confirmed to be CURRENTLY BEHAVIOR-INERT for the
 * phrase-selection pipeline: every phrase category gated by `allowedModes`
 * today either (1) allows practice/uploaded/institute identically (the
 * `NON_EMPLOYER_MODES` group — PROBE/CHALLENGE/CLOSING's non-employer
 * variant) or (2) is practice-only (`welcome_practice_warm`), which
 * excludes uploaded AND institute equally. So whether an institute-uploaded
 * interview resolved to `'uploaded'` or `'institute'` produced byte-
 * identical phrase-selection behavior before this phase. The conflation
 * was real but dormant; it becomes load-bearing the moment ANY future
 * phrase/policy content is institute-specific (or the moment institute-mode
 * personality defaults ever need to differ from generic-uploaded-mode
 * ones) — which is exactly the situation `personalityAllowed`/
 * `interviewerNeutrality` below are already written against, so fixing it
 * now (rather than "when it starts mattering") avoids a second migration.
 */

import { InterviewPurpose } from './interview';
import { deriveHumanizerMode, HumanizerInterviewMode } from './conversationHumanizer';

// ============================================================================
// Personality (Phase 12B) — presentation-ONLY. See the "structural proof"
// section of this phase's report for why this type is never accepted by
// any decision/scoring function (NextQuestionDecisionEngine.DecisionContext,
// DifficultyManagerService, AnswerSignalService, ClaimVerificationService,
// ContradictionDetectorService, CoverageTrackerService) — none of those
// modules import this file.
// ============================================================================
export const INTERVIEW_PERSONALITY_VALUES = ['PROFESSIONAL', 'FRIENDLY', 'CHALLENGING'] as const;
export type InterviewPersonality = (typeof INTERVIEW_PERSONALITY_VALUES)[number];

/** Legacy/absent-field default — every interview created before this feature has no `personality` field at all, and resolves here with zero migration needed (same discipline as `interviewPhase`/`warmUpAnsweredAt`). */
export const DEFAULT_INTERVIEW_PERSONALITY: InterviewPersonality = 'PROFESSIONAL';

/** The ONE place that reads `Interview.personality`, so no call site re-implements the "absent -> PROFESSIONAL" default. */
export function resolveInterviewPersonality(interview: { personality?: InterviewPersonality } | null | undefined): InterviewPersonality {
  return interview?.personality ?? DEFAULT_INTERVIEW_PERSONALITY;
}

// ============================================================================
// InterviewBusinessMode — see the file header comment above for why this is
// a NEW, clean, content-source-independent 3-value type rather than reusing
// `HumanizerInterviewMode` (4 values, kept unchanged for the phrase-
// selection pipeline it already serves).
// ============================================================================
export const INTERVIEW_BUSINESS_MODE_VALUES = ['practice', 'institute', 'employer'] as const;
export type InterviewBusinessMode = (typeof INTERVIEW_BUSINESS_MODE_VALUES)[number];

/**
 * Business-context-ONLY resolution — deliberately never inspects
 * `interviewMode` (ai-generated vs uploaded), which is an orthogonal
 * content-source concern consulted independently wherever it actually
 * matters (e.g. Phase 11's warm-up skip for uploaded-mode interviews).
 */
export function deriveInterviewBusinessMode(interview: {
  purpose?: InterviewPurpose;
  organizationId?: unknown;
}): InterviewBusinessMode {
  if (interview.purpose === InterviewPurpose.HIRING_ASSESSMENT) return 'employer';
  if (interview.organizationId) return 'institute';
  return 'practice';
}

// ============================================================================
// InterviewModePolicy — the centralized policy object. Every field is
// documented with WHY it does or doesn't vary by mode today, rather than
// inventing variance the current codebase has no behavioral hook for.
// ============================================================================
export type InterviewerNeutrality = 'strict' | 'relaxed';

export interface InterviewModePolicy {
  /** Clean, content-source-independent business context — see file header. */
  mode: InterviewBusinessMode;
  /** The pre-existing 4-value phrase-selection mode, unchanged consumer contract — passed to `phraseSelector.selectPhrase`/`ConversationHumanizerService` exactly as before. Derived by the SAME (now-fixed) `deriveHumanizerMode`, never re-derived ad hoc. */
  humanizerMode: HumanizerInterviewMode;
  /**
   * Personalities selectable for this mode. Resolves to the SAME 3-value
   * array for every mode today — NOT because the field is a no-op, but
   * because real safety is enforced at two OTHER, already-existing layers
   * that make selection-time exclusion redundant:
   *   1. `phraseLibrary.ts`'s own `allowedModes` gating already makes
   *      PROBE/CHALLENGE categories structurally unreachable in employer
   *      mode, regardless of personality — a "CHALLENGING" personality
   *      boosting the weight of an already-excluded category boosts
   *      nothing.
   *   2. `interviewerNeutrality` below (consulted by
   *      `phraseSelector.selectPhrase`'s personality weight-adjustment
   *      layer) caps CHALLENGING's boost on the remaining
   *      neutrality-sensitive category (CONTRADICTION_NEUTRAL, the one
   *      such category NOT already excluded from employer mode) even
   *      though CHALLENGING remains "selectable".
   * Institute's "CHALLENGING only if explicitly configured" requirement is
   * met by construction: nothing in this codebase ever auto-infers or
   * defaults a non-PROFESSIONAL personality — `personality` is either
   * explicitly supplied by the caller at interview creation or absent
   * (-> PROFESSIONAL). There is no inference path to guard against.
   */
  personalityAllowed: InterviewPersonality[];
  /**
   * 'strict' (employer only) vs 'relaxed' (practice/institute) — the one
   * genuine behavioral lever this policy carries. Consulted by
   * `phraseSelector.selectPhrase`'s personality weight-adjustment layer to
   * cap the neutrality-sensitive categories' multiplier at 1.0 (no boost)
   * under 'strict', even when the interview's personality is CHALLENGING.
   */
  interviewerNeutrality: InterviewerNeutrality;
  /** True only for employer mode — a thin passthrough of phraseLibrary.ts's OWN existing CLOSING category split (`closing_employer_hr_handoff` vs the report-readiness wording every other mode gets), never a second gating mechanism. */
  usesEmployerClosing: boolean;
}

const ALL_PERSONALITIES: InterviewPersonality[] = [...INTERVIEW_PERSONALITY_VALUES];

/**
 * The ONE place other code should call instead of ad-hoc mode checks. Takes
 * the same minimal, import-cycle-safe field subset `deriveHumanizerMode`
 * already takes (this module sits directly on top of it).
 */
export function resolveInterviewModePolicy(interview: {
  purpose?: InterviewPurpose;
  interviewMode?: 'ai-generated' | 'uploaded';
  organizationId?: unknown;
}): InterviewModePolicy {
  const mode = deriveInterviewBusinessMode(interview);
  const humanizerMode = deriveHumanizerMode(interview);
  return {
    mode,
    humanizerMode,
    personalityAllowed: ALL_PERSONALITIES,
    interviewerNeutrality: mode === 'employer' ? 'strict' : 'relaxed',
    usesEmployerClosing: mode === 'employer',
  };
}
