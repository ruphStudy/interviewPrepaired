import InterviewModel from '../models/interview.model';
import {
  Interview,
  Question,
  Answer,
  Evaluation,
  InterviewReport,
} from '../types';

export class DatabaseService {
  // Interview Operations
  async createInterview(interview: Omit<Interview, 'id' | 'createdAt' | 'status'>): Promise<Interview> {
    try {
      const newInterview = new InterviewModel({
        topic: interview.topic,
        difficulty: interview.difficulty,
        experienceYears: interview.experience,
        totalQuestions: interview.numberOfQuestions,
        status: 'created',
        questions: [],
      });

      const saved = await newInterview.save();
      
      return {
        id: saved._id.toString(),
        topic: saved.topic,
        difficulty: saved.difficulty,
        experience: saved.experienceYears,
        numberOfQuestions: saved.totalQuestions,
        jobDescription: interview.jobDescription,
        createdAt: saved.createdAt.toISOString(),
        status: saved.status,
      };
    } catch (error) {
      throw new Error(`Failed to create interview: ${error}`);
    }
  }

  async getInterview(id: string): Promise<Interview | null> {
    try {
      const interview = await InterviewModel.findById(id);
      if (!interview) return null;

      return {
        id: interview._id.toString(),
        topic: interview.topic,
        difficulty: interview.difficulty,
        experience: interview.experienceYears,
        numberOfQuestions: interview.totalQuestions,
        createdAt: interview.createdAt.toISOString(),
        status: interview.status,
      };
    } catch (error) {
      throw new Error(`Failed to get interview: ${error}`);
    }
  }

  async updateInterviewStatus(id: string, status: string, _completedAt?: string): Promise<void> {
    try {
      await InterviewModel.findByIdAndUpdate(id, { status });
    } catch (error) {
      throw new Error(`Failed to update interview status: ${error}`);
    }
  }

  async getAllInterviews(): Promise<Interview[]> {
    try {
      const interviews = await InterviewModel.find().sort({ createdAt: -1 });
      
      return interviews.map(interview => ({
        id: interview._id.toString(),
        topic: interview.topic,
        difficulty: interview.difficulty,
        experience: interview.experienceYears,
        numberOfQuestions: interview.totalQuestions,
        createdAt: interview.createdAt.toISOString(),
        status: interview.status,
      }));
    } catch (error) {
      throw new Error(`Failed to get all interviews: ${error}`);
    }
  }

  async deleteInterview(id: string): Promise<void> {
    try {
      await InterviewModel.findByIdAndDelete(id);
    } catch (error) {
      throw new Error(`Failed to delete interview: ${error}`);
    }
  }

