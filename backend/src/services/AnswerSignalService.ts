import { DynamicEvaluationResponse } from './OpenAIService';
import { IVerifiableClaim } from '../models/ClaimVerification.model';
import { IContradiction } from '../models/ContradictionTracking.model';
import { detectConcepts } from '../constants/conceptRegistry';
import { isEffectivelyNoAnswer } from '../utils/answerHeuristics';
import {
  AnswerDepth,
  AnswerQuality,
  ConversationSignal,
  IAnswerSignal,
  IFollowUpOpportunity,
  MAX_CLAIM_HINTS,
  MAX_CONTRADICTION_HINTS,
  MAX_FOLLOW_UP_OPPORTUNITIES,
  MAX_SHORT_STRING_LENGTH,
  MAX_UNCLEAR_POINTS,
  ProbeWorthiness,
} from '../constants/answerSignal';

export interface BuildFastSignalParams {
  question: string;
  answer: string;
  expectedPoints?: string[];
  /** The question's own Phase 1 `competencyName` tag — undefined for uploaded-mode questions (never re-derived here). */
  targetCompetency?: string;
  evaluation: DynamicEvaluationResponse;
  /** This turn's claims only — caller filters `interview.claimVerification.claims` by `questionNumber` before calling. */
  claimsThisQuestion: IVerifiableClaim[];
  /** This turn's contradictions only — caller filters `interview.contradictionTracking.contradictions` by `questionNumber2` before calling. */
  contradictionsThisQuestion: IContradiction[];
  /** Canonical concept keys detected client-side while the candidate was still speaking (2C) — merged, never re-extracted. */
  partialConcepts?: string[];
}

/**
 * Idempotency guard shared by both persistence call sites
 * (InterviewService.submitAnswer and
 * InterviewAnswerOrchestratorService's recovery path): a question already
 * carrying a complete signal (has a `quality`) must never be silently
 * recomputed/overwritten by a retry — cheap to check, avoids pointless
 * repeat work and avoids replacing a richer signal with a weaker fallback.
 */
export function hasCompleteAnswerSignal(question: { answerSignal?: IAnswerSignal } | null | undefined): boolean {
  return !!question?.answerSignal?.quality;
}

/**
 * A safe, clearly-"we don't know" minimal signal — used as the fallback
 * when `buildFastSignal`'s invocation throws (malformed/missing upstream
 * evaluation data simulating an AI/provider failure). Never fabricates a
 * positive result.
 */
export function buildFallbackAnswerSignal(): IAnswerSignal {
  return {
    quality: 'unusable',
    depth: 'none',
    conversationSignal: 'NO_ANSWER',
    concepts: [],
    unclearPoints: [],
    followUpOpportunities: [],
    probeWorthiness: 'low',
    isOffTopic: false,
    isNoAnswer: true,
    claimHints: [],
    contradictionHints: [],
    confidence: 0,
    generatedAt: new Date(),
  };
}

