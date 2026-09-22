import { Types } from 'mongoose';
import Interview, { IInterview, IEvaluation, IQuestion } from '../models/interview.model';
import { IAnswerSignal } from '../constants/answerSignal';
import { InterviewTopic, QuestionResponse } from './OpenAIService';
import {
  DifficultyLevel,
  ExperienceLevel,
  InterviewStyle,
  DynamicEvaluationResponse
} from './OpenAIService';
import { getAIService } from '../ai';
import { userSubscriptionService } from './UserSubscriptionService';
import { interviewCreditService } from './InterviewCreditService';
import { mapExperienceYearsToLevel, inferInterviewStyle } from './OpenAIAdapter';
import { ApiError, InsufficientCreditsError } from '../utils/ApiError';
import { InterviewStatus, InterviewPurpose, isAnswerableStatus, MAX_UPLOADED_QUESTIONS, QuestionSource, InterviewPhase } from '../constants/interview';
import { blueprintService } from './BlueprintService';
import { interviewMemoryService } from './InterviewMemoryService';
import { createEmptyMemory } from '../models/InterviewMemory.model';
import { coverageTrackerService } from './CoverageTrackerService';
import { initializeCoverage } from '../models/CompetencyCoverage.model';
import { difficultyManagerService } from './DifficultyManagerService';
import { initializeDifficultyTracking, mapLevelToDifficulty } from '../models/DifficultyTracking.model';import { claimVerificationService } from './ClaimVerificationService';
import { contradictionDetectorService } from './ContradictionDetectorService';
import { starAnalysisService } from './STARAnalysisService';
import { shouldAnalyzeSTAR } from '../models/STARAnalysis.model';
import { answerSignalService, buildFallbackAnswerSignal, hasCompleteAnswerSignal } from './AnswerSignalService';
import {
  nextQuestionDecisionEngine,
  generateQuestionForMove,
  buildQuestionTaggingFromMove,
  findClaimForMove,
  findContradictionIndexForMove,
  findMemoryItemForMove,
  deriveInterviewPhase,
} from './NextQuestionDecisionEngine';
import { INextInterviewMove } from '../constants/nextQuestionDecision';
import { conversationHumanizerService } from './ConversationHumanizerService';
import { ConversationPresentationPlan, deriveHumanizerMode } from '../constants/conversationHumanizer';
import { buildAICostReport, AICostReport } from './AIUsageService';
import { normalizeLanguageCode, DEFAULT_LANGUAGE_CODE } from '../config/languages';
import { ParsedQuestion, normalizeUploadedQuestions } from './QuestionFileParserService';
import { questionSetService } from './QuestionSetService';
import InstituteStudentInterviewAssignment from '../models/InstituteStudentInterviewAssignment.model';
import { InstituteStudentInterviewAssignmentStatus } from '../constants/instituteStudentInterviewAssignment';
import { OperationalJobType } from '../constants/operationalJob';
import { TransientOperationalError } from '../utils/operationalError';

/** Same validity rule the frontend/report/PDF must all agree on — never treat a stringified "undefined"/"null"/placeholder/empty value as a real expected answer. */
function isValidModelAnswer(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value !== 'undefined' &&
    value !== 'null' &&
    value !== 'Model answer generation unavailable.'
  );
}

interface StartInterviewParams {
  userId: string;
  topic: InterviewTopic;
  difficulty: DifficultyLevel;
  experienceYears: number;
  totalQuestions?: number;
  interviewStyle?: InterviewStyle;
  experienceLevel?: ExperienceLevel;
  roleName?: string; // NEW: Specific role title
  industry?: string; // NEW: Industry context
  interviewMode?: 'ai-generated' | 'uploaded';
  uploadedQuestions?: Array<{ questionText: string; referenceAnswer?: string }>;
  // Alternative source for uploaded mode — mutually exclusive with
  // uploadedQuestions. Resolved to the same ParsedQuestion[] shape before
  // hitting the same validate/select/start pipeline, so a saved set and a
  // directly-posted question array converge on one code path.
  questionSetId?: string;
  shuffleQuestions?: boolean;
  interviewLanguage?: string;
}

interface SubmitAnswerParams {
  interviewId: string;
  userId: string;
  answer: string;
  duration: number;
  // Phase 2 (2C) — canonical concept-registry keys detected client-side,
  // locally, while the candidate was still speaking (no AI, no network
  // call). Optional/additive: absent for any client build that predates
  // this feature. Merged into AnswerSignalService.buildFastSignal's
  // `concepts`, never used for anything else.
  partialConcepts?: string[];
}

interface GetHistoryParams {
  userId: string;
  page: number;
  limit: number;
  filters?: {
    topic?: string;
    difficulty?: string;
    status?: string;
  };
}

interface InterviewReport {
  interview: {
    id: string;
    topic: string;
    difficulty: string;
    experienceYears: number;
    status: string;
    createdAt: Date;
    completedAt?: Date;
    totalQuestions: number;
    answeredQuestions: number;
    interviewLanguage?: string;
  };
  questions: Array<{
    questionText: string;
    expectedPoints?: string[];
    modelAnswer?: string;
    questionSource?: QuestionSource;
    competencyName?: string;
    sourceReasonCode?: string;
    difficultyAtGeneration?: string;
    answerSource?: 'uploaded' | 'ai-generated';
    referenceAnswer?: string;
    answerText?: string;
    answeredAt?: Date;
    duration?: number;
    evaluation?: IEvaluation;
    // Phase 2 (fast answer signal) — the user's own practice-mode report
    // MAY surface this (it's the user's own data about their own answers);
    // no new frontend UI consumes it in this phase, this is data-only.
    answerSignal?: IAnswerSignal;
  }>;
  finalReport?: {
    overallScore: number;
    summary: string;
    recommendations: string[];
    strengthsOverview: string[];
    weaknessesOverview: string[];
    nextSteps: string[];
    generatedAt: Date;
  };
  statistics: {
    averageScore: number;
    completionRate: number;
    totalDuration: number;
    strengthsCount: number;
    weaknessesCount: number;
  };
  // null for interviews that predate AI usage tracking — never a fabricated/estimated cost.
  aiCost: AICostReport | null;
}

interface InterviewSession {
  interviewId: string;
  status: InterviewStatus;
  interviewMode?: 'ai-generated' | 'uploaded';
  topic: string;
  difficulty: string;
  interviewLanguage?: string;
  totalQuestions: number;
  currentQuestionIndex: number;
  answeredQuestions: number;
  resumable: boolean;
  reportAvailable: boolean;
  // Never includes modelAnswer/referenceAnswer/evaluation — recovery must not leak answer/evaluation data.
  currentQuestion: {
    questionText: string;
    expectedPoints?: string[];
    questionType?: string;
  } | null;
  progress: {
    answered: number;
    total: number;
    percentage: number;
  };
}

/**
 * Derives question-path tagging metadata for a question about to be
 * appended to a blueprint-driven (non-uploaded) interview: which
 * competency it targets, its source taxonomy, a short machine-readable
 * reason, and the difficulty level at generation time. This is the ONE
 * place that decides this tagging — a standalone, dependency-free function
 * (not a class method) so it can be called identically from the
 * first-question step of InterviewService.startInterview, the next-question
 * step of InterviewService.submitAnswer, AND
 * InterviewAnswerOrchestratorService's retry-recovery question path,
 * without the latter needing a full InterviewService instance (its unit
 * tests mock `core` as a narrow object).
 *
 * Uploaded-mode interviews never call this — they push questions directly
 * (buildUploadedQuestions) with `questionSource: 'uploaded'` and no
 * blueprint competency to target.
 */
export function buildQuestionTagging(interview: IInterview): {
  competencyName?: string;
  questionSource: QuestionSource;
  sourceReasonCode?: string;
  difficultyAtGeneration?: string;
} {
  const difficultyAtGeneration = interview.difficultyTracking
    ? mapLevelToDifficulty(interview.difficultyTracking.currentLevel)
    : interview.difficulty;

  const competencyName = interview.competencyCoverage
    ? coverageTrackerService.getNextCompetencyToPrioritize(interview.competencyCoverage)
    : undefined;

  if (!competencyName) {
    // No blueprint/coverage to target (shouldn't normally happen for a
    // non-uploaded interview, but fail safe rather than fabricate one).
    return { questionSource: 'ai', difficultyAtGeneration };
  }

  // All-zero coverage (nothing assessed yet) means getNextCompetencyToPrioritize
  // just returned the first competency in blueprint order — effectively
  // sequential, not a "least covered" decision yet.
  const sourceReasonCode = interview.competencyCoverage!.overallCoverage > 0
    ? 'least_covered_competency'
    : 'sequential_blueprint_coverage';

  return {
    competencyName,
    questionSource: 'blueprint',
    sourceReasonCode,
    difficultyAtGeneration,
  };
}

/**
 * Phase 11 (11A) — the optional warm-up exchange's opening prompt. A cheap,
 * DETERMINISTIC template — NEVER an AI call, NEVER free text generation —
 * built purely from data `startInterview` already has in scope (`topic`/
 * `roleName`/`experienceLevel`). Recomputing this (rather than persisting
 * it) is deliberate: it is a pure function of fields already on the
 * interview document, so `submitWarmUpAnswer` below can reconstruct the
 * EXACT same prompt text for memory extraction without a second persisted
 * field.
 *
 * Employer-mode note: this B2C `InterviewService`/`InterviewScreen`
 * pipeline never carries `purpose: HIRING_ASSESSMENT` (that value is only
 * ever set by the entirely separate `createEmployerHiringInterview` /
 * `PublicEmployerInterviewInvitationService` flow, confirmed untouched by
 * this phase — see this file's other Phase 11 comments) and this pipeline
 * has no resume/JD context to draw on even in an employer-adjacent B2C
 * session. There is therefore nothing here to special-case for "employer
 * warm-up" beyond this same generic, role/topic-based template — never
 * fabricating candidate history that doesn't exist in this pipeline.
 */
export function buildWarmUpPrompt(interview: { topic: string; roleName?: string; experienceLevel?: string }): string {
  const subject = (interview.roleName || interview.topic || '').trim() || 'this role';
  return `Before we get into the technical questions, can you briefly tell me about the kind of ${subject} work you've been doing recently?`;
}

/**
 * Phase 11 (11A) — whether `startInterview`'s response should include a
 * `warmUpPrompt` at all. Uploaded-mode (and institute-uploaded-mode, which
 * also sets `interviewMode: 'uploaded'`) interviews skip the warm-up
 * exchange entirely per the master design's own explicit instruction — they
 * go straight from the WELCOME greeting to their fixed question sequence.
 * A standalone, directly-testable pure function rather than inline
 * controller logic.
 */
export function shouldOfferWarmUp(interview: { interviewMode?: 'ai-generated' | 'uploaded' }): boolean {
  return interview.interviewMode !== 'uploaded';
}

export class InterviewService {
  private aiService = getAIService();

  /**
   * Fast pre-check only, run before any expensive AI work — the
   * authoritative check is the atomic consume in consumeInterviewCredit().
   * Also lazily initializes a legacy/existing user's FREE subscription and
   * credits if they don't have any yet.
   */
  private async assertCreditAvailable(userId: string): Promise<void> {
    await userSubscriptionService.getSubscriptionDetails(userId);
    const balance = await interviewCreditService.getBalance(userId);
    if (balance < 1) {
      throw new InsufficientCreditsError(balance);
    }
  }

