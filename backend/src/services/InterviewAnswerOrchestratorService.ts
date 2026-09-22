import { Types } from 'mongoose';
import Interview, { IEvaluation, IInterview } from '../models/interview.model';
import InterviewAnswerRecoveryClaim from '../models/InterviewAnswerRecoveryClaim.model';
import InstituteStudentInterviewAssignment from '../models/InstituteStudentInterviewAssignment.model';
import { InstituteStudentInterviewAssignmentStatus } from '../constants/instituteStudentInterviewAssignment';
import { InterviewStatus, InterviewPhase } from '../constants/interview';
import { ApiError } from '../utils/ApiError';
import { getAIService } from '../ai';
import {
  DifficultyLevel,
  DynamicEvaluationResponse,
  ExperienceLevel,
  InterviewStyle,
  InterviewTopic,
  QuestionResponse,
} from './OpenAIService';
import { inferInterviewStyle, mapExperienceYearsToLevel } from './OpenAIAdapter';
import { InterviewService } from './InterviewService';
import { answerSignalService, buildFallbackAnswerSignal, hasCompleteAnswerSignal } from './AnswerSignalService';
import { IAnswerSignal } from '../constants/answerSignal';
import { mapLevelToDifficulty } from '../models/DifficultyTracking.model';
import { coverageTrackerService } from './CoverageTrackerService';
import { blueprintService } from './BlueprintService';
import {
  nextQuestionDecisionEngine,
  generateQuestionForMove,
  buildQuestionTaggingFromMove,
  findClaimForMove,
  findContradictionIndexForMove,
  findMemoryItemForMove,
  QuestionTaggingFromMove,
  deriveInterviewPhase,
} from './NextQuestionDecisionEngine';
import { conversationHumanizerService } from './ConversationHumanizerService';
import { ConversationPresentationPlan } from '../constants/conversationHumanizer';
import { resolveInterviewModePolicy, resolveInterviewPersonality } from '../constants/interviewModePolicy';
import { DEFAULT_LANGUAGE_CODE } from '../config/languages';

const RECOVERY_CLAIM_STALE_MS = 2 * 60 * 1000;
// Wraps the entire legacy submission chain (evaluation + memory/claim/
// contradiction/coverage/difficulty updates + next-question generation) —
// several sequential AI calls — so it needs a longer stale-lease window than
// the single-AI-call recovery path below to avoid reclaiming a still-alive
// first submission as abandoned.
const FIRST_SUBMISSION_CLAIM_STALE_MS = 5 * 60 * 1000;

interface SubmitAnswerParams {
  interviewId: string;
  userId: string;
  answer: string;
  duration: number;
  /** 1-based question number displayed to the client. New clients always send it; legacy clients may omit it. */
  questionNumber?: number;
  /** Phase 2 (2C) — canonical concept-registry keys detected client-side while speaking. Optional/additive; passed through to InterviewService.submitAnswer unchanged. */
  partialConcepts?: string[];
}

interface SubmitAnswerResult {
  interview: IInterview;
  evaluation: DynamicEvaluationResponse;
  nextQuestion?: QuestionResponse;
  isCompleted: boolean;
  // Phase 8 — additive, optional; absent for uploaded/legacy/non-English/
  // failure cases or when there is no next question (see
  // ConversationHumanizerService / InterviewService.submitAnswer).
  presentation?: ConversationPresentationPlan;
}

