/**
 * @deprecated This file is no longer in use.
 * Active implementation: InterviewService.ts (capital I)
 * 
 * This file can be safely deleted after verifying no external imports.
 * The active interview service is located at:
 * backend/src/services/InterviewService.ts
 * 
 * Do not use this file for new development.
 */

import { Interview, IInterview, IQuestion, IEvaluation } from '../models/interview.model';
import { ApiError } from '../utils/ApiError';
import { OpenAIService } from './openai.service';

export class InterviewService {
  private openaiService: OpenAIService;

  constructor() {
    this.openaiService = new OpenAIService();
  }

  async createInterview(data: {
    userId: string;
    type: string;
    difficulty: string;
    topic: string;
    customInstructions?: string;
    metadata?: any;
  }): Promise<IInterview> {
    const interview = await Interview.create({
      userId: data.userId,
      type: data.type,
      difficulty: data.difficulty,
      topic: data.topic,
      customInstructions: data.customInstructions,
      status: 'created',
      totalDuration: 0,
      questions: [],
      metadata: data.metadata || {},
    });

    return interview;
  }

  async getInterviewById(id: string, userId: string): Promise<IInterview> {
    const interview = await Interview.findById(id);

    if (!interview) {
      throw new ApiError(404, 'Interview not found');
    }

    if (interview.userId !== userId) {
      throw new ApiError(403, 'Not authorized to access this interview');
    }

    return interview;
  }