  /**
   * Consumes exactly 1 credit for a just-created interview (idempotent per
   * interviewId, so a retry never double-charges). This is the authoritative
   * credit check — if the atomic consume fails (e.g. a race lost the last
   * credit after the fast pre-check passed), the still-empty interview is
   * deleted so no uncharged interview is ever left accessible.
   */
  private async consumeInterviewCredit(userId: string, interview: IInterview): Promise<void> {
    const interviewId = interview._id.toString();
    try {
      await interviewCreditService.consumeCredits({
        userId,
        amount: 1,
        interviewId,
        idempotencyKey: `interview-consume:${interviewId}`,
        description: 'Interview started',
      });
    } catch (error) {
      await Interview.deleteOne({ _id: interview._id });
      const balance = await interviewCreditService.getBalance(userId);
      throw new InsufficientCreditsError(balance);
    }
  }

  /**
   * Refunds the 1 credit consumed for this interview when first-question
   * initialization fails before the user ever receives a usable interview.
   * Idempotent per interviewId. Best-effort — logged, never thrown, so a
   * refund failure doesn't mask the original initialization error.
   */
  private async refundInterviewStartCredit(userId: string, interviewId: string): Promise<void> {
    try {
      await interviewCreditService.refundCredits({
        userId,
        amount: 1,
        interviewId,
        idempotencyKey: `interview-refund-start-failure:${interviewId}`,
        description: 'Refund: interview failed to initialize',
      });
    } catch (refundError) {
      console.error('[InterviewService] Failed to refund credit after start failure:', refundError);
    }
  }

  /**
   * Defensive, generated-mode-only input validation — runs before any DB
   * write, credit check, or AI call. Route-level validation already covers
   * this for HTTP callers; this exists for direct/non-HTTP callers of the
   * service and to fail fast before assertCreditAvailable's lazy
   * subscription/credit initialization runs for a request that was never
   * going to be valid anyway. Mirrors the accepted values already enforced
   * elsewhere (route validators, generated-interview 1–10 cap) — no new
   * business restrictions.
   */
  private validateGeneratedInterviewInput(params: StartInterviewParams): void {
    if (!params.topic || typeof params.topic !== 'string' || !params.topic.trim()) {
      throw new ApiError(400, 'Topic is required');
    }
    if (!params.difficulty) {
      throw new ApiError(400, 'Difficulty is required');
    }
    if (params.experienceYears === undefined || params.experienceYears === null || typeof params.experienceYears !== 'number') {
      // experienceYears can legitimately be 0 — checked explicitly above rather than via truthiness.
      throw new ApiError(400, 'Experience years is required');
    }
    if (params.totalQuestions !== undefined && (params.totalQuestions < 1 || params.totalQuestions > 10)) {
      throw new ApiError(400, 'Total questions must be between 1 and 10');
    }
    if (params.interviewStyle !== undefined && !Object.values(InterviewStyle).includes(params.interviewStyle)) {
      throw new ApiError(400, 'Invalid interview style');
    }
    if (params.questionSetId) {
      throw new ApiError(400, 'questionSetId is only supported for uploaded interview mode');
    }
  }

  /**
   * Defensive, uploaded-mode-only input validation and normalization — runs
   * before any DB write, credit check, or persistence, same principle as
   * validateGeneratedInterviewInput. This is the trust boundary for both
   * uploaded-mode sources: a direct `uploadedQuestions` array, or a saved
   * `questionSetId` (resolved here, ownership-scoped, via QuestionSetService
   * — never queried directly). Either source converges on the same
   * normalized ParsedQuestion[] before selection/start. Returns the
   * normalized, deduplicated question set.
   */
  private async validateUploadedInterviewInput(params: StartInterviewParams): Promise<ParsedQuestion[]> {
    const hasUploadedQuestions = Array.isArray(params.uploadedQuestions) && params.uploadedQuestions.length > 0;
    const hasQuestionSetId = typeof params.questionSetId === 'string' && params.questionSetId.trim().length > 0;

    if (hasUploadedQuestions && hasQuestionSetId) {
      throw new ApiError(400, 'Provide either uploadedQuestions or questionSetId, not both');
    }
    if (!hasUploadedQuestions && !hasQuestionSetId) {
      throw new ApiError(400, 'At least 1 uploaded question or a questionSetId is required');
    }

    // getQuestionSet is ownership-scoped ({_id, userId}) and throws
    // ApiError(404) if the set doesn't exist or belongs to another user —
    // never leaks whether the id exists for someone else.
    const rawQuestions = hasQuestionSetId
      ? (await questionSetService.getQuestionSet(params.userId, params.questionSetId as string)).questions
      : (params.uploadedQuestions as ParsedQuestion[]);

    const normalized = normalizeUploadedQuestions(rawQuestions);
    if (normalized.length === 0) {
      throw new ApiError(400, 'No valid uploaded questions found');
    }

    const { totalQuestions } = params;
    if (totalQuestions !== undefined) {
      if (!Number.isInteger(totalQuestions) || totalQuestions < 1) {
        throw new ApiError(400, 'Total questions must be a positive integer');
      }
      if (totalQuestions > MAX_UPLOADED_QUESTIONS) {
        throw new ApiError(400, `Total questions must be at most ${MAX_UPLOADED_QUESTIONS}`);
      }
      if (totalQuestions > normalized.length) {
        throw new ApiError(400, 'Total questions cannot exceed the number of available uploaded questions');
      }
    } else if (normalized.length > MAX_UPLOADED_QUESTIONS) {
      // The candidate didn't pick a specific count (implicit "use all"); rather
      // than silently starting with fewer than the full uploaded set, reject
      // clearly so the mismatch is visible instead of surprising.
      throw new ApiError(400, `Uploaded question set exceeds the maximum of ${MAX_UPLOADED_QUESTIONS} questions; select a smaller count`);
    }

    return normalized;
  }

  /**
   * Builds the exact persisted question snapshot from the already-validated
   * normalized pool: copy -> optional full-pool shuffle -> slice to count ->
   * verify the count matches exactly. Never mutates normalizedQuestions.
   * Shuffling the full pool before slicing (rather than slicing then
   * shuffling) is required for an unbiased random subset when
   * totalQuestions < pool.length.
   */
  private selectUploadedQuestions(
    normalizedQuestions: ParsedQuestion[],
    totalQuestions: number | undefined,
    shuffleQuestions: boolean | undefined
  ): ParsedQuestion[] {
    const pool = [...normalizedQuestions];
    if (shuffleQuestions === true) {
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
    }

    const effectiveTotal = totalQuestions ?? pool.length;
    const selected = pool.slice(0, effectiveTotal);

    if (selected.length !== effectiveTotal) {
      // Unreachable given validateUploadedInterviewInput's bounds — fail
      // loudly rather than ever persist an inconsistent question count.
      throw new ApiError(500, 'Uploaded question selection count mismatch');
    }

    return selected;
  }

  /**
   * Single source of truth for a question's expected/reference answer.
   * Uploaded reference answers are never overwritten or regenerated; a
   * modelAnswer is only generated via OpenAI when nothing valid exists yet,
   * and the result is persisted so it is never regenerated again.
   */
  private async resolveExpectedAnswer(
    interview: IInterview,
    questionIndex: number
  ): Promise<{ expectedAnswer?: string; answerSource?: 'uploaded' | 'ai-generated' }> {
    const question = interview.questions[questionIndex];
    if (!question) return {};

    if (question.questionSource === 'uploaded' && isValidModelAnswer(question.referenceAnswer)) {
      return { expectedAnswer: question.referenceAnswer, answerSource: 'uploaded' };
    }

    if (isValidModelAnswer(question.modelAnswer)) {
      return { expectedAnswer: question.modelAnswer, answerSource: question.answerSource || 'ai-generated' };
    }

    try {
      const modelAnswerResult = await this.aiService.generateModelAnswer(
        {
          question: question.questionText,
          topic: interview.topic,
          difficulty: interview.difficulty,
          experienceLevel: interview.experienceLevel || 'professional',
          expectedPoints: question.expectedPoints,
          questionType: question.questionType as any,
        },
        {
          interviewId: interview._id.toString(),
          operation: 'model-answer-generation',
          questionIndex,
          language: interview.interviewLanguage,
        }
      );
      const generated = modelAnswerResult.data;

      question.modelAnswer = generated;
      question.answerSource = 'ai-generated';
      interview.markModified(`questions.${questionIndex}.modelAnswer`);
      interview.markModified(`questions.${questionIndex}.answerSource`);

      await Interview.updateOne(
        { _id: interview._id },
        {
          $set: {
            [`questions.${questionIndex}.modelAnswer`]: generated,
            [`questions.${questionIndex}.answerSource`]: 'ai-generated',
          },
        }
      );

      console.log(`[ModelAnswer] Q${questionIndex + 1}`, { generated: true, length: generated.length });
      return { expectedAnswer: generated, answerSource: 'ai-generated' };
    } catch (err) {
      console.error(`[ModelAnswer] Generation failed for Q${questionIndex + 1} (non-critical):`, err);
      return {};
    }
  }

  // ===========================================================================
  // Phase 6 (6C) — memory/claim/coverage extraction, verified independent of
  // each other AND of the answer-evaluation AI call's own output (none reads
  // another's result — only contradiction detection reads memory's output,
  // which is why it stays sequenced AFTER this batch in submitAnswer rather
  // than joining it). Each wraps the EXACT same try/catch/gating a pre-Phase-6
  // sequential block used, so a single extraction failing can never fail
  // answer submission or block the other concurrent extractions — these are
  // run together via Promise.allSettled in submitAnswer, never Promise.all.
  // ===========================================================================

  private async runMemoryExtraction(params: {
    interview: IInterview;
    question: IQuestion;
    answer: string;
    questionNumber: number;
  }): Promise<IInterview['interviewMemory'] | undefined> {
    const { interview, question, answer, questionNumber } = params;
    try {
      const updatedMemory = await interviewMemoryService.extractMemoryFromAnswer({
        question: question.questionText,
        answer,
        questionNumber,
        existingMemory: interview.interviewMemory || createEmptyMemory(),
        interviewId: interview._id.toString(),
        // Phase 5 (5A) — stamped so buildMemoryCallbackCandidates can later
        // match a memory item back to the competency it came from.
        competencyName: question.competencyName,
      });
      console.log(`[InterviewService] Memory updated. Total facts: ${updatedMemory.totalFacts}`);
      return updatedMemory;
    } catch (memoryError) {
      console.error('[InterviewService] Memory extraction failed (non-critical):', memoryError);
      return undefined;
    }
  }

  private async runClaimExtraction(params: {
    interview: IInterview;
    question: IQuestion;
    answer: string;
    questionNumber: number;
  }): Promise<IInterview['claimVerification'] | undefined> {
    const { interview, question, answer, questionNumber } = params;
    if (!interview.claimVerification) return undefined;
    try {
      const updatedClaims = await claimVerificationService.extractClaims({
        question: question.questionText,
        answer,
        questionNumber,
        currentTracking: interview.claimVerification,
        interviewId: interview._id.toString(),
      });
      console.log(`[InterviewService] Claims updated. Total: ${updatedClaims.totalClaims}, Unverified: ${updatedClaims.unverifiedCount}`);
      return updatedClaims;
    } catch (claimError) {
      console.error('[InterviewService] Claim extraction failed (non-critical):', claimError);
      return undefined;
    }
  }