function normalizeAnswer(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function validReferenceAnswer(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value !== 'undefined' && value !== 'null';
}

/**
 * Wraps the existing InterviewService with one missing production guarantee:
 * retry-safe answer submission after a timeout/5xx/response-loss.
 *
 * The original service remains the normal path. This class only takes over
 * when the exact displayed question already has a persisted answer. That can
 * happen if the first request saved the answer/evaluation but failed before
 * returning the next question. Without this recovery path, a retry was
 * rejected as "Question already answered" and the interview could become
 * permanently stuck.
 */
export class InterviewAnswerOrchestratorService {
  private aiService = getAIService();

  constructor(private readonly core: InterviewService) {}

  async submitAnswer(params: SubmitAnswerParams): Promise<SubmitAnswerResult> {
    if (!params.questionNumber) {
      // Backward-compatible legacy caller: preserve existing behavior.
      return this.core.submitAnswer(params);
    }
    const questionNumber = params.questionNumber;

    const interview = await Interview.findOne({
      _id: new Types.ObjectId(params.interviewId),
      userId: new Types.ObjectId(params.userId),
    });

    if (!interview) throw new ApiError(404, 'Interview not found');

    const targetIndex = questionNumber - 1;
    const target = interview.questions[targetIndex];
    if (!target) {
      throw new ApiError(409, 'This question is no longer the active interview question', undefined, 'INTERVIEW_QUESTION_STALE');
    }

    if (!target.answerText) {
      if (interview.currentQuestion !== questionNumber) {
        throw new ApiError(409, 'The interview has moved to a different question. Reload to continue.', undefined, 'INTERVIEW_QUESTION_STALE');
      }
      // Two concurrent first-time submissions for the exact same question
      // (a double-click, or a client retry racing the still-in-flight
      // original) would otherwise both pass the in-memory checks above and
      // both reach the legacy service below, which persists via plain
      // document `.save()` calls with no optimistic-concurrency guard —
      // each would independently call the AI evaluator AND independently
      // append a "next question"/increment `currentQuestion`, doubling AI
      // cost and corrupting progression. Serialize on the SAME atomic claim
      // the post-persistence recovery path already uses below, so only one
      // caller ever runs the legacy submission for this question at a time.
      // A longer staleness window than the recovery path's is used here
      // because this wraps the ENTIRE legacy call (evaluation, memory/claim/
      // contradiction/coverage/difficulty updates, and next-question
      // generation — several sequential AI calls), not just one.
      await this.acquireRecoveryClaim(interview._id.toString(), targetIndex, FIRST_SUBMISSION_CLAIM_STALE_MS);
      try {
        const result = await this.core.submitAnswer(params);
        await InterviewAnswerRecoveryClaim.updateOne(
          { interviewId: interview._id, questionIndex: targetIndex },
          { $set: { status: 'completed', completedAt: new Date(), failureMessage: undefined } }
        ).catch(() => undefined);
        return result;
      } catch (error) {
        await InterviewAnswerRecoveryClaim.updateOne(
          { interviewId: interview._id, questionIndex: targetIndex },
          {
            $set: {
              status: 'failed',
              failureMessage: error instanceof Error ? error.message.slice(0, 500) : 'Answer submission failed',
            },
          }
        ).catch(() => undefined);
        throw error;
      }
    }

    // A repeated request may only be treated as idempotent if it represents
    // the exact same answer. Never let an old/stale client overwrite a saved
    // answer after the interview has progressed.
    if (normalizeAnswer(target.answerText) !== normalizeAnswer(params.answer)) {
      throw new ApiError(
        409,
        'An answer is already saved for this question. Reload the interview to continue safely.',
        undefined,
        'INTERVIEW_ANSWER_CONFLICT'
      );
    }

    // If the first request completed the mutation but its HTTP response was
    // lost, simply replay persisted state — zero additional AI cost.
    if (target.evaluation && (interview.currentQuestion > questionNumber || this.isTerminal(interview))) {
      return this.replayPersistedResult(interview, targetIndex);
    }

    return this.recoverInterruptedSubmission(interview, targetIndex, { ...params, questionNumber });
  }

  private isTerminal(interview: IInterview): boolean {
    return interview.status === InterviewStatus.COMPLETED || interview.status === InterviewStatus.EVALUATED;
  }

  /**
   * Phase 11 — mirrors InterviewService's own private
   * `buildClosingPresentationPlanSafely` exactly (same English-only gate,
   * same non-critical try/catch discipline) so a retry-recovered completion
   * gets an indistinguishable closing plan from the happy path's.
   */
  private buildClosingPresentationPlanSafely(interview: IInterview): ConversationPresentationPlan | undefined {
    const language = interview.interviewLanguage || DEFAULT_LANGUAGE_CODE;
    if (language !== DEFAULT_LANGUAGE_CODE) return undefined;
    try {
      const policy = resolveInterviewModePolicy(interview);
      const personality = resolveInterviewPersonality(interview);
      const recentPhraseHistory = conversationHumanizerService.deriveRecentPhraseHistory(interview.questions);
      return conversationHumanizerService.buildClosingPresentationPlan({
        interviewMode: policy.humanizerMode,
        recentPhraseHistory,
        personality,
        interviewerNeutrality: policy.interviewerNeutrality,
      });
    } catch (humanizerError) {
      console.error('[InterviewAnswerRecovery] Closing presentation plan failed (non-critical):', humanizerError);
      return undefined;
    }
  }

  private async replayPersistedResult(interview: IInterview, targetIndex: number): Promise<SubmitAnswerResult> {
    const isCompleted = this.isTerminal(interview);
    let nextQuestion: QuestionResponse | undefined;
    let presentation: ConversationPresentationPlan | undefined;

    if (!isCompleted) {
      const nextIndex = interview.currentQuestion - 1;
      const next = interview.questions[nextIndex];
      if (next && !next.answerText) {
        nextQuestion = this.toQuestionResponse(next);
        // Phase 8 — the persisted next question already carries its own
        // presentation plan (set when it was generated); a replay simply
        // returns it unchanged, never recomputes it.
        presentation = next.presentation;
      }
    } else {
      // Phase 11 — a genuine retry after the ORIGINAL completing response
      // was lost still needs the closing sign-off (this is not a plain
      // page refresh — the frontend only reaches this path by retrying an
      // in-flight/failed submit, and Phase 10's own client-side
      // `closingSpoken` generation guard is what prevents any replay from
      // re-triggering navigation/narration more than once).
      presentation = this.buildClosingPresentationPlanSafely(interview);
    }

    return {
      interview,
      evaluation: interview.questions[targetIndex].evaluation as DynamicEvaluationResponse,
      nextQuestion,
      isCompleted,
      presentation,
    };
  }

  private async recoverInterruptedSubmission(
    interview: IInterview,
    targetIndex: number,
    params: SubmitAnswerParams & { questionNumber: number }
  ): Promise<SubmitAnswerResult> {
    let evaluation = interview.questions[targetIndex].evaluation as DynamicEvaluationResponse | undefined;

    if (!evaluation) {
      await this.acquireRecoveryClaim(interview._id.toString(), targetIndex);
      try {
        // Re-read after the claim: another normal request may have finished
        // evaluation just before this recovery acquired its claim.
        const fresh = await Interview.findById(interview._id);
        if (!fresh) throw new ApiError(404, 'Interview not found');
        const freshQuestion = fresh.questions[targetIndex];
        evaluation = freshQuestion?.evaluation as DynamicEvaluationResponse | undefined;

        if (!evaluation) {
          evaluation = await this.evaluatePersistedAnswer(fresh, targetIndex);
          await Interview.updateOne(
            { _id: fresh._id, [`questions.${targetIndex}.evaluation`]: { $exists: false } },
            { $set: { [`questions.${targetIndex}.evaluation`]: evaluation as IEvaluation } }
          );
          // Phase 6 (6D) — this recovery path never ran STAR analysis/
          // model-answer generation even before Phase 6 (a pre-existing
          // gap: recovery only ever recomputed evaluation + the fast
          // signal). Now that the durable job infrastructure exists, close
          // that gap too: enqueue the SAME deferred-enrichment job the
          // normal path uses, AFTER the evaluation above is durably
          // persisted. Best-effort — never blocks/fails recovery.
          await this.enqueueDeferredEnrichment(fresh._id.toString(), targetIndex);
        }

        // Phase 2: compute + persist the fast answer signal here too — the
        // ONE other place (besides InterviewService.submitAnswer) that
        // recovers/persists an evaluation. Idempotent: never overwrite an
        // existing complete signal (e.g. a concurrent normal submission
        // already computed one while this recovery was in flight).
        if (!hasCompleteAnswerSignal(freshQuestion)) {
          const evaluationForSignal = evaluation as DynamicEvaluationResponse;
          try {
            const claimsThisQuestion = (fresh.claimVerification?.claims || []).filter(
              (c) => c.questionNumber === targetIndex + 1
            );
            const contradictionsThisQuestion = (fresh.contradictionTracking?.contradictions || []).filter(
              (c) => c.questionNumber2 === targetIndex + 1
            );
            const signal = answerSignalService.buildFastSignal({
              question: freshQuestion?.questionText || '',
              answer: freshQuestion?.answerText || '',
              expectedPoints: freshQuestion?.expectedPoints,
              targetCompetency: freshQuestion?.competencyName,
              evaluation: evaluationForSignal,
              claimsThisQuestion,
              contradictionsThisQuestion,
              durationSeconds: freshQuestion?.duration,
            });
            await Interview.updateOne(
              { _id: fresh._id, [`questions.${targetIndex}.answerSignal`]: { $exists: false } },
              { $set: { [`questions.${targetIndex}.answerSignal`]: signal as IAnswerSignal } }
            );
          } catch (signalError) {
            console.error('[InterviewAnswerRecovery] Fast answer-signal derivation failed (non-critical):', signalError);
            try {
              await Interview.updateOne(
                { _id: fresh._id, [`questions.${targetIndex}.answerSignal`]: { $exists: false } },
                { $set: { [`questions.${targetIndex}.answerSignal`]: buildFallbackAnswerSignal() as IAnswerSignal } }
              );
            } catch {
              // Never let a signal-persistence failure block recovery.
            }
          }
        }

        await InterviewAnswerRecoveryClaim.updateOne(
          { interviewId: fresh._id, questionIndex: targetIndex },
          { $set: { status: 'completed', completedAt: new Date(), failureMessage: undefined } }
        );
      } catch (error) {
        await InterviewAnswerRecoveryClaim.updateOne(
          { interviewId: interview._id, questionIndex: targetIndex },
          {
            $set: {
              status: 'failed',
              failureMessage: error instanceof Error ? error.message.slice(0, 500) : 'Answer recovery failed',
            },
          }
        ).catch(() => undefined);
        throw error;
      }
    }

    let freshInterview = await Interview.findById(interview._id);
    if (!freshInterview) throw new ApiError(404, 'Interview not found');

    // Another request may have completed progression while recovery was
    // evaluating. Replaying here avoids generating a duplicate next question.
    if (freshInterview.currentQuestion > params.questionNumber || this.isTerminal(freshInterview)) {
      return this.replayPersistedResult(freshInterview, targetIndex);
    }

    const answeredCount = freshInterview.questions.filter((q) => !!q.answerText).length;
    if (answeredCount >= freshInterview.totalQuestions) {
      await Interview.updateOne(
        { _id: freshInterview._id, status: InterviewStatus.IN_PROGRESS },
        // Phase 11 — same terminal `interviewPhase` write InterviewService.
        // submitAnswer's own completing branch makes, in the SAME update.
        { $set: { status: InterviewStatus.COMPLETED, completedAt: new Date(), interviewPhase: InterviewPhase.COMPLETED } }
      );
      await this.syncInstituteAssignment(freshInterview);

      // getInterviewReport has its own idempotent COMPLETED->report recovery.
      // A report-provider failure must not turn a successfully recovered
      // answer into another failed answer submission.
      try {
        await this.core.getInterviewReport(freshInterview._id.toString(), params.userId);
      } catch (reportError) {
        console.error('[InterviewAnswerRecovery] Final report recovery deferred:', reportError);
      }

      freshInterview = (await Interview.findById(freshInterview._id)) || freshInterview;
      return {
        interview: freshInterview,
        evaluation: (freshInterview.questions[targetIndex].evaluation || evaluation) as DynamicEvaluationResponse,
        isCompleted: true,
        // Phase 11 — same closing sign-off the happy path attaches on its
        // own completing response.
        presentation: this.buildClosingPresentationPlanSafely(freshInterview),
      };
    }

    // If a next question was already saved before the first request failed,
    // repair only the pointer; never call AI again.
    const existingNext = freshInterview.questions[params.questionNumber];
    if (existingNext && !existingNext.answerText) {
      await Interview.updateOne(
        { _id: freshInterview._id, currentQuestion: params.questionNumber },
        { $set: { currentQuestion: params.questionNumber + 1 } }
      );
      freshInterview = (await Interview.findById(freshInterview._id)) || freshInterview;
      return {
        interview: freshInterview,
        evaluation: (freshInterview.questions[targetIndex].evaluation || evaluation) as DynamicEvaluationResponse,
        nextQuestion: this.toQuestionResponse(existingNext),
        isCompleted: false,
        // Phase 8 — the already-saved question carries its own persisted
        // presentation plan (set when it was originally generated); never
        // recomputed on repair.
        presentation: existingNext.presentation,
      };
    }

    if (freshInterview.interviewMode === 'uploaded') {
      const firstUnansweredIndex = freshInterview.questions.findIndex((q) => !q.answerText);
      if (firstUnansweredIndex < 0) {
        throw new ApiError(409, 'No unanswered question is available. Reload the interview.', undefined, 'INTERVIEW_RECOVERY_REQUIRED');
      }
      await Interview.updateOne(
        { _id: freshInterview._id },
        // Phase 11 — same fixed CORE phase InterviewService.submitAnswer's
        // own uploaded-mode branch sets on every advance.
        { $set: { currentQuestion: firstUnansweredIndex + 1, interviewPhase: InterviewPhase.CORE } }
      );
      freshInterview = (await Interview.findById(freshInterview._id)) || freshInterview;
      return {
        interview: freshInterview,
        evaluation: (freshInterview.questions[targetIndex].evaluation || evaluation) as DynamicEvaluationResponse,
        nextQuestion: this.toQuestionResponse(freshInterview.questions[firstUnansweredIndex]),
        isCompleted: false,
        // Phase 8 — uploaded-mode questions are pre-populated at creation
        // time with no presentation plan attached ahead of time (only
        // InterviewService.submitAnswer's normal uploaded-mode path builds
        // one, at the moment a question is actually shown); a recovered
        // pointer-repair here degrades safely to undefined, same as any
        // other absent-presentation case.
        presentation: freshInterview.questions[firstUnansweredIndex].presentation,
      };
    }

    const { question: nextQuestion, tagging: recoveryTagging, interviewPhase: recoveredPhase } = await this.generateRecoveryQuestion(freshInterview);
    await Interview.updateOne(
      {
        _id: freshInterview._id,
        currentQuestion: params.questionNumber,
        [`questions.${targetIndex}.answerText`]: { $exists: true },
      },
      {
        $push: {
          questions: {
            questionText: nextQuestion.question,
            questionType: nextQuestion.questionType,
            expectedPoints: nextQuestion.expectedPoints || [],
            ...recoveryTagging,
          },
        },
        // Phase 11 — same single-write-site pairing InterviewService.
        // submitAnswer uses (interviewPhase persisted alongside
        // currentQuestion/the new question, never a second write).
        $set: { currentQuestion: params.questionNumber + 1, interviewPhase: recoveredPhase },
      }
    );

    freshInterview = (await Interview.findById(freshInterview._id)) || freshInterview;
    return {
      interview: freshInterview,
      evaluation: (freshInterview.questions[targetIndex].evaluation || evaluation) as DynamicEvaluationResponse,
      nextQuestion,
      isCompleted: false,
      // Phase 8 — the freshly-pushed question's own persisted presentation
      // (set by generateRecoveryQuestion below via the SAME
      // buildPresentationPlanSafely-equivalent path InterviewService.
      // submitAnswer uses), never recomputed a second time here.
      presentation: recoveryTagging.presentation,
    };
  }

  private async evaluatePersistedAnswer(interview: IInterview, questionIndex: number): Promise<DynamicEvaluationResponse> {
    const question = interview.questions[questionIndex];
    if (!question?.answerText) throw new ApiError(409, 'Saved answer is unavailable for recovery');

    const experienceLevel = interview.experienceLevel || mapExperienceYearsToLevel(interview.experienceYears);
    const interviewStyle = interview.interviewStyle || inferInterviewStyle(interview.topic);
    const sessionConfig = {
      topic: interview.topic as InterviewTopic,
      difficulty: interview.difficulty as DifficultyLevel,
      experienceLevel: experienceLevel as ExperienceLevel,
      interviewStyle: interviewStyle as InterviewStyle,
      totalQuestions: interview.totalQuestions,
    };

    const result = await this.aiService.evaluateAnswer(
      {
        sessionConfig,
        question: question.questionText,
        answer: question.answerText,
        expectedPoints: question.expectedPoints,
        referenceAnswer: validReferenceAnswer(question.referenceAnswer) ? question.referenceAnswer : undefined,
        interviewId: interview._id.toString(),
        questionIndex,
        interviewLanguage: interview.interviewLanguage,
      },
      {
        interviewId: interview._id.toString(),
        operation: 'answer-evaluation-recovery',
        questionIndex,
        language: interview.interviewLanguage,
      }
    );

    return result.data;
  }

  /**
   * Regenerates the next question exactly like the normal
   * InterviewService.submitAnswer next-question path does — same
   * NextQuestionDecisionEngine call, same generateQuestionForMove glue, same
   * tagging shape — so a retry-recovered question is indistinguishable from
   * one generated on the "happy path" (see the shared tagging test in this
   * file's own test suite).
   */
  private async generateRecoveryQuestion(
    interview: IInterview
  ): Promise<{ question: QuestionResponse; tagging: QuestionTaggingFromMove & { presentation?: ConversationPresentationPlan }; interviewPhase: InterviewPhase }> {
    const experienceLevel = interview.experienceLevel || mapExperienceYearsToLevel(interview.experienceYears);
    const interviewStyle = interview.interviewStyle || inferInterviewStyle(interview.topic);
    const sessionConfig = {
      topic: interview.topic as InterviewTopic,
      difficulty: interview.difficulty as DifficultyLevel,
      experienceLevel: experienceLevel as ExperienceLevel,
      interviewStyle: interviewStyle as InterviewStyle,
      totalQuestions: interview.totalQuestions,
    };

    let blueprintForDecision: Awaited<ReturnType<typeof blueprintService.getBlueprintById>> | null = null;
    if (interview.blueprintId) {
      try {
        blueprintForDecision = await blueprintService.getBlueprintById(interview.blueprintId.toString());
      } catch (blueprintLookupError) {
        console.error('[InterviewAnswerRecovery] Blueprint lookup for next-question decision failed (non-critical):', blueprintLookupError);
      }
    }

    const justAnsweredQuestion = interview.questions[interview.currentQuestion - 1];
    const priorityCompetency = interview.competencyCoverage
      ? coverageTrackerService.getNextCompetencyToPrioritize(interview.competencyCoverage)
      : undefined;

    const nextMove = nextQuestionDecisionEngine.decideNextMove({
      currentQuestionNumber: interview.currentQuestion,
      totalQuestions: interview.totalQuestions,
      competencyCoverage: interview.competencyCoverage,
      blueprintCompetencies: blueprintForDecision?.competencies,
      answerSignal: justAnsweredQuestion?.answerSignal,
      currentQuestionCompetency: justAnsweredQuestion?.competencyName,
      claims: interview.claimVerification?.claims || [],
      contradictions: interview.contradictionTracking?.contradictions || [],
      // Phase 5 (5A) — same wiring as InterviewService.submitAnswer's
      // next-question block, via the SAME decideNextMove/shared functions —
      // never a duplicated decision path.
      interviewMemory: interview.interviewMemory,
      difficultyTracking: interview.difficultyTracking,
      questionHistory: interview.questions,
      interviewMode: interview.interviewMode,
    });

    const { response, finalMove } = await generateQuestionForMove(
      this.aiService,
      {
        sessionConfig,
        previousQuestions: interview.questions.map((q) => q.questionText),
        priorityCompetency,
        interviewId: interview._id.toString(),
        interviewLanguage: interview.interviewLanguage,
      },
      nextMove,
      {
        interviewId: interview._id.toString(),
        operation: 'question-generation-recovery',
        language: interview.interviewLanguage,
      }
    );

    if (!response?.question || response.question.trim().length < 10) {
      throw new ApiError(503, 'The next question could not be generated. Please retry.', undefined, 'AI_PROVIDER_UNAVAILABLE');
    }

    const tagging: QuestionTaggingFromMove & { presentation?: ConversationPresentationPlan } = buildQuestionTaggingFromMove(finalMove, {
      difficultyAtGeneration: interview.difficultyTracking ? mapLevelToDifficulty(interview.difficultyTracking.currentLevel) : interview.difficulty,
    });

    // Phase 8 — built from the SAME finalMove/answerSignal/interview
    // context already in scope here, mirroring InterviewService.
    // submitAnswer's normal-path integration exactly (same non-critical
    // try/catch discipline, same English-only language gate, same
    // repetition-history derivation) so a retry-recovered question's
    // presentation plan is indistinguishable from one generated on the
    // happy path.
    const language = interview.interviewLanguage || DEFAULT_LANGUAGE_CODE;
    if (language === DEFAULT_LANGUAGE_CODE) {
      try {
        const policy = resolveInterviewModePolicy(interview);
        const personality = resolveInterviewPersonality(interview);
        const recentPhraseHistory = conversationHumanizerService.deriveRecentPhraseHistory(interview.questions);
        tagging.presentation = conversationHumanizerService.buildPresentationPlan({
          move: finalMove,
          question: { text: response.question },
          answerSignal: justAnsweredQuestion?.answerSignal,
          interviewMode: policy.humanizerMode,
          recentPhraseHistory,
          personality,
          interviewerNeutrality: policy.interviewerNeutrality,
        });
      } catch (humanizerError) {
        console.error('[InterviewAnswerRecovery] Conversation humanizer failed (non-critical):', humanizerError);
      }
    }

    // Close the loop on the specific claim/contradiction just probed (same
    // idempotency markers InterviewService.submitAnswer uses on the normal
    // path) — best-effort, never blocks recovery.
    try {
      if (interview.claimVerification) {
        const matchedClaim = findClaimForMove(interview.claimVerification.claims, finalMove);
        const claimIndex = matchedClaim ? interview.claimVerification.claims.indexOf(matchedClaim) : -1;
        if (claimIndex >= 0) {
          await Interview.updateOne(
            { _id: interview._id },
            {
              $set: {
                [`claimVerification.claims.${claimIndex}.followUpAsked`]: true,
                [`claimVerification.claims.${claimIndex}.followUpQuestionNumber`]: interview.currentQuestion + 1,
              },
            }
          );
        }
      }
      if (interview.contradictionTracking) {
        const contradictionIndex = findContradictionIndexForMove(interview.contradictionTracking.contradictions, finalMove);
        if (contradictionIndex >= 0) {
          await Interview.updateOne(
            { _id: interview._id },
            {
              $set: {
                [`contradictionTracking.contradictions.${contradictionIndex}.clarificationAsked`]: true,
                [`contradictionTracking.contradictions.${contradictionIndex}.clarificationQuestionNumber`]: interview.currentQuestion + 1,
              },
            }
          );
        }
      }
      // Phase 5 (5A) — same idempotency-marker pattern as claims/
      // contradictions above, via the SAME findMemoryItemForMove helper
      // InterviewService.submitAnswer uses on the normal path.
      if (interview.interviewMemory) {
        const matchedItem = findMemoryItemForMove(interview.interviewMemory, finalMove);
        const itemIndex = matchedItem ? interview.interviewMemory.allItems.indexOf(matchedItem) : -1;
        if (itemIndex >= 0) {
          await Interview.updateOne(
            { _id: interview._id },
            {
              $set: {
                [`interviewMemory.allItems.${itemIndex}.callbackUsedCount`]: (matchedItem!.callbackUsedCount || 0) + 1,
                [`interviewMemory.allItems.${itemIndex}.lastCallbackAt`]: new Date(),
              },
            }
          );
        }
      }
    } catch (markError) {
      console.error('[InterviewAnswerRecovery] Failed to mark claim/contradiction/memory follow-up as asked (non-critical):', markError);
    }

    // Phase 11 — same derivation InterviewService.submitAnswer's normal
    // path uses, from the SAME finalMove/answerSignal already computed
    // above.
    const interviewPhase = deriveInterviewPhase(interview.interviewPhase, finalMove, justAnsweredQuestion?.answerSignal);

    return { question: response, tagging, interviewPhase };
  }

  private toQuestionResponse(question: any): QuestionResponse {
    return {
      question: question.questionText,
      questionType: question.questionType,
      expectedPoints: question.expectedPoints || [],
      followUpTopics: [],
    };
  }

  private async acquireRecoveryClaim(
    interviewId: string,
    questionIndex: number,
    staleMs: number = RECOVERY_CLAIM_STALE_MS
  ): Promise<void> {
    try {
      await InterviewAnswerRecoveryClaim.create({
        interviewId: new Types.ObjectId(interviewId),
        questionIndex,
        status: 'processing',
        claimedAt: new Date(),
      });
      return;
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
    }

    const staleBefore = new Date(Date.now() - staleMs);
    const claim = await InterviewAnswerRecoveryClaim.findOneAndUpdate(
      {
        interviewId: new Types.ObjectId(interviewId),
        questionIndex,
        $or: [
          { status: { $in: ['failed', 'completed'] } },
          { status: 'processing', claimedAt: { $lte: staleBefore } },
        ],
      },
      {
        $set: {
          status: 'processing',
          claimedAt: new Date(),
          completedAt: undefined,
          failureMessage: undefined,
        },
      },
      { new: true }
    );

    if (!claim) {
      throw new ApiError(
        409,
        'Your answer is already being processed. Please wait a moment and retry.',
        undefined,
        'ANSWER_PROCESSING_IN_PROGRESS'
      );
    }
  }

  /**
   * Phase 6 (6D) — best-effort enqueue of the same
   * OperationalJobType.INTERVIEW_DEFERRED_ENRICHMENT job
   * InterviewService.submitAnswer's normal path uses, keyed identically
   * (`deferred-enrichment:<interviewId>:<questionIndex>`) so a duplicate
   * enqueue from both paths for the same question is always a safe no-op.
   * Lazy import mirrors OperationalJobService's own cross-service pattern,
   * avoiding a hard circular dependency at module-load time.
   */
  private async enqueueDeferredEnrichment(interviewId: string, questionIndex: number): Promise<void> {
    try {
      const { operationalJobService } = await import('./OperationalJobService');
      const { OperationalJobType } = await import('../constants/operationalJob');
      await operationalJobService.enqueue({
        jobType: OperationalJobType.INTERVIEW_DEFERRED_ENRICHMENT,
        payload: { interviewId, questionIndex },
        idempotencyKey: `deferred-enrichment:${interviewId}:${questionIndex}`,
      });
    } catch (enqueueError) {
      console.error('[InterviewAnswerRecovery] Failed to enqueue deferred enrichment job (non-critical):', enqueueError);
    }
  }

  private async syncInstituteAssignment(interview: IInterview): Promise<void> {
    if (!interview.organizationId) return;
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
      console.error('[InterviewAnswerRecovery] Assignment completion sync deferred:', error);
    }
  }
}

export default InterviewAnswerOrchestratorService;
