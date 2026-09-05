import { Types } from 'mongoose';
import Interview, { IInterview, IEvaluation, IQuestion } from '../models/interview.model';
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
import { InterviewStatus, InterviewPurpose, isAnswerableStatus, MAX_UPLOADED_QUESTIONS } from '../constants/interview';
import { blueprintService } from './BlueprintService';
import { interviewMemoryService } from './InterviewMemoryService';
import { createEmptyMemory } from '../models/InterviewMemory.model';
import { coverageTrackerService } from './CoverageTrackerService';
import { initializeCoverage } from '../models/CompetencyCoverage.model';
import { difficultyManagerService } from './DifficultyManagerService';
import { initializeDifficultyTracking, mapLevelToDifficulty } from '../models/DifficultyTracking.model';import { claimVerificationService } from './ClaimVerificationService';
import { contradictionDetectorService } from './ContradictionDetectorService';
import { starAnalysisService } from './STARAnalysisService';
import { buildAICostReport, AICostReport } from './AIUsageService';
import { normalizeLanguageCode } from '../config/languages';
import { ParsedQuestion, normalizeUploadedQuestions } from './QuestionFileParserService';
import { questionSetService } from './QuestionSetService';
import InstituteStudentInterviewAssignment from '../models/InstituteStudentInterviewAssignment.model';
import { InstituteStudentInterviewAssignmentStatus } from '../constants/instituteStudentInterviewAssignment';

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
    questionSource?: 'ai' | 'uploaded';
    answerSource?: 'uploaded' | 'ai-generated';
    referenceAnswer?: string;
    answerText?: string;
    answeredAt?: Date;
    duration?: number;
    evaluation?: IEvaluation;
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
        await interview.addQuestion(questionResponse.question, questionResponse.expectedPoints, questionResponse.questionType);

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
      currentQuestion: 1,
      questions,
    });

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
      currentQuestion: 1,
      questions,
    });

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
   * CREATED ("shell persisted, no usable first question yet") until a
   * later sprint converts the blueprint into real questions. The unique
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
   * Submit answer and get evaluation + next question
   */
  async submitAnswer(params: SubmitAnswerParams): Promise<{
    interview: IInterview;
    evaluation: DynamicEvaluationResponse;
    nextQuestion?: QuestionResponse;
    isCompleted: boolean;
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

      // Evaluate answer using OpenAI
      const evaluationResult = await this.aiService.evaluateAnswer(
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
      );
      const evaluation = evaluationResult.data;

      // Perform STAR analysis for behavioral interviews
      let starAnalysis = null;
      try {
        starAnalysis = await starAnalysisService.analyzeSTAR({
          question: currentQuestion.questionText,
          answer,
          interviewStyle: interviewStyle as InterviewStyle,
          interviewId: interview._id.toString(),
          interviewLanguage: interview.interviewLanguage,
        });
        
        if (starAnalysis) {
          console.log(`[InterviewService] STAR analysis completed. Score: ${starAnalysis.overallSTARScore}/10`);
        }
      } catch (starError) {
        console.error('[InterviewService] STAR analysis failed (non-critical):', starError);
      }

      // Store evaluation (dynamic dimensions + STAR)
      await interview.evaluateQuestion(currentQuestionIndex, {
        dimensions: evaluation.dimensions,
        overallScore: evaluation.overallScore,
        strengths: evaluation.strengths,
        weaknesses: evaluation.weaknesses,
        suggestions: evaluation.suggestions,
        missingPoints: evaluation.missingPoints,
        starAnalysis: starAnalysis || undefined,
      });

      // =====================================================================
      // Resolve Expected Answer (uploaded reference answer takes priority;
      // AI model-answer is generated only when nothing valid exists yet)
      // =====================================================================
      console.log('[InterviewService] Resolving expected answer for learning...');
      await this.resolveExpectedAnswer(interview, currentQuestionIndex);

      // =====================================================================
      // NEW: Extract and Store Interview Memory
      // =====================================================================
      console.log('[InterviewService] Extracting memory from answer...');
      try {
        const updatedMemory = await interviewMemoryService.extractMemoryFromAnswer({
          question: currentQuestion.questionText,
          answer,
          questionNumber: interview.currentQuestion,
          existingMemory: interview.interviewMemory || createEmptyMemory(),
          interviewId: interview._id.toString(),
        });
        
        // Update interview memory
        interview.interviewMemory = updatedMemory;
        console.log(`[InterviewService] Memory updated. Total facts: ${updatedMemory.totalFacts}`);
      } catch (memoryError) {
        console.error('[InterviewService] Memory extraction failed (non-critical):', memoryError);
        // Don't fail the interview if memory extraction fails
      }
      
      // =====================================================================
      // NEW: Extract Verifiable Claims
      // =====================================================================
      console.log('[InterviewService] Extracting verifiable claims...');
      try {
        if (interview.claimVerification) {
          const updatedClaims = await claimVerificationService.extractClaims({
            question: currentQuestion.questionText,
            answer,
            questionNumber: interview.currentQuestion,
            currentTracking: interview.claimVerification,
            interviewId: interview._id.toString(),
          });
          
          interview.claimVerification = updatedClaims;
          console.log(`[InterviewService] Claims updated. Total: ${updatedClaims.totalClaims}, Unverified: ${updatedClaims.unverifiedCount}`);
        }
      } catch (claimError) {
        console.error('[InterviewService] Claim extraction failed (non-critical):', claimError);
        // Don't fail the interview if claim extraction fails
      }
      
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
      // NEW: Update Competency Coverage
      // =====================================================================
      console.log('[InterviewService] Updating competency coverage...');
      try {
        // Get blueprint for competencies
        if (interview.blueprintId && interview.competencyCoverage) {
          const blueprint = await blueprintService.getBlueprintById(interview.blueprintId.toString());
          if (blueprint) {
            const updatedCoverage = await coverageTrackerService.updateCoverage({
              question: currentQuestion.questionText,
              answer,
              questionNumber: interview.currentQuestion,
              competencies: blueprint.competencies,
              currentCoverage: interview.competencyCoverage,
              interviewId: interview._id.toString(),
            });
            
            interview.competencyCoverage = updatedCoverage;
            console.log(`[InterviewService] Coverage updated. Overall: ${updatedCoverage.overallCoverage}%, Least covered: ${updatedCoverage.leastCoveredCompetency}`);
          }
        }
      } catch (coverageError) {
        console.error('[InterviewService] Coverage tracking failed (non-critical):', coverageError);
        // Don't fail the interview if coverage tracking fails
      }
      
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
      let finalInterview = interview; // Track the final interview to return

      if (isCompleted) {
        console.log('[InterviewService] Interview completed! Generating final report...');
        // Mark as completed and set completion timestamp
        interview.status = InterviewStatus.COMPLETED;
        interview.completedAt = new Date();
        await interview.save();
        console.log('[InterviewService] Interview saved with status: completed');
        await this.syncInstituteAssignmentOnCompletion(interview);

        // Reload the interview to refresh the _original tracking
        let reloadedInterview = await Interview.findById(interview._id);
        if (!reloadedInterview) {
          throw new ApiError(404, 'Interview not found after save');
        }
        
        try {
          // generateFinalReport will set status to 'evaluated' and save
          await this.generateFinalReport(reloadedInterview);
          console.log('[InterviewService] Final report generated successfully');
          
          // Reload again to get the evaluated version with final report
          const evaluatedInterview = await Interview.findById(interview._id);
          if (evaluatedInterview) {
            finalInterview = evaluatedInterview;
          } else {
            finalInterview = reloadedInterview;
          }
        } catch (reportError) {
          // Log error but don't fail the submission
          console.error('[InterviewService] Error generating final report:', reportError);
          console.error('[InterviewService] Interview will be marked as completed anyway');
          // Still use the reloaded interview even if report generation failed
          finalInterview = reloadedInterview;
        }
      } else if (interview.interviewMode === 'uploaded') {
        // Uploaded-mode questions are all pre-populated at creation time —
        // never call AI to generate the next question, just advance to the
        // next already-stored question.
        console.log(`[InterviewService] Uploaded mode: advancing to pre-loaded question ${interview.currentQuestion + 1}`);
        interview.currentQuestion += 1;
        await interview.save();

        const upcoming = interview.questions[interview.currentQuestion - 1];
        if (upcoming) {
          nextQuestion = {
            question: upcoming.questionText,
            questionType: upcoming.questionType as any,
            expectedPoints: upcoming.expectedPoints || [],
            followUpTopics: [],
          };
        }
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
        
        const nextQuestionResult = await this.aiService.generateQuestion(
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
          {
            interviewId: interview._id.toString(),
            operation: 'question-generation',
            language: interview.interviewLanguage,
          }
        );
        nextQuestion = nextQuestionResult.data;

        // Add next question with expected points
        await interview.addQuestion(nextQuestion.question, nextQuestion.expectedPoints, nextQuestion.questionType);
        
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
      };
    } catch (error) {
      console.error('[InterviewService] Error in submitAnswer:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new ApiError(500, `Failed to submit answer: ${message}`);
    }
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
        answerSource: q.answerSource,
        referenceAnswer: isValidModelAnswer(q.referenceAnswer) ? q.referenceAnswer : undefined,
        answerText: q.answerText,
        answeredAt: q.answeredAt,
        duration: q.duration,
        evaluation: q.evaluation,
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