  private async runCoverageUpdate(params: {
    interview: IInterview;
    question: IQuestion;
    answer: string;
    questionNumber: number;
  }): Promise<IInterview['competencyCoverage'] | undefined> {
    const { interview, question, answer, questionNumber } = params;
    if (!interview.blueprintId || !interview.competencyCoverage) return undefined;
    try {
      const blueprint = await blueprintService.getBlueprintById(interview.blueprintId.toString());
      if (!blueprint) return undefined;
      const updatedCoverage = await coverageTrackerService.updateCoverage({
        question: question.questionText,
        answer,
        questionNumber,
        competencies: blueprint.competencies,
        currentCoverage: interview.competencyCoverage,
        interviewId: interview._id.toString(),
      });
      console.log(`[InterviewService] Coverage updated. Overall: ${updatedCoverage.overallCoverage}%, Least covered: ${updatedCoverage.leastCoveredCompetency}`);
      return updatedCoverage;
    } catch (coverageError) {
      console.error('[InterviewService] Coverage tracking failed (non-critical):', coverageError);
      return undefined;
    }
  }

  /**
   * Phase 6 (6D) — best-effort enqueue of the deferred STAR/model-answer
   * enrichment job. Called only AFTER the answer + evaluation are already
   * durably persisted (never speculatively before), so a failed enqueue
   * here can never lose/corrupt answer state — it only means enrichment is
   * delayed until getInterviewReport's own lazy re-enqueue recovers it.
   */
  private async enqueueDeferredEnrichment(interviewId: string, questionIndex: number): Promise<void> {
    try {
      const { operationalJobService } = await import('./OperationalJobService');
      await operationalJobService.enqueue({
        jobType: OperationalJobType.INTERVIEW_DEFERRED_ENRICHMENT,
        payload: { interviewId, questionIndex },
        idempotencyKey: `deferred-enrichment:${interviewId}:${questionIndex}`,
      });
    } catch (enqueueError) {
      console.error('[InterviewService] Failed to enqueue deferred enrichment job (non-critical):', enqueueError);
    }
  }

  private async enrichStarAnalysis(
    interview: IInterview,
    question: IQuestion,
    questionIndex: number,
    interviewStyle: InterviewStyle
  ): Promise<void> {
    if (question.evaluation?.starAnalysis) return; // already computed — never re-call AI.
    if (!question.evaluation) return; // nothing evaluated yet to attach STAR to.

    const starAnalysis = await starAnalysisService.analyzeSTAR({
      question: question.questionText,
      answer: question.answerText || '',
      interviewStyle,
      interviewId: interview._id.toString(),
      interviewLanguage: interview.interviewLanguage,
    });
    // analyzeSTAR already degrades internally: returns null (never throws)
    // both when the interview style isn't behavioral/situational/leadership
    // AND when its own AI call fails — indistinguishable here, so neither
    // case is treated as a job failure worth retrying (matches the
    // pre-Phase-6 inline call's own "log and move on" semantics exactly).
    if (!starAnalysis) return;

    await Interview.updateOne(
      { _id: interview._id, [`questions.${questionIndex}.evaluation.starAnalysis`]: { $exists: false } },
      { $set: { [`questions.${questionIndex}.evaluation.starAnalysis`]: starAnalysis } }
    );
  }

  /**
   * Phase 6 (6D) — STAR analysis + model-answer generation for one already-
   * answered/evaluated question, run OFF submitAnswer's synchronous critical
   * path via OperationalJobType.INTERVIEW_DEFERRED_ENRICHMENT. Safe to call
   * more than once for the same question: both AI calls it may make are
   * internally idempotent (skip immediately once already computed), so a
   * duplicate enqueue or a job retry after a prior partial success is
   * always a safe no-op — never duplicate AI cost.
   */
  async performDeferredEnrichment(interviewId: string, questionIndex: number): Promise<void> {
    const interview = await Interview.findById(interviewId);
    if (!interview) return; // interview deleted since the job was enqueued — nothing to do.

    const question = interview.questions[questionIndex];
    if (!question || !question.answerText) return; // nothing to enrich (yet, or ever).

    const interviewStyle = (interview.interviewStyle || inferInterviewStyle(interview.topic)) as InterviewStyle;

    const [starSettled, modelAnswerSettled] = await Promise.allSettled([
      this.enrichStarAnalysis(interview, question, questionIndex, interviewStyle),
      this.resolveExpectedAnswer(interview, questionIndex),
    ]);

    if (starSettled.status === 'rejected') {
      // Non-critical, matches the pre-Phase-6 inline call's own handling —
      // never worth a job retry (analyzeSTAR itself never throws; this can
      // only be an update/lookup error, not a repeatable AI failure).
      console.error('[InterviewService] Deferred STAR analysis failed (non-critical):', starSettled.reason);
    }

    // resolveExpectedAnswer never throws (it catches its own AI error and
    // returns {}) — an empty result while the question STILL has no valid
    // modelAnswer/referenceAnswer means the AI call was attempted and
    // failed, which IS worth a bounded job retry (unlike STAR above).
    if (modelAnswerSettled.status === 'rejected') {
      throw new TransientOperationalError(
        modelAnswerSettled.reason instanceof Error ? modelAnswerSettled.reason.message : 'Model answer generation failed'
      );
    }
    const refreshedQuestion = interview.questions[questionIndex];
    const stillMissingExpectedAnswer =
      !isValidModelAnswer(refreshedQuestion?.modelAnswer) && !isValidModelAnswer(refreshedQuestion?.referenceAnswer);
    if (!modelAnswerSettled.value.expectedAnswer && stillMissingExpectedAnswer) {
      throw new TransientOperationalError(`Model answer generation did not produce a result for question ${questionIndex}`);
    }
  }

  /**
   * Start a new interview session
   * 
   * NEW FLOW:
   * 1. Generate or retrieve interview blueprint
   * 2. Create interview with blueprint reference
   * 3. Generate first question using blueprint
   */
  async startInterview(params: StartInterviewParams): Promise<IInterview> {
    // Validate mode-specific input before any DB write, credit check, or AI
    // call — an invalid request must never consume credit or lazily
    // initialize a subscription/credit record for a request that was never
    // going to be valid anyway.
    let normalizedUploadedQuestions: ParsedQuestion[] | undefined;
    if (params.interviewMode !== 'uploaded') {
      this.validateGeneratedInterviewInput(params);
    } else {
      normalizedUploadedQuestions = await this.validateUploadedInterviewInput(params);
    }

    // Shared credit gate — applies to both interview modes before any
    // expensive AI work (or the uploaded-mode document creation) begins.
    await this.assertCreditAvailable(params.userId);

    if (params.interviewMode === 'uploaded') {
      return this.startUploadedInterview(params, normalizedUploadedQuestions!);
    }

    console.log('🟢 [InterviewService] startInterview called with params:', params);
    const {
      userId,
      topic,
      difficulty,
      experienceYears,
      totalQuestions = 5,
      interviewStyle,
      experienceLevel,
      roleName,
      industry
    } = params;
    // Normalized once here and reused as-is for the interview document, the
    // question-generation AI call, and its context — never recomputed.
    const interviewLanguage = normalizeLanguageCode(params.interviewLanguage);

    // Map experience years to level if not provided
    const finalExperienceLevel = experienceLevel || mapExperienceYearsToLevel(experienceYears);
    // Infer interview style if not provided
    const finalInterviewStyle = interviewStyle || inferInterviewStyle(topic);

    try {
      // =====================================================================
      // STEP 1: Generate or Retrieve Interview Blueprint
      // =====================================================================
      console.log('🔵 [InterviewService] Getting or creating interview blueprint...');
      const blueprint = await blueprintService.getOrCreateBlueprint({
        topic,
        roleName,
        industry,
        difficulty,
        experienceLevel: finalExperienceLevel,
        interviewStyle: finalInterviewStyle,
      });
      
      console.log('✅ [InterviewService] Blueprint acquired:', {
        id: blueprint._id,
        version: blueprint.version,
        competencies: blueprint.competencies.map(c => c.name).join(', '),
      });

      // =====================================================================
      // STEP 2: Create Interview Document with Blueprint Reference
      // =====================================================================
      console.log('🟢 [InterviewService] Creating interview document...');
      
      // Initialize competency coverage from blueprint
      const competencyNames = blueprint.competencies.map(c => c.name);
      const initialCoverage = initializeCoverage(competencyNames);
      console.log('🔵 [InterviewService] Initialized competency coverage for:', competencyNames);
      
      // Initialize difficulty tracking
      const initialDifficulty = initializeDifficultyTracking(difficulty);
      console.log('🔵 [InterviewService] Initialized difficulty tracking at level:', initialDifficulty.currentLevel);
      
      const interview = new Interview({
        userId: new Types.ObjectId(userId),
        topic,
        difficulty,
        experienceYears,
        experienceLevel: finalExperienceLevel,
        interviewStyle: finalInterviewStyle,
        roleName,
        industry,
        blueprintId: blueprint._id,
        blueprintVersion: blueprint.version,
        totalQuestions,
        // Shell only — not usable until the first question is generated and
        // persisted below, at which point it transitions to IN_PROGRESS.
        status: InterviewStatus.CREATED,
        // Phase 11 — the period before the first answer is submitted. See
        // InterviewPhase's own doc comment for why WARM_UP (an optional
        // interactive exchange) is deliberately not used here — this phase
        // covers a purely presentational welcome, not a second scored turn.
        interviewPhase: InterviewPhase.WELCOME,
        currentQuestion: 1,
        questions: [],
        competencyCoverage: initialCoverage,
        difficultyTracking: initialDifficulty,
        interviewLanguage,
        interviewMode: 'ai-generated',
      });

      // Persist the shell now (before any AI call) so interview._id already
      // exists in MongoDB — AI usage/cost tracking below attributes its
      // record to this interview via a targeted update, which would silently
      // match nothing if the document didn't exist in the DB yet.
      await interview.save();

      // Interview document now exists — consume exactly 1 credit before any
      // AI question-generation work begins (the authoritative check; the
      // fast pre-check above is only for quick rejection).
      await this.consumeInterviewCredit(userId, interview);

      // =====================================================================
      // STEP 3: Generate First Question Using Blueprint
      // =====================================================================
      try {
        console.log('🟢 [InterviewService] Generating first question using blueprint...');
        const sessionConfig = {
          topic,
          difficulty: difficulty as DifficultyLevel,
          experienceLevel: finalExperienceLevel,
          interviewStyle: finalInterviewStyle,
          totalQuestions,
        };

        const questionResult = await this.aiService.generateQuestion(
          {
            sessionConfig,
            // TODO: Pass blueprint context to question generation
            // This will be used to generate questions targeting specific competencies
            interviewId: interview._id.toString(),
            interviewLanguage,
          },
          {
            interviewId: interview._id.toString(),
            operation: 'question-generation',
            language: interviewLanguage,
          }
        );
        const questionResponse = questionResult.data;

        // A malformed/empty first question must fail the start (and refund
        // the consumed credit) rather than leave a usable-looking interview
        // with no real question.
        if (!questionResponse?.question || typeof questionResponse.question !== 'string' || questionResponse.question.trim().length < 10) {
          throw new Error('Generated first question was empty or malformed');
        }

        console.log('🟢 [InterviewService] Question generated:', questionResponse);
        // Transition CREATED -> IN_PROGRESS in-memory now, so addQuestion()'s
        // internal save() persists the status change together with the
        // question in one write. Add question to interview with expected
        // points. addQuestion() already persists (it calls save()
        // internally) — this is the one and only save for the first
        // question; an extra save() here would be redundant and, if it
        // transiently failed, would wrongly trigger a refund for an
        // interview that had, in fact, already succeeded.
        interview.status = InterviewStatus.IN_PROGRESS;
        const firstQuestionTagging = buildQuestionTagging(interview) as ReturnType<typeof buildQuestionTagging> & { presentation?: ConversationPresentationPlan };
        // Phase 11 — the welcome greeting rides along on the first
        // question's own presentation plan (never a second turn/endpoint —
        // see buildWelcomePresentationPlanSafely's doc comment).
        firstQuestionTagging.presentation = this.buildWelcomePresentationPlanSafely({
          interview,
          questionText: questionResponse.question,
        });
        await interview.addQuestion(questionResponse.question, questionResponse.expectedPoints, questionResponse.questionType, firstQuestionTagging);

        console.log('✅ [InterviewService] Interview started successfully with blueprint');
        return interview;
      } catch (initError) {
        // Credit was already consumed but the interview never became
        // usable — refund it, then let the outer catch report the failure.
        await this.refundInterviewStartCredit(userId, interview._id.toString());
        throw initError;
      }

    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        throw error;
      }
      console.error('❌ [InterviewService] Error starting interview:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new ApiError(500, `Failed to start interview: ${message}`);
    }
  }