function truncate(value: string, max: number = MAX_SHORT_STRING_LENGTH): string {
  const trimmed = (value ?? '').trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

const ACHIEVEMENT_VERB_PATTERN =
  /\b(designed|built|led|implemented|scaled|architected|managed|owned|delivered|developed|created|launched|drove|spearheaded)\b/i;

/**
 * Documented thresholds (deliberately simple, not meant to be perfect):
 *  - score >= 8 AND (no pointComparison OR coverage ratio >= 0.7) -> strong/deep
 *  - score >= 6 -> adequate; depth is 'shallow' only if coverage ratio is
 *    known and below 0.4, otherwise 'medium'
 *  - score >= 4 -> partial/shallow
 *  - score > 0  -> weak; depth 'shallow' if any coverage at all, else 'none'
 *  - score <= 0 (or no answer) -> unusable/none
 * `coverage ratio` = (covered + 0.5*partial) / total pointComparison entries.
 */
function deriveQualityAndDepth(
  evaluation: DynamicEvaluationResponse,
  isNoAnswer: boolean
): { quality: AnswerQuality; depth: AnswerDepth; coverageRatio?: number } {
  if (isNoAnswer) return { quality: 'unusable', depth: 'none' };

  const score = typeof evaluation?.overallScore === 'number' ? evaluation.overallScore : 0;
  const pointComparison = evaluation?.pointComparison;

  let coverageRatio: number | undefined;
  if (pointComparison && pointComparison.length > 0) {
    const covered = pointComparison.filter((p) => p.status === 'covered').length;
    const partial = pointComparison.filter((p) => p.status === 'partial').length;
    coverageRatio = (covered + partial * 0.5) / pointComparison.length;
  }

  if (score >= 8 && (coverageRatio === undefined || coverageRatio >= 0.7)) {
    return { quality: 'strong', depth: 'deep', coverageRatio };
  }
  if (score >= 6) {
    const depth: AnswerDepth = coverageRatio !== undefined && coverageRatio < 0.4 ? 'shallow' : 'medium';
    return { quality: 'adequate', depth, coverageRatio };
  }
  if (score >= 4) {
    return { quality: 'partial', depth: 'shallow', coverageRatio };
  }
  if (score > 0) {
    const depth: AnswerDepth = coverageRatio !== undefined && coverageRatio > 0 ? 'shallow' : 'none';
    return { quality: 'weak', depth, coverageRatio };
  }
  return { quality: 'unusable', depth: 'none', coverageRatio };
}

function deriveConversationSignal(params: {
  isNoAnswer: boolean;
  isOffTopic: boolean;
  quality: AnswerQuality;
  depth: AnswerDepth;
  hasContradiction: boolean;
  hasClaimHint: boolean;
}): ConversationSignal {
  const { isNoAnswer, isOffTopic, quality, depth, hasContradiction, hasClaimHint } = params;
  if (isNoAnswer) return 'NO_ANSWER';
  if (isOffTopic) return 'OFF_TOPIC';
  if (hasContradiction) return 'CONTRADICTORY';
  if (quality === 'strong' && depth === 'deep' && hasClaimHint) return 'STRONG_EXAMPLE';
  if (quality === 'strong' && depth !== 'deep') return 'CORRECT_BUT_SHALLOW';
  if (quality === 'adequate' || quality === 'partial') return 'PARTIALLY_CORRECT';
  if (quality === 'weak') return 'VAGUE';
  return 'CONFIDENT_COMPLETE';
}

function deriveIsOffTopic(evaluation: DynamicEvaluationResponse, isNoAnswer: boolean): boolean {
  if (isNoAnswer) return false; // NO_ANSWER and OFF_TOPIC are distinct signals — don't double-classify.
  const score = typeof evaluation?.overallScore === 'number' ? evaluation.overallScore : 0;
  const pointComparison = evaluation?.pointComparison;
  const allMissingOrAbsent = !pointComparison || pointComparison.length === 0 || pointComparison.every((p) => p.status === 'missing');
  return score <= 1 && allMissingOrAbsent;
}

function buildUnclearPoints(evaluation: DynamicEvaluationResponse): string[] {
  const pointComparison = evaluation?.pointComparison;
  if (pointComparison && pointComparison.length > 0) {
    return pointComparison
      .filter((p) => p.status === 'missing' || p.status === 'partial')
      .map((p) => truncate(p.improvementPoint || p.expectedPoint))
      .filter(Boolean)
      .slice(0, MAX_UNCLEAR_POINTS);
  }
  const fallback = [...(evaluation?.missingPoints || []), ...(evaluation?.weaknesses || [])];
  return fallback.map((v) => truncate(v)).filter(Boolean).slice(0, MAX_UNCLEAR_POINTS);
}

function buildFollowUpOpportunities(params: {
  evaluation: DynamicEvaluationResponse;
  claimsThisQuestion: IVerifiableClaim[];
  contradictionsThisQuestion: IContradiction[];
  targetCompetency?: string;
}): IFollowUpOpportunity[] {
  const { evaluation, claimsThisQuestion, contradictionsThisQuestion, targetCompetency } = params;
  const candidates: IFollowUpOpportunity[] = [];

  // Priority tiers (simple, deterministic): contradiction > missing point > claim > partial point.
  for (const c of contradictionsThisQuestion) {
    candidates.push({
      topic: truncate(c.contradiction),
      type: 'contradiction_clarification',
      reason: 'An unresolved contradiction was detected against an earlier answer.',
      priority: 100,
      relatedCompetency: targetCompetency,
      sourcePhrase: truncate(c.statement2),
    });
  }

  const pointComparison = evaluation?.pointComparison || [];
  for (const p of pointComparison) {
    if (p.status === 'missing') {
      candidates.push({
        topic: truncate(p.expectedPoint),
        type: 'deepen',
        reason: 'Expected point was not addressed in the answer.',
        priority: 80,
        relatedCompetency: targetCompetency,
      });
    }
  }

  for (const claim of claimsThisQuestion) {
    candidates.push({
      topic: truncate(claim.claim),
      type: 'claim_verification',
      reason: 'A verifiable claim was made that could be probed further.',
      priority: 60,
      relatedCompetency: targetCompetency,
    });
  }

  for (const p of pointComparison) {
    if (p.status === 'partial') {
      candidates.push({
        topic: truncate(p.expectedPoint),
        type: 'clarify',
        reason: 'Expected point was only partially covered.',
        priority: 40,
        relatedCompetency: targetCompetency,
      });
    }
  }

  return candidates.sort((a, b) => b.priority - a.priority).slice(0, MAX_FOLLOW_UP_OPPORTUNITIES);
}

/**
 * probeWorthiness rule (simple, documented): 'high' when the answer is
 * weak/partial, there's an unresolved contradiction, or there are 2+
 * follow-up opportunities; 'medium' when the answer is merely adequate or
 * there is exactly one opportunity; 'low' otherwise (a strong answer with
 * nothing outstanding to probe).
 */
function deriveProbeWorthiness(params: {
  quality: AnswerQuality;
  hasContradiction: boolean;
  opportunityCount: number;
}): ProbeWorthiness {
  const { quality, hasContradiction, opportunityCount } = params;
  if (hasContradiction || quality === 'weak' || quality === 'partial' || opportunityCount >= 2) return 'high';
  if (quality === 'adequate' || opportunityCount === 1) return 'medium';
  return 'low';
}

/**
 * confidence rule (simple, documented, 0-100): starts at 50 (baseline —
 * we always have at least the overallScore), +25 if pointComparison is
 * present (the richest evaluation signal), +10 if scored dimensions are
 * present, +5 each if claim/contradiction data exists for this turn.
 * A detected no-answer is a reliable (not low-confidence) determination on
 * its own, so it is set directly rather than derived from the above.
 */
function deriveConfidence(params: {
  evaluation: DynamicEvaluationResponse;
  claimsThisQuestion: IVerifiableClaim[];
  contradictionsThisQuestion: IContradiction[];
  isNoAnswer: boolean;
}): number {
  const { evaluation, claimsThisQuestion, contradictionsThisQuestion, isNoAnswer } = params;
  if (isNoAnswer) return 40;

  let confidence = 50;
  if (evaluation?.pointComparison && evaluation.pointComparison.length > 0) confidence += 25;
  if (evaluation?.dimensions && evaluation.dimensions.length > 0) confidence += 10;
  if (claimsThisQuestion.length > 0) confidence += 5;
  if (contradictionsThisQuestion.length > 0) confidence += 5;
  return Math.max(0, Math.min(100, confidence));
}

function buildClaimHints(claimsThisQuestion: IVerifiableClaim[], answer: string): string[] {
  if (claimsThisQuestion.length > 0) {
    return claimsThisQuestion.map((c) => truncate(c.claim)).filter(Boolean).slice(0, MAX_CLAIM_HINTS);
  }

  // Light deterministic fallback ONLY when the existing claim-extraction
  // system found nothing this turn — never a second AI-based extractor.
  const match = ACHIEVEMENT_VERB_PATTERN.exec(answer || '');
  if (!match) return [];

  const sentences = (answer || '').split(/(?<=[.!?])\s+/);
  const containingSentence = sentences.find((s) => ACHIEVEMENT_VERB_PATTERN.test(s)) || answer;
  return [truncate(containingSentence)];
}

/**
 * PURE, synchronous. Every AI-derived input is passed in already-computed
 * — this function makes zero AI calls itself, per the Phase 2 design
 * decision (see AnswerSignalService caller sites in InterviewService /
 * InterviewAnswerOrchestratorService).
 */
export class AnswerSignalService {
  buildFastSignal(params: BuildFastSignalParams): IAnswerSignal {
    const { answer, evaluation, claimsThisQuestion, contradictionsThisQuestion, targetCompetency, partialConcepts } = params;

    const isNoAnswer = isEffectivelyNoAnswer(answer);
    const { quality, depth } = deriveQualityAndDepth(evaluation, isNoAnswer);
    const isOffTopic = deriveIsOffTopic(evaluation, isNoAnswer);

    const contradictionHints = contradictionsThisQuestion
      .map((c) => truncate(c.contradiction))
      .filter(Boolean)
      .slice(0, MAX_CONTRADICTION_HINTS);
    const claimHints = buildClaimHints(claimsThisQuestion, answer);

    const conversationSignal = deriveConversationSignal({
      isNoAnswer,
      isOffTopic,
      quality,
      depth,
      hasContradiction: contradictionHints.length > 0,
      hasClaimHint: claimHints.length > 0,
    });

    const detectedConcepts = isNoAnswer ? [] : detectConcepts(answer);
    const concepts = Array.from(new Set([...detectedConcepts, ...(partialConcepts || [])]));

    const unclearPoints = isNoAnswer ? [] : buildUnclearPoints(evaluation);
    const followUpOpportunities = isNoAnswer
      ? []
      : buildFollowUpOpportunities({ evaluation, claimsThisQuestion, contradictionsThisQuestion, targetCompetency });

    const probeWorthiness = deriveProbeWorthiness({
      quality,
      hasContradiction: contradictionHints.length > 0,
      opportunityCount: followUpOpportunities.length,
    });

    const confidence = deriveConfidence({ evaluation, claimsThisQuestion, contradictionsThisQuestion, isNoAnswer });

    return {
      quality,
      depth,
      conversationSignal,
      concepts,
      unclearPoints,
      followUpOpportunities,
      probableCompetency: targetCompetency,
      probeWorthiness,
      isOffTopic,
      isNoAnswer,
      claimHints,
      contradictionHints,
      confidence,
      generatedAt: new Date(),
    };
  }
}

export const answerSignalService = new AnswerSignalService();
