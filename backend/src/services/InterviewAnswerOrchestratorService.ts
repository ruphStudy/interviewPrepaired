import { Types } from 'mongoose';
import Interview, { IEvaluation, IInterview } from '../models/interview.model';
import InterviewAnswerRecoveryClaim from '../models/InterviewAnswerRecoveryClaim.model';
import InstituteStudentInterviewAssignment from '../models/InstituteStudentInterviewAssignment.model';
import { InstituteStudentInterviewAssignmentStatus } from '../constants/instituteStudentInterviewAssignment';
import { InterviewStatus } from '../constants/interview';
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

const RECOVERY_CLAIM_STALE_MS = 2 * 60 * 1000;

interface SubmitAnswerParams {
  interviewId: string;
  userId: string;
  answer: string;
  duration: number;
  /** 1-based question number displayed to the client. New clients always send it; legacy clients may omit it. */
  questionNumber?: number;
}

interface SubmitAnswerResult {
  interview: IInterview;
  evaluation: DynamicEvaluationResponse;
  nextQuestion?: QuestionResponse;
  isCompleted: boolean;
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

    const interview = await Interview.findOne({
      _id: new Types.ObjectId(params.interviewId),
      userId: new Types.ObjectId(params.userId),
    });

    if (!interview) throw new ApiError(404, 'Interview not found');

    const targetIndex = params.questionNumber - 1;
    const target = interview.questions[targetIndex];
    if (!target) {
      throw new ApiError(409, 'This question is no longer the active interview question', undefined, 'INTERVIEW_QUESTION_STALE');
    }

    if (!target.answerText) {
      if (interview.currentQuestion !== params.questionNumber) {
        throw new ApiError(409, 'The interview has moved to a different question. Reload to continue.', undefined, 'INTERVIEW_QUESTION_STALE');
      }
      return this.core.submitAnswer(params);
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
    if (target.evaluation && (interview.currentQuestion > params.questionNumber || this.isTerminal(interview))) {
      return this.replayPersistedResult(interview, targetIndex);
    }

    return this.recoverInterruptedSubmission(interview, targetIndex, params);
  }

  private isTerminal(interview: IInterview): boolean {
    return interview.status === InterviewStatus.COMPLETED || interview.status === InterviewStatus.EVALUATED;
  }

  private async replayPersistedResult(interview: IInterview, targetIndex: number): Promise<SubmitAnswerResult> {
    const isCompleted = this.isTerminal(interview);
    let nextQuestion: QuestionResponse | undefined;

    if (!isCompleted) {
      const nextIndex = interview.currentQuestion - 1;
      const next = interview.questions[nextIndex];
      if (next && !next.answerText) {
        nextQuestion = this.toQuestionResponse(next);
      }
    }

    return {
      interview,
      evaluation: interview.questions[targetIndex].evaluation as DynamicEvaluationResponse,
      nextQuestion,
      isCompleted,
    };
  }

  private async recoverInterruptedSubmission(
    interview: IInterview,
    targetIndex: number,
    params: SubmitAnswerParams
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
        { $set: { status: InterviewStatus.COMPLETED, completedAt: new Date() } }
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
      };
    }

    if (freshInterview.interviewMode === 'uploaded') {
      const firstUnansweredIndex = freshInterview.questions.findIndex((q) => !q.answerText);
      if (firstUnansweredIndex < 0) {
        throw new ApiError(409, 'No unanswered question is available. Reload the interview.', undefined, 'INTERVIEW_RECOVERY_REQUIRED');
      }
      await Interview.updateOne(
        { _id: freshInterview._id },
        { $set: { currentQuestion: firstUnansweredIndex + 1 } }
      );
      freshInterview = (await Interview.findById(freshInterview._id)) || freshInterview;
      return {
        interview: freshInterview,
        evaluation: (freshInterview.questions[targetIndex].evaluation || evaluation) as DynamicEvaluationResponse,
        nextQuestion: this.toQuestionResponse(freshInterview.questions[firstUnansweredIndex]),
        isCompleted: false,
      };
    }

    const nextQuestion = await this.generateRecoveryQuestion(freshInterview);
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
          },
        },
        $set: { currentQuestion: params.questionNumber + 1 },
      }
    );

    freshInterview = (await Interview.findById(freshInterview._id)) || freshInterview;
    return {
      interview: freshInterview,
      evaluation: (freshInterview.questions[targetIndex].evaluation || evaluation) as DynamicEvaluationResponse,
      nextQuestion,
      isCompleted: false,
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

  private async generateRecoveryQuestion(interview: IInterview): Promise<QuestionResponse> {
    const experienceLevel = interview.experienceLevel || mapExperienceYearsToLevel(interview.experienceYears);
    const interviewStyle = interview.interviewStyle || inferInterviewStyle(interview.topic);
    const sessionConfig = {
      topic: interview.topic as InterviewTopic,
      difficulty: interview.difficulty as DifficultyLevel,
      experienceLevel: experienceLevel as ExperienceLevel,
      interviewStyle: interviewStyle as InterviewStyle,
      totalQuestions: interview.totalQuestions,
    };

    const result = await this.aiService.generateQuestion(
      {
        sessionConfig,
        previousQuestions: interview.questions.map((q) => q.questionText),
        interviewId: interview._id.toString(),
        interviewLanguage: interview.interviewLanguage,
      },
      {
        interviewId: interview._id.toString(),
        operation: 'question-generation-recovery',
        language: interview.interviewLanguage,
      }
    );

    if (!result.data?.question || result.data.question.trim().length < 10) {
      throw new ApiError(503, 'The next question could not be generated. Please retry.', undefined, 'AI_PROVIDER_UNAVAILABLE');
    }
    return result.data;
  }

  private toQuestionResponse(question: any): QuestionResponse {
    return {
      question: question.questionText,
      questionType: question.questionType,
      expectedPoints: question.expectedPoints || [],
      followUpTopics: [],
    };
  }

  private async acquireRecoveryClaim(interviewId: string, questionIndex: number): Promise<void> {
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

    const staleBefore = new Date(Date.now() - RECOVERY_CLAIM_STALE_MS);
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