  /**
   * Start an interview from a pre-parsed uploaded question set — no AI
   * question generation, no blueprint/competency/difficulty tracking (those
   * only exist to drive AI question generation, which uploaded mode skips).
   */
  private async startUploadedInterview(params: StartInterviewParams, normalizedQuestions: ParsedQuestion[]): Promise<IInterview> {
    const {
      userId,
      topic,
      difficulty,
      experienceYears,
      totalQuestions,
      interviewStyle,
      experienceLevel,
      shuffleQuestions,
    } = params;
    const interviewLanguage = normalizeLanguageCode(params.interviewLanguage);

    // normalizedQuestions was already validated (non-empty, deduplicated,
    // within MAX_UPLOADED_QUESTIONS) by validateUploadedInterviewInput
    // before the credit gate. selectUploadedQuestions copies before
    // shuffling so the caller's array (e.g. a repeated start from the same
    // preview) is never mutated.
    const pool = this.selectUploadedQuestions(normalizedQuestions, totalQuestions, shuffleQuestions);

    const finalExperienceLevel = experienceLevel || mapExperienceYearsToLevel(experienceYears);
    const finalInterviewStyle = interviewStyle || inferInterviewStyle(topic);

    const questions: IQuestion[] = this.buildUploadedQuestions(pool);

    const interview = new Interview({
      userId: new Types.ObjectId(userId),
      topic,
      difficulty,
      experienceYears,
      experienceLevel: finalExperienceLevel,
      interviewStyle: finalInterviewStyle,
      interviewMode: 'uploaded',
      interviewLanguage,
      totalQuestions: questions.length,
      // All questions are already embedded in this single document — unlike
      // generated mode there's no separate "shell without a question" stage,
      // so this goes straight to IN_PROGRESS (same lifecycle end state).
      status: InterviewStatus.IN_PROGRESS,
      // Phase 11 — per the master design's own explicit guidance, uploaded
      // mode skips the (never-built) interactive warm-up exchange entirely;
      // it still gets a purely-presentational WELCOME greeting on question 1
      // below, same as generated mode.
      interviewPhase: InterviewPhase.WELCOME,
      currentQuestion: 1,
      questions,
    });

    if (interview.questions[0]) {
      interview.questions[0].presentation = this.buildWelcomePresentationPlanSafely({
        interview,
        questionText: interview.questions[0].questionText,
      });
    }

    await interview.save();

    // Interview document (with all uploaded questions) now exists — consume
    // exactly 1 credit. No AI work follows for this mode, so no refund path
    // is needed here (unlike AI-generated mode's first-question step).
    await this.consumeInterviewCredit(userId, interview);

    console.log('✅ [InterviewService] Uploaded-question interview started', {
      totalQuestions: questions.length,
      withReferenceAnswer: questions.filter((q) => q.answerSource === 'uploaded').length,
    });

    return interview;
  }

  /** Pure ParsedQuestion[] -> IQuestion[] mapping shared by personal and institute uploaded-mode starts. */
  private buildUploadedQuestions(pool: ParsedQuestion[]): IQuestion[] {
    return pool.map((q) => {
      const hasReferenceAnswer = isValidModelAnswer(q.referenceAnswer);
      return {
        questionText: q.questionText,
        questionSource: 'uploaded',
        referenceAnswer: hasReferenceAnswer ? q.referenceAnswer!.trim() : undefined,
        answerSource: hasReferenceAnswer ? 'uploaded' : undefined,
        expectedPoints: [],
      } as IQuestion;
    });
  }

  /**
   * Institute-assignment start (12E): creates a real uploaded-mode Interview
   * scoped to an organization, from questions already selected/validated by
   * the caller (InstituteStudentInterviewAssignmentService). Deliberately
   * does NOT call assertCreditAvailable/consumeInterviewCredit or touch
   * personal subscriptions — institute billing is a future sprint (15), and
   * this path must never affect the B2C credit ledger.
   */
  async createInstituteUploadedInterview(params: {
    userId: string;
    organizationId: string;
    topic: string;
    difficulty: string;
    experienceYears: number;
    interviewStyle?: string;
    interviewLanguage?: string;
    questions: ParsedQuestion[];
  }): Promise<IInterview> {
    const interviewLanguage = normalizeLanguageCode(params.interviewLanguage);
    const finalInterviewStyle = params.interviewStyle || inferInterviewStyle(params.topic);
    const finalExperienceLevel = mapExperienceYearsToLevel(params.experienceYears);

    const questions: IQuestion[] = this.buildUploadedQuestions(params.questions);

    const interview = new Interview({
      userId: new Types.ObjectId(params.userId),
      organizationId: new Types.ObjectId(params.organizationId),
      topic: params.topic,
      difficulty: params.difficulty,
      experienceYears: params.experienceYears,
      experienceLevel: finalExperienceLevel,
      interviewStyle: finalInterviewStyle,
      interviewMode: 'uploaded',
      interviewLanguage,
      totalQuestions: questions.length,
      status: InterviewStatus.IN_PROGRESS,
      // Phase 11 — same welcome-only (no interactive warm-up) treatment as
      // the personal uploaded-mode start above; institute assignment/fixed-
      // content rules are otherwise entirely unaffected.
      interviewPhase: InterviewPhase.WELCOME,
      currentQuestion: 1,
      questions,
    });

    if (interview.questions[0]) {
      interview.questions[0].presentation = this.buildWelcomePresentationPlanSafely({
        interview,
        questionText: interview.questions[0].questionText,
      });
    }

    await interview.save();

    console.log('✅ [InterviewService] Institute-assignment uploaded interview started', {
      organizationId: params.organizationId,
      totalQuestions: questions.length,
    });

    return interview;
  }

  /**
   * Employer hiring-assessment session creation (20E): creates a real
   * Interview document for a candidate who has NO User account —
   * `userId` is deliberately omitted (the schema only requires it when
   * `purpose !== 'hiring_assessment'`). Deliberately does NOT call
   * assertCreditAvailable/consumeInterviewCredit — mirrors
   * `createInstituteUploadedInterview`'s own precedent of never touching
   * the B2C credit ledger, and this path has no org-credit consumption
   * either since nothing is actually being run yet. Does NOT call AI to
   * generate a question — `questions` stays empty and `status` stays
   * CREATED ("shell persisted, no usable first question yet") until
   * `HiringQuestionMaterializationService` (21A) converts the blueprint
   * into real questions — `questionMaterializationStatus` starts as
   * 'pending' so that later step has an authoritative CAS claim to work
   * against. The unique
   * partial index on `employerInvitationId` is the sole concurrency
   * guard: a concurrent duplicate call throws E11000, which the caller
   * (PublicEmployerInterviewInvitationService) catches and refetches the
   * winner rather than creating a second session.
   */
  async createEmployerHiringInterview(params: {
    organizationId: string;
    jobId: string;
    jobTitle: string;
    candidateId: string;
    applicationId: string;
    invitationId: string;
    blueprintId: string;
    rubricId: string;
    totalQuestions: number;
  }): Promise<IInterview> {
    const totalQuestions = Math.min(200, Math.max(1, Math.round(params.totalQuestions) || 1));
    const topic = (params.jobTitle || 'Hiring Interview').trim().slice(0, 100) || 'Hiring Interview';

    const interview = new Interview({
      organizationId: new Types.ObjectId(params.organizationId),
      purpose: InterviewPurpose.HIRING_ASSESSMENT,
      employerJobId: new Types.ObjectId(params.jobId),
      employerCandidateId: new Types.ObjectId(params.candidateId),
      employerApplicationId: new Types.ObjectId(params.applicationId),
      employerInvitationId: new Types.ObjectId(params.invitationId),
      employerBlueprintId: new Types.ObjectId(params.blueprintId),
      employerRubricId: new Types.ObjectId(params.rubricId),
      questionMaterializationStatus: 'pending',
      topic,
      roleName: topic,
      difficulty: 'intermediate',
      experienceYears: 0,
      totalQuestions,
      status: InterviewStatus.CREATED,
      currentQuestion: 1,
      questions: [],
      interviewMode: 'ai-generated',
    });

    await interview.save();
    return interview;
  }

  /**
   * Institute completion sync (12E): when an institute-linked interview
   * (organizationId set) reaches COMPLETED, flips its matching
   * IN_PROGRESS assignment to COMPLETED. No-op for personal/B2C interviews
   * (organizationId absent) and non-critical on failure — mirrors the
   * file's existing pattern for best-effort side effects.
   */
  private async syncInstituteAssignmentOnCompletion(interview: IInterview): Promise<void> {
    if (!interview.organizationId) {
      return;
    }
    try {
      await InstituteStudentInterviewAssignment.updateOne(
        {
          interviewId: interview._id,
          organizationId: interview.organizationId,
          status: InstituteStudentInterviewAssignmentStatus.IN_PROGRESS,
        },
        { $set: { status: InstituteStudentInterviewAssignmentStatus.COMPLETED } }
      );
    } catch (error) {
      console.error('[InterviewService] Failed to sync institute assignment on completion (non-critical):', error);
    }
  }

  /**
   * Phase 8 (Conversation Humanizer) — the ONE call site both submitAnswer's
   * normal next-question path and its uploaded-mode path use to build a
   * presentation plan for the question about to be shown next. Best-effort:
   * wraps ConversationHumanizerService's own internal try/catch with a
   * second outer guard (matching this file's established non-critical
   * enrichment pattern everywhere else — memory/claims/coverage/
   * difficulty/answerSignal above all follow the exact same shape) so a
   * humanizer failure can NEVER block/fail answer submission.
   *
   * Deliberately skipped (returns undefined) for any interview whose
   * `interviewLanguage` isn't the default English locale: the phrase
   * library (constants/phraseLibrary.ts) is English-only today, and mixing
   * English filler phrases into a Hindi/Marathi TTS session would sound
   * exactly as broken as the mixed-language bug interviewPhrases.ts's own
   * header comment already guards against for the welcome/transition
   * phrases. The frontend's existing fallback (speak the plain question
   * text, Phase 7's pre-Phase-8 behavior) applies automatically whenever
   * `presentation` is absent, so this is a safe, non-breaking scope limit.
   */
  private buildPresentationPlanSafely(params: {
    interview: IInterview;
    move: INextInterviewMove;
    questionText: string;
    answerSignal?: IAnswerSignal;
  }): ConversationPresentationPlan | undefined {
    const { interview, move, questionText, answerSignal } = params;
    const language = interview.interviewLanguage || DEFAULT_LANGUAGE_CODE;
    if (language !== DEFAULT_LANGUAGE_CODE) return undefined;
    try {
      const interviewMode = deriveHumanizerMode(interview);
      const recentPhraseHistory = conversationHumanizerService.deriveRecentPhraseHistory(interview.questions);
      return conversationHumanizerService.buildPresentationPlan({
        move,
        question: { text: questionText },
        answerSignal,
        interviewMode,
        recentPhraseHistory,
      });
    } catch (humanizerError) {
      console.error('[InterviewService] Conversation humanizer failed (non-critical):', humanizerError);
      return undefined;
    }
  }