  async getUserInterviews(
    userId: string,
    filters?: {
      type?: string;
      status?: string;
      difficulty?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<{ interviews: IInterview[]; total: number; page: number; pages: number }> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 10;
    const skip = (page - 1) * limit;

    const query: any = { userId };

    if (filters?.type) query.type = filters.type;
    if (filters?.status) query.status = filters.status;
    if (filters?.difficulty) query.difficulty = filters.difficulty;

    const [interviews, total] = await Promise.all([
      Interview.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Interview.countDocuments(query),
    ]);

    return {
      interviews,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  async startInterview(id: string, userId: string): Promise<IInterview> {
    const interview = await this.getInterviewById(id, userId);

    if (interview.status !== 'created' && interview.status !== 'paused') {
      throw new ApiError(400, 'Interview cannot be started from current status');
    }

    interview.status = 'in-progress';
    interview.startedAt = new Date();

    if (interview.questions.length === 0) {
      const question = await this.openaiService.generateQuestion({
        type: interview.type,
        difficulty: interview.difficulty,
        topic: interview.topic,
        customInstructions: interview.customInstructions,
        previousQuestions: [],
      });

      interview.questions.push({
        id: `q-${Date.now()}`,
        text: question.text,
        followUpQuestions: question.followUps,
        askedAt: new Date(),
      });
    }

    await interview.save();
    return interview;
  }

  async pauseInterview(id: string, userId: string): Promise<IInterview> {
    const interview = await this.getInterviewById(id, userId);

    if (interview.status !== 'in-progress') {
      throw new ApiError(400, 'Only in-progress interviews can be paused');
    }

    interview.status = 'paused';
    interview.pausedAt = new Date();

    if (interview.startedAt) {
      const duration = Date.now() - interview.startedAt.getTime();
      interview.totalDuration += Math.floor(duration / 1000);
    }

    await interview.save();
    return interview;
  }

  async resumeInterview(id: string, userId: string): Promise<IInterview> {
    const interview = await this.getInterviewById(id, userId);

    if (interview.status !== 'paused') {
      throw new ApiError(400, 'Only paused interviews can be resumed');
    }

    interview.status = 'in-progress';
    interview.resumedAt = new Date();
    interview.startedAt = new Date();

    await interview.save();
    return interview;
  }

  async submitAnswer(
    id: string,
    userId: string,
    data: {
      questionId: string;
      answer: string;
      transcriptionConfidence: number;
      duration: number;
      audioUrl?: string;
    }
  ): Promise<IInterview> {
    const interview = await this.getInterviewById(id, userId);

    const questionIndex = interview.questions.findIndex((q) => q.id === data.questionId);

    if (questionIndex === -1) {
      throw new ApiError(404, 'Question not found');
    }

    interview.questions[questionIndex].answer = {
      text: data.answer,
      transcriptionConfidence: data.transcriptionConfidence,
      audioUrl: data.audioUrl,
      duration: data.duration,
      answeredAt: new Date(),
    };

    await interview.save();
    return interview;
  }

  async generateNextQuestion(id: string, userId: string): Promise<IInterview> {
    const interview = await this.getInterviewById(id, userId);

    if (interview.status !== 'in-progress') {
      throw new ApiError(400, 'Interview must be in progress to generate questions');
    }

    const previousQuestions = interview.questions.map((q) => q.text);

    const question = await this.openaiService.generateQuestion({
      type: interview.type,
      difficulty: interview.difficulty,
      topic: interview.topic,
      customInstructions: interview.customInstructions,
      previousQuestions,
    });

    interview.questions.push({
      id: `q-${Date.now()}`,
      text: question.text,
      followUpQuestions: question.followUps,
      askedAt: new Date(),
    });

    await interview.save();
    return interview;
  }

  async completeInterview(id: string, userId: string): Promise<IInterview> {
    const interview = await this.getInterviewById(id, userId);

    if (interview.status !== 'in-progress') {
      throw new ApiError(400, 'Only in-progress interviews can be completed');
    }

    interview.status = 'completed';
    interview.completedAt = new Date();

    if (interview.startedAt) {
      const duration = Date.now() - interview.startedAt.getTime();
      interview.totalDuration += Math.floor(duration / 1000);
    }

    await interview.save();
    return interview;
  }

  async evaluateInterview(id: string, userId: string): Promise<IInterview> {
    const interview = await this.getInterviewById(id, userId);

    if (interview.status !== 'completed') {
      throw new ApiError(400, 'Only completed interviews can be evaluated');
    }

    const evaluation = await this.openaiService.evaluateInterview({
      type: interview.type,
      difficulty: interview.difficulty,
      topic: interview.topic,
      questions: interview.questions,
    });

    interview.evaluation = evaluation;
    interview.status = 'evaluated';

    await interview.save();
    return interview;
  }

  async deleteInterview(id: string, userId: string): Promise<void> {
    const interview = await this.getInterviewById(id, userId);
    await interview.deleteOne();
  }

  async getInterviewStats(userId: string): Promise<any> {
    const interviews = await Interview.find({ userId });

    const completedInterviews = interviews.filter(
      (i) => i.status === 'completed' || i.status === 'evaluated'
    );

    const evaluatedInterviews = interviews.filter((i) => i.evaluation);

    const averageScore =
      evaluatedInterviews.length > 0
        ? evaluatedInterviews.reduce(
            (sum, i) => sum + (i.evaluation?.overallScore || 0),
            0
          ) / evaluatedInterviews.length
        : 0;

    const typeBreakdown = interviews.reduce((acc: any, interview) => {
      acc[interview.type] = (acc[interview.type] || 0) + 1;
      return acc;
    }, {});

    const scoresByType = evaluatedInterviews.reduce((acc: any, interview) => {
      if (!acc[interview.type]) {
        acc[interview.type] = { total: 0, count: 0 };
      }
      acc[interview.type].total += interview.evaluation?.overallScore || 0;
      acc[interview.type].count += 1;
      return acc;
    }, {});

    Object.keys(scoresByType).forEach((type) => {
      scoresByType[type] = parseFloat(
        (scoresByType[type].total / scoresByType[type].count).toFixed(2)
      );
    });

    return {
      totalInterviews: interviews.length,
      completedInterviews: completedInterviews.length,
      evaluatedInterviews: evaluatedInterviews.length,
      averageScore: parseFloat(averageScore.toFixed(2)),
      typeBreakdown,
      averageScoreByType: scoresByType,
    };
  }
}