  // Question Operations
  async createQuestion(question: Omit<Question, 'id' | 'createdAt'>): Promise<Question> {
    try {
      const interview = await InterviewModel.findById(question.interviewId);
      if (!interview) {
        throw new Error('Interview not found');
      }

      await interview.addQuestion(question.questionText);
      
      return {
        id: interview.questions[interview.questions.length - 1]._id?.toString() || '',
        interviewId: question.interviewId,
        questionText: question.questionText,
        questionNumber: question.questionNumber,
        isFollowUp: question.isFollowUp,
        parentQuestionId: question.parentQuestionId,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(`Failed to create question: ${error}`);
    }
  }

  async getQuestion(id: string): Promise<Question | null> {
    try {
      // Find interview containing this question
      const interview = await InterviewModel.findOne({ 'questions._id': id });
      if (!interview) return null;

      const question = interview.questions.find(q => q._id?.toString() === id);
      if (!question) return null;

      return {
        id: question._id?.toString() || '',
        interviewId: interview._id.toString(),
        questionText: question.questionText,
        questionNumber: interview.questions.indexOf(question) + 1,
        isFollowUp: false,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(`Failed to get question: ${error}`);
    }
  }

  async getQuestionsByInterviewId(interviewId: string): Promise<Question[]> {
    try {
      const interview = await InterviewModel.findById(interviewId);
      if (!interview) return [];

      return interview.questions.map((q, index) => ({
        id: q._id?.toString() || '',
        interviewId: interviewId,
        questionText: q.questionText,
        questionNumber: index + 1,
        isFollowUp: false,
        createdAt: new Date().toISOString(),
      }));
    } catch (error) {
      throw new Error(`Failed to get questions: ${error}`);
    }
  }

  // Answer Operations
  async createAnswer(answer: Omit<Answer, 'id' | 'createdAt'>): Promise<Answer> {
    try {
      const interview = await InterviewModel.findOne({ 'questions._id': answer.questionId });
      if (!interview) {
        throw new Error('Question not found');
      }

      const questionIndex = interview.questions.findIndex(q => q._id?.toString() === answer.questionId);
      if (questionIndex === -1) {
        throw new Error('Question not found in interview');
      }

      await interview.submitAnswer(questionIndex, answer.answerText);

      return {
        id: answer.questionId,
        questionId: answer.questionId,
        answerText: answer.answerText,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(`Failed to create answer: ${error}`);
    }
  }

  async getAnswerByQuestionId(questionId: string): Promise<Answer | null> {
    try {
      const interview = await InterviewModel.findOne({ 'questions._id': questionId });
      if (!interview) return null;

      const question = interview.questions.find(q => q._id?.toString() === questionId);
      if (!question || !question.answerText) return null;

      return {
        id: questionId,
        questionId: questionId,
        answerText: question.answerText,
        createdAt: question.answeredAt?.toISOString() || new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(`Failed to get answer: ${error}`);
    }
  }

  // Evaluation Operations
  async createEvaluation(evaluation: Omit<Evaluation, 'id' | 'createdAt'>): Promise<Evaluation> {
    try {
      const interview = await InterviewModel.findOne({ 'questions._id': evaluation.answerId });
      if (!interview) {
        throw new Error('Question not found');
      }

      const questionIndex = interview.questions.findIndex(q => q._id?.toString() === evaluation.answerId);
      if (questionIndex === -1) {
        throw new Error('Question not found in interview');
      }

      await interview.evaluateQuestion(questionIndex, {
        technicalScore: evaluation.technical,
        communicationScore: evaluation.communication,
        leadershipScore: evaluation.leadership,
        problemSolvingScore: evaluation.problemSolving,
        confidenceScore: evaluation.confidence,
        overallScore: (evaluation.technical + evaluation.communication + evaluation.leadership + evaluation.problemSolving + evaluation.confidence) / 5,
        strengths: evaluation.strengths,
        weaknesses: evaluation.weaknesses,
        suggestions: evaluation.improvements,
      });

      return {
        id: evaluation.answerId,
        answerId: evaluation.answerId,
        technical: evaluation.technical,
        communication: evaluation.communication,
        leadership: evaluation.leadership,
        problemSolving: evaluation.problemSolving,
        confidence: evaluation.confidence,
        strengths: evaluation.strengths,
        weaknesses: evaluation.weaknesses,
        missingPoints: evaluation.missingPoints,
        improvements: evaluation.improvements,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(`Failed to create evaluation: ${error}`);
    }
  }

  async getEvaluationByAnswerId(answerId: string): Promise<Evaluation | null> {
    try {
      const interview = await InterviewModel.findOne({ 'questions._id': answerId });
      if (!interview) return null;

      const question = interview.questions.find(q => q._id?.toString() === answerId);
      if (!question || !question.evaluation) return null;

      const eval = question.evaluation;
      return {
        id: answerId,
        answerId: answerId,
        technical: eval.technicalScore,
        communication: eval.communicationScore,
        leadership: eval.leadershipScore,
        problemSolving: eval.problemSolvingScore,
        confidence: eval.confidenceScore,
        strengths: eval.strengths,
        weaknesses: eval.weaknesses,
        missingPoints: [],
        improvements: eval.suggestions,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(`Failed to get evaluation: ${error}`);
    }
  }

  // Complex Queries
  async getInterviewReport(interviewId: string): Promise<InterviewReport | null> {
    try {
      const interview = await InterviewModel.findById(interviewId);
      if (!interview) return null;

      const questions = interview.questions.map((q, index) => ({
        id: q._id?.toString() || '',
        interviewId: interviewId,
        questionText: q.questionText,
        questionNumber: index + 1,
        isFollowUp: false,
        createdAt: new Date().toISOString(),
        answer: q.answerText ? {
          id: q._id?.toString() || '',
          questionId: q._id?.toString() || '',
          answerText: q.answerText,
          createdAt: q.answeredAt?.toISOString() || new Date().toISOString(),
        } : null,
        evaluation: q.evaluation ? {
          id: q._id?.toString() || '',
          answerId: q._id?.toString() || '',
          technical: q.evaluation.technicalScore,
          communication: q.evaluation.communicationScore,
          leadership: q.evaluation.leadershipScore,
          problemSolving: q.evaluation.problemSolvingScore,
          confidence: q.evaluation.confidenceScore,
          strengths: q.evaluation.strengths,
          weaknesses: q.evaluation.weaknesses,
          missingPoints: [],
          improvements: q.evaluation.suggestions,
          createdAt: new Date().toISOString(),
        } : null,
      }));

      // Calculate average scores
      const evaluations = questions
        .map(q => q.evaluation)
        .filter(e => e !== null) as Evaluation[];

      const averageScores = {
        technical: 0,
        communication: 0,
        leadership: 0,
        problemSolving: 0,
        confidence: 0,
        overall: 0,
      };

      if (evaluations.length > 0) {
        averageScores.technical = evaluations.reduce((sum, e) => sum + e.technical, 0) / evaluations.length;
        averageScores.communication = evaluations.reduce((sum, e) => sum + e.communication, 0) / evaluations.length;
        averageScores.leadership = evaluations.reduce((sum, e) => sum + e.leadership, 0) / evaluations.length;
        averageScores.problemSolving = evaluations.reduce((sum, e) => sum + e.problemSolving, 0) / evaluations.length;
        averageScores.confidence = evaluations.reduce((sum, e) => sum + e.confidence, 0) / evaluations.length;
        
        averageScores.overall = (
          averageScores.technical +
          averageScores.communication +
          averageScores.leadership +
          averageScores.problemSolving +
          averageScores.confidence
        ) / 5;
      }

      // Aggregate feedback
      const allStrengths = new Set<string>();
      const allWeaknesses = new Set<string>();
      const allImprovements = new Set<string>();

      evaluations.forEach(e => {
        e.strengths.forEach(s => allStrengths.add(s));
        e.weaknesses.forEach(w => allWeaknesses.add(w));
        e.improvements.forEach(i => allImprovements.add(i));
      });

      return {
        interview: {
          id: interview._id.toString(),
          topic: interview.topic,
          difficulty: interview.difficulty,
          experience: interview.experienceYears,
          numberOfQuestions: interview.totalQuestions,
          createdAt: interview.createdAt.toISOString(),
          status: interview.status,
        },
        questions,
        averageScores,
        summary: {
          strengths: Array.from(allStrengths),
          weaknesses: Array.from(allWeaknesses),
          improvements: Array.from(allImprovements),
        },
      };
    } catch (error) {
      console.error('Error generating report:', error);
      throw error;
    }
  }
}

export const databaseService = new DatabaseService();