  /**
   * Phase 11 — attached onto the FIRST question's own `presentation` field
   * at interview creation (startInterview/startUploadedInterview/
   * createInstituteUploadedInterview), mirroring `buildPresentationPlanSafely`'s
   * exact same English-only gate and non-critical try/catch discipline. A
   * humanizer failure here must never fail interview creation.
   */
  private buildWelcomePresentationPlanSafely(params: { interview: IInterview; questionText: string }): ConversationPresentationPlan | undefined {
    const { interview, questionText } = params;
    const language = interview.interviewLanguage || DEFAULT_LANGUAGE_CODE;
    if (language !== DEFAULT_LANGUAGE_CODE) return undefined;
    try {
      const interviewMode = deriveHumanizerMode(interview);
      return conversationHumanizerService.buildWelcomePresentationPlan({ questionText, interviewMode });
    } catch (humanizerError) {
      console.error('[InterviewService] Welcome presentation plan failed (non-critical):', humanizerError);
      return undefined;
    }
  }

  /**
   * Phase 11 — built on the SAME turn that carries `isCompleted: true`
   * (there is no next question for this presentation to attach to). Same
   * English-only gate/non-critical discipline as every other presentation
   * builder in this file; a failure here must never fail answer submission
   * or block navigation to the report.
   */
  private buildClosingPresentationPlanSafely(interview: IInterview): ConversationPresentationPlan | undefined {
    const language = interview.interviewLanguage || DEFAULT_LANGUAGE_CODE;
    if (language !== DEFAULT_LANGUAGE_CODE) return undefined;
    try {
      const interviewMode = deriveHumanizerMode(interview);
      const recentPhraseHistory = conversationHumanizerService.deriveRecentPhraseHistory(interview.questions);
      return conversationHumanizerService.buildClosingPresentationPlan({ interviewMode, recentPhraseHistory });
    } catch (humanizerError) {
      console.error('[InterviewService] Closing presentation plan failed (non-critical):', humanizerError);
      return undefined;
    }
  }

  /**
   * Submit answer and get evaluation + next question
   */
  async submitAnswer(params: SubmitAnswerParams): Promise<{
    interview: IInterview;
    evaluation: DynamicEvaluationResponse;
    nextQuestion?: QuestionResponse;
    isCompleted: boolean;
    // Phase 8 — additive, optional; absent whenever the humanizer didn't
    // run (uploaded/legacy/non-English/failure) or there is no next
    // question at all (interview completed). See
    // ConversationHumanizerService for the safe-fallback contract.
    presentation?: ConversationPresentationPlan;
  }> {
    const { interviewId, userId, answer, duration } = params;

    // Find interview
    const interview = await Interview.findOne({
      _id: new Types.ObjectId(interviewId),
      userId: new Types.ObjectId(userId),
    });

    if (!interview) {
      throw new ApiError(404, 'Interview not found');
    }

    if (interview.status === InterviewStatus.COMPLETED || interview.status === InterviewStatus.EVALUATED) {
      throw new ApiError(400, 'Interview is already completed');
    }

    // CREATED (initialization never finished) and PAUSED (not implemented)
    // are the remaining non-answerable states — only IN_PROGRESS may answer.
    if (!isAnswerableStatus(interview.status)) {
      throw new ApiError(400, `Interview is not ready to accept answers (status: ${interview.status})`);
    }

    // Get current question index
    const currentQuestionIndex = interview.currentQuestion - 1;
    const currentQuestion = interview.questions[currentQuestionIndex];

    if (!currentQuestion) {
      throw new ApiError(400, 'No active question found');
    }

    if (currentQuestion.answerText) {
      throw new ApiError(400, 'Question already answered');
    }

    try {
      // Submit answer
      await interview.submitAnswer(currentQuestionIndex, answer, duration);

      // Build session config
      const experienceLevel = interview.experienceLevel || mapExperienceYearsToLevel(interview.experienceYears);
      const interviewStyle = interview.interviewStyle || inferInterviewStyle(interview.topic);
      
      const sessionConfig = {
        topic: interview.topic as InterviewTopic,
        difficulty: interview.difficulty as DifficultyLevel,
        experienceLevel: experienceLevel as ExperienceLevel,
        interviewStyle: interviewStyle as InterviewStyle,
        totalQuestions: interview.totalQuestions,
      };

      // =====================================================================
      // Phase 6 (6C) — the answer-evaluation AI call and the memory/claim/
      // coverage extraction AI calls are mutually independent (verified: none
      // consumes another's OUTPUT, and none needs `evaluation` either — only
      // contradiction detection below needs memory's output, which is why it
      // stays sequenced AFTER this batch rather than joining it). Running
      // them concurrently removes 3 sequential AI round-trips from the
      // critical path. evaluateAnswer is the one call here that must still
      // fail the whole submission on error (pre-Phase-6 behavior, no inner
      // try/catch); the other three already swallow their own errors
      // internally (matching their pre-Phase-6 individual try/catch blocks
      // exactly) so Promise.allSettled never sees them reject.
      // =====================================================================
      const [evaluationSettled, memorySettled, claimsSettled, coverageSettled] = await Promise.allSettled([
        this.aiService.evaluateAnswer(
          {
            sessionConfig,
            question: currentQuestion.questionText,
            answer,
            expectedPoints: currentQuestion.expectedPoints,
            referenceAnswer: isValidModelAnswer(currentQuestion.referenceAnswer) ? currentQuestion.referenceAnswer : undefined,
            interviewId: interview._id.toString(),
            questionIndex: currentQuestionIndex,
            interviewLanguage: interview.interviewLanguage,
          },
          {
            interviewId: interview._id.toString(),
            operation: 'answer-evaluation',
            questionIndex: currentQuestionIndex,
            language: interview.interviewLanguage,
          }
        ),
        this.runMemoryExtraction({ interview, question: currentQuestion, answer, questionNumber: interview.currentQuestion }),
        this.runClaimExtraction({ interview, question: currentQuestion, answer, questionNumber: interview.currentQuestion }),
        this.runCoverageUpdate({ interview, question: currentQuestion, answer, questionNumber: interview.currentQuestion }),
      ]);

      if (evaluationSettled.status === 'rejected') {
        throw evaluationSettled.reason;
      }
      const evaluationResult = evaluationSettled.value;
      const evaluation = evaluationResult.data;

      if (memorySettled.status === 'fulfilled' && memorySettled.value) {
        interview.interviewMemory = memorySettled.value;
      }
      if (claimsSettled.status === 'fulfilled' && claimsSettled.value) {
        interview.claimVerification = claimsSettled.value;
      }
      if (coverageSettled.status === 'fulfilled' && coverageSettled.value) {
        interview.competencyCoverage = coverageSettled.value;
      }

      // Store evaluation (dimensions/score/strengths/weaknesses/etc). STAR
      // analysis is deliberately NOT attached here anymore — Phase 6 (6D)
      // moves it (and model-answer generation) to a background
      // OperationalJob enqueued below, once the answer/evaluation are
      // already durably persisted. Neither was ever part of this method's
      // synchronous response, and modelAnswer is independently self-healed
      // by getInterviewReport's own existing backfill loop, so deferring
      // both is purely a latency win with no behavioral/UX change.
      await interview.evaluateQuestion(currentQuestionIndex, {
        dimensions: evaluation.dimensions,
        overallScore: evaluation.overallScore,
        strengths: evaluation.strengths,
        weaknesses: evaluation.weaknesses,
        suggestions: evaluation.suggestions,
        missingPoints: evaluation.missingPoints,
      });

      // Enqueue AFTER the answer + evaluation are durably saved above —
      // never speculatively before. Best-effort or not, an enqueue failure
      // can never lose/corrupt already-persisted answer state; it only
      // delays enrichment until getInterviewReport's lazy re-enqueue
      // recovers it (see getInterviewReport).
      await this.enqueueDeferredEnrichment(interview._id.toString(), currentQuestionIndex);

      // =====================================================================
      // NEW: Detect Contradictions
      // =====================================================================
      console.log('[InterviewService] Detecting contradictions...');
      try {
        if (interview.contradictionTracking && interview.interviewMemory) {
          const updatedContradictions = await contradictionDetectorService.detectContradictions({
            currentAnswer: answer,
            currentQuestionNumber: interview.currentQuestion,
            interviewMemory: interview.interviewMemory,
            currentTracking: interview.contradictionTracking,
            interviewId: interview._id.toString(),
          });
          
          interview.contradictionTracking = updatedContradictions;
          
          if (updatedContradictions.unresolvedCount > 0) {
            console.log(`[InterviewService] Contradictions detected. Total: ${updatedContradictions.totalContradictions}, Unresolved: ${updatedContradictions.unresolvedCount}`);
          }
        }
      } catch (contradictionError) {
        console.error('[InterviewService] Contradiction detection failed (non-critical):', contradictionError);
        // Don't fail the interview if contradiction detection fails
      }

      // =====================================================================
      // Phase 2: Build fast answer signal (zero additional AI calls — reuses
      // the evaluation + this turn's claims/contradictions computed above).
      // Best-effort/non-critical like the blocks above: must never block
      // answer/evaluation/next-question progression.
      // =====================================================================
      try {
        if (!hasCompleteAnswerSignal(interview.questions[currentQuestionIndex])) {
          const claimsThisQuestion = (interview.claimVerification?.claims || []).filter(
            (c) => c.questionNumber === interview.currentQuestion
          );
          const contradictionsThisQuestion = (interview.contradictionTracking?.contradictions || []).filter(
            (c) => c.questionNumber2 === interview.currentQuestion
          );
          const signal = answerSignalService.buildFastSignal({
            question: currentQuestion.questionText,
            answer,
            expectedPoints: currentQuestion.expectedPoints,
            targetCompetency: currentQuestion.competencyName,
            evaluation,
            claimsThisQuestion,
            contradictionsThisQuestion,
            partialConcepts: params.partialConcepts,
            durationSeconds: duration,
          });
          interview.questions[currentQuestionIndex].answerSignal = signal;
          interview.markModified(`questions.${currentQuestionIndex}.answerSignal`);
        }
      } catch (signalError) {
        console.error('[InterviewService] Fast answer-signal derivation failed (non-critical):', signalError);
        try {
          interview.questions[currentQuestionIndex].answerSignal = buildFallbackAnswerSignal();
          interview.markModified(`questions.${currentQuestionIndex}.answerSignal`);
        } catch {
          // Never let a signal-persistence failure block interview progression.
        }
      }

      // Competency coverage is already updated above — computed concurrently
      // with evaluateAnswer/memory/claims (see runCoverageUpdate + the
      // Promise.allSettled batch), never a second sequential AI call here.

      // =====================================================================
      // NEW: Adjust Difficulty Based on Performance
      // =====================================================================
      console.log('[InterviewService] Adjusting difficulty based on performance...');
      try {
        if (interview.difficultyTracking) {
          // Collect recent scores for rolling average
          const recentScores = interview.questions
            .filter(q => q.evaluation?.overallScore !== undefined)
            .map(q => q.evaluation!.overallScore);
          
          const adjustmentResult = difficultyManagerService.adjustDifficulty({
            currentTracking: interview.difficultyTracking,
            latestScore: evaluation.overallScore,
            questionNumber: interview.currentQuestion,
            recentScores,
          });
          
          interview.difficultyTracking = adjustmentResult.updatedTracking;
          
          if (adjustmentResult.updated) {
            console.log(`[InterviewService] Difficulty adjusted: ${adjustmentResult.previousLevel} → ${adjustmentResult.newLevel} (${adjustmentResult.reason})`);
          } else {
            console.log(`[InterviewService] Difficulty remains at level ${interview.difficultyTracking.currentLevel}`);
          }
        }
      } catch (difficultyError) {
        console.error('[InterviewService] Difficulty adjustment failed (non-critical):', difficultyError);
        // Don't fail the interview if difficulty adjustment fails
      }

      // Check if interview is complete — based on actual persisted answered
      // questions, never just the currentQuestion pointer (which could drift
      // from real state and mark completion early/late).
      const answeredCount = interview.questions.filter((q) => q.answerText).length;
      const isCompleted = answeredCount >= interview.totalQuestions;
      let nextQuestion: QuestionResponse | undefined;
      let presentation: ConversationPresentationPlan | undefined;
      let finalInterview = interview; // Track the final interview to return

      if (isCompleted) {
        // Phase 6 (6B/6D) — final-report generation is deliberately NOT
        // called synchronously here anymore. Verified: aiService
        // .generateFinalReport's own input is only each question's
        // evaluation (dimensions/overallScore/strengths/weaknesses/
        // missingPoints) — never starAnalysis/modelAnswer — so it has no
        // dependency on anything deferred above, and the frontend's
        // completion handling only reads `isCompleted` from THIS response
        // (see InterviewScreen.tsx) before navigating to /report/:id; it
        // never reads finalReport off this response. getInterviewReport
        // ALREADY provides idempotent, retry-safe lazy generation for a
        // COMPLETED interview with no report yet (its long-standing
        // recovery path, unchanged) — that lazy path is now simply the
        // ONLY path, removing a full AI report-generation call from the
        // last answer's critical path with no behavior change.
        console.log('[InterviewService] Interview completed! Report will be generated on first access.');
        // Mark as completed and set completion timestamp
        interview.status = InterviewStatus.COMPLETED;
        interview.completedAt = new Date();
        // Phase 11 — terminal persisted phase, written in the SAME save as
        // `status`/`completedAt` above (one write site, per InterviewPhase's
        // own doc comment on why there is no separate persisted WRAP_UP step).
        interview.interviewPhase = InterviewPhase.COMPLETED;
        // Phase 11 — the mode-aware closing sign-off, built from the SAME
        // in-memory `interview` this turn already has in scope (no new DB
        // read). Returned on THIS response only — there is no next question
        // for it to ride along on, unlike WELCOME/every other presentation
        // plan in this file.
        presentation = this.buildClosingPresentationPlanSafely(interview);
        await interview.save();
        console.log('[InterviewService] Interview saved with status: completed');
        await this.syncInstituteAssignmentOnCompletion(interview);

        // Reload the interview to refresh the _original tracking
        const reloadedInterview = await Interview.findById(interview._id);
        if (!reloadedInterview) {
          throw new ApiError(404, 'Interview not found after save');
        }
        finalInterview = reloadedInterview;
      } else if (interview.interviewMode === 'uploaded') {
        // Uploaded-mode questions are all pre-populated at creation time —
        // never call AI to generate the next question, just advance to the
        // next already-stored question.
        console.log(`[InterviewService] Uploaded mode: advancing to pre-loaded question ${interview.currentQuestion + 1}`);
        interview.currentQuestion += 1;
        // Phase 11 — uploaded mode never calls the decision engine, so
        // there's no move to derive CORE/DEEP_PROBING from; it settles into
        // a fixed CORE once the welcome/first-question period is over.
        interview.interviewPhase = InterviewPhase.CORE;

        const upcoming = interview.questions[interview.currentQuestion - 1];
        if (upcoming) {
          nextQuestion = {
            question: upcoming.questionText,
            questionType: upcoming.questionType as any,
            expectedPoints: upcoming.expectedPoints || [],
            followUpTopics: [],
          };

          // Phase 8 — uploaded-mode questions never go through the
          // decision engine (Phase 3's confirmed uploaded-mode handling:
          // no NextQuestionDecisionEngine call at all). Synthesize the
          // SAME fixed no-op move the engine's own reserved
          // 'uploaded_sequence_fixed' reason code already models, purely
          // so this turn can still receive a presentation plan (a light
          // neutral acknowledgement + the deterministic spoken-form
          // rewrite) — this is never a real decision and never influences
          // which question is shown; canonical `upcoming.questionText`
          // stays authoritative/unchanged.
          const uploadedSyntheticMove: INextInterviewMove = {
            moveType: 'CONTINUE_BLUEPRINT',
            reasonCode: 'uploaded_sequence_fixed',
            priority: 0,
            difficultyIntent: 'same',
            remainingBudget: Math.max(0, interview.totalQuestions - interview.currentQuestion),
            questionSource: 'uploaded',
          };
          presentation = this.buildPresentationPlanSafely({
            interview,
            move: uploadedSyntheticMove,
            questionText: upcoming.questionText,
            answerSignal: interview.questions[currentQuestionIndex]?.answerSignal,
          });
          if (presentation) {
            upcoming.presentation = presentation;
            interview.markModified(`questions.${interview.currentQuestion - 1}.presentation`);
          }
        }
        await interview.save();
      } else {
        console.log(`[InterviewService] More questions remaining. Current: ${interview.currentQuestion}, Total: ${interview.totalQuestions}`);

        // =====================================================================
        // Generate Next Question with Memory Context
        // =====================================================================
        const previousQuestions = interview.questions.map((q) => q.questionText);
        
        // Format memory for AI context
        const memoryContext = interview.interviewMemory 
          ? interviewMemoryService.formatMemoryForAI(interview.interviewMemory)
          : undefined;
        
        // Format coverage for AI context
        const coverageContext = interview.competencyCoverage
          ? coverageTrackerService.getCoverageSummaryForAI(interview.competencyCoverage)
          : undefined;
        
        // Get priority competency (least covered)
        const priorityCompetency = interview.competencyCoverage
          ? coverageTrackerService.getNextCompetencyToPrioritize(interview.competencyCoverage)
          : undefined;
        
        // Format difficulty context for AI
        const difficultyContext = interview.difficultyTracking
          ? difficultyManagerService.getDifficultyContextForAI(interview.difficultyTracking)
          : undefined;
        
        // Update session config with current adaptive difficulty
        const adaptiveDifficulty = interview.difficultyTracking
          ? mapLevelToDifficulty(interview.difficultyTracking.currentLevel)
          : sessionConfig.difficulty;
        
        const adaptiveSessionConfig = {
          ...sessionConfig,
          difficulty: adaptiveDifficulty as DifficultyLevel,
        };
        
        console.log('[InterviewService] Generating next question with context...');
        if (priorityCompetency) {
          console.log(`[InterviewService] Prioritizing competency: ${priorityCompetency}`);
        }
        if (interview.difficultyTracking) {
          console.log(`[InterviewService] Current difficulty: Level ${interview.difficultyTracking.currentLevel}/5`);
        }

        // =====================================================================
        // Phase 3: deterministically DECIDE what kind of question should
        // come next (follow up on this answer? probe a claim/contradiction?
        // switch competency? just continue the blueprint?) using the answer
        // signal already computed above this turn, then use that decision to
        // give the AI generator an explicit, constrained target instead of
        // only the loose priorityCompetency hint.
        // =====================================================================
        // Best-effort — a missing/deleted blueprint must never fail answer
        // submission; the engine degrades to equal-weighted coverage-target
        // selection when blueprintCompetencies is undefined (see
        // NextQuestionDecisionEngine.pickCoverageTarget).
        let blueprintForDecision: Awaited<ReturnType<typeof blueprintService.getBlueprintById>> | null = null;
        if (interview.blueprintId) {
          try {
            blueprintForDecision = await blueprintService.getBlueprintById(interview.blueprintId.toString());
          } catch (blueprintLookupError) {
            console.error('[InterviewService] Blueprint lookup for next-question decision failed (non-critical):', blueprintLookupError);
          }
        }
        const justAnsweredQuestion = interview.questions[currentQuestionIndex];
        const nextMove = nextQuestionDecisionEngine.decideNextMove({
          currentQuestionNumber: interview.currentQuestion,
          totalQuestions: interview.totalQuestions,
          competencyCoverage: interview.competencyCoverage,
          blueprintCompetencies: blueprintForDecision?.competencies,
          answerSignal: justAnsweredQuestion?.answerSignal,
          currentQuestionCompetency: justAnsweredQuestion?.competencyName,
          claims: interview.claimVerification?.claims || [],
          contradictions: interview.contradictionTracking?.contradictions || [],
          // Phase 5 (5A) — lets buildMemoryCallbackCandidates select from the
          // real structured memory store instead of never generating a
          // memory-callback candidate at all.
          interviewMemory: interview.interviewMemory,
          difficultyTracking: interview.difficultyTracking,
          questionHistory: interview.questions,
          interviewMode: interview.interviewMode,
        });
        console.log(`[InterviewService] Next-question decision: ${nextMove.moveType} (${nextMove.reasonCode})`);

        const { response: nextQuestionResponse, finalMove } = await generateQuestionForMove(
          this.aiService,
          {
            sessionConfig: adaptiveSessionConfig,
            previousQuestions,
            memoryContext, // NEW: Pass memory context
            coverageContext, // NEW: Pass coverage context
            priorityCompetency, // NEW: Pass priority competency
            difficultyContext, // NEW: Pass difficulty context
            interviewId: interview._id.toString(),
            interviewLanguage: interview.interviewLanguage,
          },
          nextMove,
          {
            interviewId: interview._id.toString(),
            operation: 'question-generation',
            language: interview.interviewLanguage,
          }
        );
        nextQuestion = nextQuestionResponse;

        // Phase 11 — derived from finalMove (the move actually acted on,
        // post-degrade) rather than nextMove, so a validation-degraded move
        // is labeled consistently with what was actually asked. Persisted
        // alongside `currentQuestion`/the new question in the SAME
        // `interview.save()` call below — one write site, not a second one.
        interview.interviewPhase = deriveInterviewPhase(interview.interviewPhase, finalMove, justAnsweredQuestion?.answerSignal);

        // Add next question with expected points, tagged with the
        // decision's competency/source/reason + the difficulty snapshot
        // computed above.
        const nextQuestionTagging = buildQuestionTaggingFromMove(finalMove, {
          difficultyAtGeneration: adaptiveSessionConfig.difficulty,
        });

        // Phase 8 — built from the SAME finalMove/answerSignal/interview
        // context already in scope here (no new DB reads, no new AI
        // calls), right after the decision is finalized and the question
        // is generated. Attached onto the tagging object so it's persisted
        // on the question it describes (available as repetition-avoidance
        // history for future turns) in the SAME addQuestion call, not a
        // second write.
        presentation = this.buildPresentationPlanSafely({
          interview,
          move: finalMove,
          questionText: nextQuestion.question,
          answerSignal: justAnsweredQuestion?.answerSignal,
        });
        await interview.addQuestion(nextQuestion.question, nextQuestion.expectedPoints, nextQuestion.questionType, {
          ...nextQuestionTagging,
          presentation,
        });

        // Close the loop on the specific claim/contradiction just probed
        // (reusing the existing, previously-unused idempotency markers on
        // those records) so the engine never re-suggests the same one next
        // turn. Best-effort — never blocks progression.
        try {
          if (interview.claimVerification) {
            const matchedClaim = findClaimForMove(interview.claimVerification.claims, finalMove);
            if (matchedClaim) {
              claimVerificationService.markFollowUpAsked(interview.claimVerification, matchedClaim.claim, interview.currentQuestion + 1);
              interview.markModified('claimVerification');
            }
          }
          if (interview.contradictionTracking) {
            const matchedIndex = findContradictionIndexForMove(interview.contradictionTracking.contradictions, finalMove);
            if (matchedIndex >= 0) {
              contradictionDetectorService.markClarificationAsked(interview.contradictionTracking, matchedIndex, interview.currentQuestion + 1);
              interview.markModified('contradictionTracking');
            }
          }
          // Phase 5 (5A) — same idempotency-marker pattern as claims/
          // contradictions above: closes the loop on the specific memory
          // item just used as a MEMORY_CALLBACK source so subsequent
          // selection naturally respects its reuse cap.
          if (interview.interviewMemory) {
            const matchedItem = findMemoryItemForMove(interview.interviewMemory, finalMove);
            if (matchedItem) {
              interviewMemoryService.markCallbackUsed(interview.interviewMemory, matchedItem);
              interview.markModified('interviewMemory');
            }
          }
        } catch (markError) {
          console.error('[InterviewService] Failed to mark claim/contradiction/memory follow-up as asked (non-critical):', markError);
        }
        
        // Increment current question counter
        interview.currentQuestion += 1;
        console.log(`[InterviewService] Next question added. New currentQuestion: ${interview.currentQuestion}`);
        
        // Save interview with new question and updated memory
        await interview.save();
      }

      console.log('[InterviewService] Returning response with isCompleted:', isCompleted);

      return {
        interview: finalInterview,
        evaluation,
        nextQuestion,
        isCompleted,
        presentation,
      };
    } catch (error) {
      console.error('[InterviewService] Error in submitAnswer:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new ApiError(500, `Failed to submit answer: ${message}`);
    }
  }

  /**
   * Phase 11 (11A) — records the optional warm-up exchange's answer.
   * Deliberately entirely separate from `submitAnswer`: it NEVER appends to
   * `questions[]`, NEVER increments `currentQuestion`, NEVER touches
   * `totalQuestions`/`answeredCount` accounting, NEVER calls
   * `aiService.evaluateAnswer`, NEVER consumes interview credit, and NEVER
   * runs through `NextQuestionDecisionEngine` — this is precisely the
   * "surprise extra scored question" risk this design exists to avoid.
   *
   * Idempotent via `warmUpAnsweredAt`: a duplicate/retried call (double
   * submit, a client retry after a lost response) is a safe no-op once
   * already recorded, rather than re-running memory extraction twice.
   *
   * Memory extraction is best-effort/non-critical (matches every other
   * non-critical-enrichment call site in this file) — a failure here must
   * never fail the endpoint; the warm-up's only real effects are (a)
   * presentation (already delivered client-side before this call) and (b)
   * optionally populating `interviewMemory` for later memory-callbacks.
   */
  async submitWarmUpAnswer(params: { interviewId: string; userId: string; answer: string; duration?: number }): Promise<{ alreadyAnswered: boolean }> {
    // `duration` accepted for API-shape symmetry with `submitAnswer` but
    // deliberately never persisted — the warm-up exchange has no timed/
    // scored dimension.
    const { interviewId, userId, answer } = params;

    const interview = await Interview.findOne({
      _id: new Types.ObjectId(interviewId),
      userId: new Types.ObjectId(userId),
    });
    if (!interview) {
      throw new ApiError(404, 'Interview not found');
    }

    if (interview.warmUpAnsweredAt) {
      return { alreadyAnswered: true };
    }

    try {
      const memoryQuestion = buildWarmUpPrompt(interview);
      const updatedMemory = await interviewMemoryService.extractMemoryFromAnswer({
        question: memoryQuestion,
        answer,
        // Not a real questionNumber (no question was ever appended) — 0 is
        // used purely as a "before question 1" marker for any consumer that
        // inspects it; nothing in this phase reads it back for the warm-up
        // item specifically.
        questionNumber: 0,
        existingMemory: interview.interviewMemory || createEmptyMemory(),
        interviewId: interview._id.toString(),
      });
      interview.interviewMemory = updatedMemory;
    } catch (memoryError) {
      console.error('[InterviewService] Warm-up memory extraction failed (non-critical):', memoryError);
    }

    interview.warmUpAnsweredAt = new Date();
    // Transient — question 1's own submitAnswer call moves this to
    // CORE/DEEP_PROBING as normal the moment a real move is decided.
    interview.interviewPhase = InterviewPhase.WARM_UP;
    await interview.save();

    return { alreadyAnswered: false };
  }

  /**
   * Generate final report for a completed interview. Retry-safe/idempotent:
   * never calls AI again once a report exists, so a retried submitAnswer or
   * a later retry from a COMPLETED-but-unreported interview can't cause
   * duplicate AI cost or overwrite an existing report.
   */
  private async generateFinalReport(interview: IInterview): Promise<void> {
    if (interview.finalReport) {
      // Report already exists — repair a status left at COMPLETED by a prior
      // partial save, but never re-call AI.
      if (interview.status !== InterviewStatus.EVALUATED) {
        await Interview.updateOne({ _id: interview._id }, { $set: { status: InterviewStatus.EVALUATED } });
        interview.status = InterviewStatus.EVALUATED;
      }
      return;
    }

    try {
      console.log('[InterviewService] Collecting evaluations for final report...');
      const evaluations = interview.questions
        .filter((q) => q.evaluation)
        .map((q) => ({
          question: q.questionText,
          answer: q.answerText || '',
          evaluation: {
            dimensions: q.evaluation!.dimensions || [],
            overallScore: q.evaluation!.overallScore,
            strengths: q.evaluation!.strengths,
            weaknesses: q.evaluation!.weaknesses,
            suggestions: q.evaluation!.suggestions,
            missingPoints: q.evaluation!.missingPoints || [],
          },
        }));

      console.log(`[InterviewService] Found ${evaluations.length} evaluated questions`);
      console.log('[InterviewService] Calling OpenAI to generate final report...');

      // Build session config
      const experienceLevel = interview.experienceLevel || mapExperienceYearsToLevel(interview.experienceYears);
      const interviewStyle = interview.interviewStyle || inferInterviewStyle(interview.topic);
      
      const sessionConfig = {
        topic: interview.topic as InterviewTopic,
        difficulty: interview.difficulty as DifficultyLevel,
        experienceLevel: experienceLevel as ExperienceLevel,
        interviewStyle: interviewStyle as InterviewStyle,
        totalQuestions: interview.totalQuestions,
      };

      const finalReportResult = await this.aiService.generateFinalReport(
        {
          sessionConfig,
          evaluations,
          interviewId: interview._id.toString(),
          interviewLanguage: interview.interviewLanguage,
        },
        {
          interviewId: interview._id.toString(),
          operation: 'final-report-generation',
          language: interview.interviewLanguage,
        }
      );
      const finalReport = finalReportResult.data;

      console.log('[InterviewService] Final report received from OpenAI');
      console.log('[InterviewService] Saving final report to interview...');

      // Overall numeric score must be a deterministic average of the
      // per-question evaluation scores, never OpenAI's own arithmetic —
      // OpenAI can still write the summary/recommendations/overview text.
      const evaluatedScores = interview.questions
        .filter((q) => q.evaluation?.overallScore !== undefined)
        .map((q) => q.evaluation!.overallScore);
      const deterministicOverallScore =
        evaluatedScores.length > 0
          ? Math.round((evaluatedScores.reduce((sum, score) => sum + score, 0) / evaluatedScores.length) * 10) / 10
          : 0;

      await interview.generateFinalReport({
        summary: finalReport.summary,
        recommendations: finalReport.recommendations,
        overallScore: deterministicOverallScore,
        strengthsOverview: finalReport.strengthsOverview,
        weaknessesOverview: finalReport.weaknessesOverview,
        nextSteps: finalReport.nextSteps,
      });

      // Don't set status here - it will be set by generateFinalReport method
      console.log('[InterviewService] Final report saved, status should be evaluated');
    } catch (error) {
      console.error('[InterviewService] Error in generateFinalReport:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new ApiError(500, `Failed to generate final report: ${message}`);
    }
  }

  /**
   * Backend recovery only — lets a client that refreshed/reopened the app
   * safely resume an IN_PROGRESS interview. Reads persisted state only:
   * zero AI calls, no credit activity, no question regeneration.
   */
  async getInterviewSession(params: { interviewId: string; userId: string }): Promise<InterviewSession> {
    const { interviewId, userId } = params;

    const interview = await Interview.findOne({
      _id: new Types.ObjectId(interviewId),
      userId: new Types.ObjectId(userId),
    });

    if (!interview) {
      throw new ApiError(404, 'Interview not found');
    }

    const total = interview.totalQuestions;
    const answeredQuestions = interview.questions.filter((q) => q.answerText).length;
    const progress = {
      answered: answeredQuestions,
      total,
      percentage: total > 0 ? Math.round((answeredQuestions / total) * 100) : 0,
    };

    const base = {
      interviewId: interview._id.toString(),
      status: interview.status,
      interviewMode: interview.interviewMode,
      topic: interview.topic,
      difficulty: interview.difficulty,
      interviewLanguage: interview.interviewLanguage,
      totalQuestions: total,
      answeredQuestions,
      progress,
    };

    // Terminal states — nothing to resume, never fabricate a question.
    if (interview.status === InterviewStatus.COMPLETED || interview.status === InterviewStatus.EVALUATED) {
      return {
        ...base,
        currentQuestionIndex: interview.currentQuestion - 1,
        resumable: false,
        reportAvailable: interview.status === InterviewStatus.EVALUATED && !!interview.finalReport,
        currentQuestion: null,
      };
    }

    // Not implemented in this prompt — remains a valid stored state, never resumable.
    if (interview.status === InterviewStatus.PAUSED) {
      return {
        ...base,
        currentQuestionIndex: interview.currentQuestion - 1,
        resumable: false,
        reportAvailable: false,
        currentQuestion: null,
      };
    }

    // Shell persisted but initialization never completed — do not pretend it's resumable.
    if (interview.status === InterviewStatus.CREATED) {
      throw new ApiError(409, 'Interview initialization was incomplete and cannot be resumed');
    }

    // IN_PROGRESS from here. A generated interview with no persisted
    // questions is inconsistent — recovery must not call AI to fix it.
    if (interview.questions.length === 0) {
      throw new ApiError(409, 'Interview is in an inconsistent state and cannot be resumed');
    }

    const firstUnansweredIndex = interview.questions.findIndex((q) => !q.answerText);
    if (firstUnansweredIndex === -1) {
      throw new ApiError(409, 'Interview has no unanswered question available to resume');
    }

    // Do not blindly trust the persisted pointer — validate it against the
    // actual first unanswered question before using it.
    const claimedIndex = interview.currentQuestion - 1;
    const claimedQuestion = interview.questions[claimedIndex];
    const claimedIsValid = !!claimedQuestion && !claimedQuestion.answerText;
    const resolvedIndex = claimedIsValid ? claimedIndex : firstUnansweredIndex;

    // Safe, single, targeted repair of a stale pointer — no AI, never
    // touches answered content.
    if (!claimedIsValid && interview.currentQuestion !== resolvedIndex + 1) {
      await Interview.updateOne({ _id: interview._id }, { $set: { currentQuestion: resolvedIndex + 1 } });
    }

    const question = interview.questions[resolvedIndex];

    return {
      ...base,
      currentQuestionIndex: resolvedIndex,
      resumable: true,
      reportAvailable: false,
      currentQuestion: {
        questionText: question.questionText,
        expectedPoints: question.expectedPoints,
        questionType: question.questionType,
      },
    };
  }

  /**
   * Get detailed interview report
   */
  async getInterviewReport(interviewId: string, userId: string): Promise<InterviewReport> {
    const interview = await Interview.findOne({
      _id: new Types.ObjectId(interviewId),
      userId: new Types.ObjectId(userId),
    });

    if (!interview) {
      throw new ApiError(404, 'Interview not found');
    }

    // Retry-safe recovery: a COMPLETED interview with no report means a
    // prior report-generation attempt never finished (e.g. a crash) — retry
    // it here, since submitAnswer can never be called again for a COMPLETED
    // interview. generateFinalReport() itself is the idempotency guard: it
    // makes no AI call and no-ops (aside from a status repair) if a report
    // already exists, so this is safe to hit on every report view.
    if (interview.status === InterviewStatus.COMPLETED) {
      try {
        await this.generateFinalReport(interview);
      } catch (retryError) {
        console.error('[InterviewService] Retry of final report generation failed (non-critical for report view):', retryError);
      }
    }

    // Calculate statistics
    const answeredQuestions = interview.questions.filter((q) => q.answerText).length;
    const completionRate = (answeredQuestions / interview.totalQuestions) * 100;
    const totalDuration = interview.questions.reduce((sum, q) => sum + (q.duration ?? 0), 0);
    
    const evaluatedQuestions = interview.questions.filter((q) => q.evaluation);
    const averageScore = evaluatedQuestions.length > 0
      ? evaluatedQuestions.reduce((sum, q) => sum + (q.evaluation?.overallScore ?? 0), 0) / evaluatedQuestions.length
      : 0;

    // Report overall score must always be the deterministic average of the
    // actual question evaluation scores — never trust a stored finalReport
    // value that may predate this fix (it could still hold an OpenAI-derived
    // number that disagrees with the Detailed Analysis scores).
    const calculatedOverallScore = Math.round(averageScore * 10) / 10;

    console.log('[ReportScore]', {
      questionScores: evaluatedQuestions.map((q) => q.evaluation?.overallScore),
      calculatedOverallScore,
      storedFinalReportScore: interview.finalReport?.overallScore,
    });

    if (interview.finalReport && interview.finalReport.overallScore !== calculatedOverallScore) {
      await Interview.updateOne(
        { _id: interview._id },
        { $set: { 'finalReport.overallScore': calculatedOverallScore } }
      );
      interview.finalReport.overallScore = calculatedOverallScore;
    }

    const strengthsCount = interview.questions.reduce(
      (sum, q) => sum + (q.evaluation?.strengths.length ?? 0),
      0
    );
    const weaknessesCount = interview.questions.reduce(
      (sum, q) => sum + (q.evaluation?.weaknesses.length ?? 0),
      0
    );

    // Backfill/resolve expected answer per evaluated question via the same
    // helper used during submission — an uploaded referenceAnswer or an
    // already-generated modelAnswer is reused as-is; AI is only called when
    // genuinely missing, so we never waste tokens re-generating an answer.
    const resolvedAnswers = new Map<number, string>();
    for (let i = 0; i < interview.questions.length; i++) {
      if (!interview.questions[i].evaluation) continue;
      const { expectedAnswer } = await this.resolveExpectedAnswer(interview, i);
      if (expectedAnswer) resolvedAnswers.set(i, expectedAnswer);
    }

    // Phase 6 (6D) — legacy/stuck-recovery: a question can only ever be
    // missing STAR analysis if either (a) the deferred-enrichment job was
    // never enqueued (a transient enqueue failure right after submitAnswer
    // persisted the answer, or an interview answered before this phase
    // shipped) or (b) the job hasn't run yet. modelAnswer never needs this
    // treatment — the loop above already resolves it synchronously on every
    // report view. Best-effort, idempotent (enqueue itself de-dupes on the
    // same key the normal/recovery paths already use), and scoped to a
    // finished interview only — never touches one still IN_PROGRESS. Gated
    // on shouldAnalyzeSTAR so a non-behavioral interview (where STAR
    // legitimately never gets computed — analyzeSTAR always returns null for
    // it) isn't re-enqueued forever on every single report view.
    if (
      (interview.status === InterviewStatus.COMPLETED || interview.status === InterviewStatus.EVALUATED) &&
      shouldAnalyzeSTAR(interview.interviewStyle || inferInterviewStyle(interview.topic))
    ) {
      for (let i = 0; i < interview.questions.length; i++) {
        const q = interview.questions[i];
        if (q.evaluation && !q.evaluation.starAnalysis) {
          await this.enqueueDeferredEnrichment(interview._id.toString(), i);
        }
      }
    }

    console.log(
      '[Report] model answers:',
      interview.questions.map((q, i) => ({
        question: i + 1,
        questionSource: q.questionSource || 'ai',
        answerSource: q.answerSource,
        hasExpectedAnswer: resolvedAnswers.has(i),
      }))
    );

    return {
      interview: {
        id: interview._id.toString(),
        topic: interview.topic,
        difficulty: interview.difficulty,
        experienceYears: interview.experienceYears,
        status: interview.status,
        createdAt: interview.createdAt,
        completedAt: interview.completedAt ?? interview.updatedAt,
        totalQuestions: interview.totalQuestions,
        answeredQuestions,
        interviewLanguage: interview.interviewLanguage,
      },
      questions: interview.questions.map((q, i) => ({
        questionText: q.questionText,
        expectedPoints: q.expectedPoints,
        modelAnswer: resolvedAnswers.get(i),
        questionSource: q.questionSource || 'ai',
        competencyName: q.competencyName,
        sourceReasonCode: q.sourceReasonCode,
        difficultyAtGeneration: q.difficultyAtGeneration,
        answerSource: q.answerSource,
        referenceAnswer: isValidModelAnswer(q.referenceAnswer) ? q.referenceAnswer : undefined,
        answerText: q.answerText,
        answeredAt: q.answeredAt,
        duration: q.duration,
        evaluation: q.evaluation,
        answerSignal: q.answerSignal,
      })),
      finalReport: interview.finalReport
        ? {
            overallScore: calculatedOverallScore,
            summary: interview.finalReport.summary,
            recommendations: interview.finalReport.recommendations,
            strengthsOverview: interview.finalReport.strengthsOverview || [],
            weaknessesOverview: interview.finalReport.weaknessesOverview || [],
            nextSteps: interview.finalReport.nextSteps || [],
            generatedAt: interview.finalReport.generatedAt,
          }
        : undefined,
      statistics: {
        averageScore: calculatedOverallScore,
        completionRate: Math.round(completionRate),
        totalDuration,
        strengthsCount,
        weaknessesCount,
      },
      // Re-fetched rather than read off the in-memory `interview` doc — the
      // backfill loop above may have just persisted a fresh AI call's usage
      // via a targeted update, which the in-memory document wouldn't reflect.
      // .lean() — a hydrated partial-projection document would still run the
      // schema's post('init') hook, which computes every virtual (including
      // ones that assume `questions` is present) and crashes on a doc that
      // only has `aiUsage` selected. .lean() returns a plain object instead,
      // skipping hydration/virtuals/hooks entirely.
      aiCost: buildAICostReport((await Interview.findById(interview._id).select('aiUsage').lean())?.aiUsage),
    };
  }

  /**
   * Get user's interview history with pagination and filters
   */
  async getInterviewHistory(params: GetHistoryParams): Promise<{
    interviews: Array<{
      id: string;
      topic: string;
      difficulty: string;
      status: string;
      overallScore?: number;
      totalQuestions: number;
      answeredQuestions: number;
      createdAt: Date;
      completedAt?: Date;
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  }> {
    const { userId, page, limit, filters } = params;

    // Build query
    const query: any = { userId: new Types.ObjectId(userId) };

    if (filters?.topic) {
      query.topic = filters.topic;
    }
    if (filters?.difficulty) {
      query.difficulty = filters.difficulty;
    }
    if (filters?.status) {
      query.status = filters.status;
    }

    // Count total documents
    const total = await Interview.countDocuments(query);

    // Fetch interviews with pagination
    const interviews = await Interview.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return {
      interviews: interviews.map((interview) => ({
        id: interview._id.toString(),
        topic: interview.topic,
        difficulty: interview.difficulty,
        status: interview.status,
        overallScore: interview.finalReport?.overallScore,
        totalQuestions: interview.totalQuestions,
        answeredQuestions: interview.questions.filter((q) => q.answerText).length,
        createdAt: interview.createdAt,
        completedAt: interview.status === InterviewStatus.COMPLETED || interview.status === InterviewStatus.EVALUATED
          ? interview.completedAt ?? interview.updatedAt
          : undefined,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get user's interview statistics
   */
  async getUserStats(userId: string): Promise<{
    totalInterviews: number;
    completedInterviews: number;
    averageScore: number;
    highestScore: number;
    lastInterviewScore: number;
  }> {
    const interviews = await Interview.find({
      userId: new Types.ObjectId(userId),
    }).sort({ createdAt: -1 }).lean();

    const completedInterviews = interviews.filter(
      (i) => i.status === InterviewStatus.COMPLETED || i.status === InterviewStatus.EVALUATED
    );

    const evaluatedInterviews = interviews.filter(
      (i) => i.status === InterviewStatus.EVALUATED && i.finalReport?.overallScore !== undefined
    );

    // Calculate scores only from evaluated interviews with valid scores
    const validScores = evaluatedInterviews
      .map((i) => i.finalReport?.overallScore)
      .filter((score): score is number => typeof score === 'number' && Number.isFinite(score));

    const averageScore = validScores.length > 0
      ? validScores.reduce((sum, score) => sum + score, 0) / validScores.length
      : 0;

    const highestScore = validScores.length > 0
      ? Math.max(...validScores)
      : 0;

    const lastInterview = evaluatedInterviews[0];
    const lastInterviewScore = lastInterview?.finalReport?.overallScore ?? 0;

    return {
      totalInterviews: interviews.length,
      completedInterviews: completedInterviews.length,
      averageScore: Number(averageScore.toFixed(2)),
      highestScore: Number(highestScore.toFixed(2)),
      lastInterviewScore: Number(lastInterviewScore.toFixed(2)),
    };
  }

  /**
   * Delete an interview
   */
  async deleteInterview(interviewId: string, userId: string): Promise<void> {
    const interview = await Interview.findOne({
      _id: new Types.ObjectId(interviewId),
      userId: new Types.ObjectId(userId),
    });

    if (!interview) {
      throw new ApiError(404, 'Interview not found');
    }

    await Interview.deleteOne({ _id: new Types.ObjectId(interviewId) });
  }
}

export default new InterviewService();
