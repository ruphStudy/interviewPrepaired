import { Types } from 'mongoose';
import QuestionSet, { IQuestionSetQuestion } from '../models/QuestionSet.model';
import { normalizeUploadedQuestions, ParsedQuestion } from './QuestionFileParserService';
import { MAX_UPLOADED_QUESTIONS } from '../constants/interview';
import { ApiError } from '../utils/ApiError';
import { buildTenantOwnerFilter } from '../utils/tenantScope';

interface CreateQuestionSetParams {
  userId: string;
  name: string;
  description?: string;
  questions: ParsedQuestion[];
  source?: 'manual' | 'uploaded';
}

interface UpdateQuestionSetParams {
  userId: string;
  questionSetId: string;
  name?: string;
  description?: string;
  questions?: ParsedQuestion[];
}

interface ListQuestionSetsParams {
  userId: string;
  page: number;
  limit: number;
}

interface QuestionSetSummary {
  totalQuestions: number;
  questionsWithAnswers: number;
  questionsWithoutAnswers: number;
}

function summarize(questions: IQuestionSetQuestion[]): QuestionSetSummary {
  const questionsWithAnswers = questions.filter((q) => !!q.referenceAnswer).length;
  return {
    totalQuestions: questions.length,
    questionsWithAnswers,
    questionsWithoutAnswers: questions.length - questionsWithAnswers,
  };
}

/** Shared trust boundary for both create and update — same normalization used by the uploaded-file parser (5B), so a saved set and a parsed file agree on the same contract. */
function normalizeAndValidateQuestions(questions: ParsedQuestion[]): IQuestionSetQuestion[] {
  const normalized = normalizeUploadedQuestions(questions);
  if (normalized.length === 0) {
    throw new ApiError(400, 'No valid questions found');
  }
  if (normalized.length > MAX_UPLOADED_QUESTIONS) {
    throw new ApiError(400, `Question set must contain at most ${MAX_UPLOADED_QUESTIONS} questions`);
  }
  return normalized;
}

export class QuestionSetService {
  async createQuestionSet(params: CreateQuestionSetParams) {
    const questions = normalizeAndValidateQuestions(params.questions);

    const questionSet = new QuestionSet({
      userId: new Types.ObjectId(params.userId),
      name: params.name.trim(),
      description: params.description?.trim() || undefined,
      questions,
      source: params.source || 'manual',
    });

    await questionSet.save();
    return this.toDetail(questionSet.toObject());
  }

  async getQuestionSets(params: ListQuestionSetsParams): Promise<{
    questionSets: Array<{
      id: string;
      name: string;
      description?: string;
      source: 'manual' | 'uploaded';
      totalQuestions: number;
      questionsWithAnswers: number;
      createdAt: Date;
      updatedAt: Date;
    }>;
    pagination: { page: number; limit: number; total: number; pages: number };
  }> {
    const { userId, page, limit } = params;
    // Personal scope only — explicit, so this can never start returning
    // organization-scoped sets for the same user once those exist.
    const filter = buildTenantOwnerFilter({ userId });
    const skip = (page - 1) * limit;

    const [sets, total] = await Promise.all([
      QuestionSet.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      QuestionSet.countDocuments(filter),
    ]);

    const questionSets = sets.map((s) => {
      const summary = summarize(s.questions);
      return {
        id: s._id.toString(),
        name: s.name,
        description: s.description,
        source: s.source,
        totalQuestions: summary.totalQuestions,
        questionsWithAnswers: summary.questionsWithAnswers,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      };
    });

    return { questionSets, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async getQuestionSet(userId: string, questionSetId: string) {
    const questionSet = await QuestionSet.findOne({ _id: questionSetId, ...buildTenantOwnerFilter({ userId }) }).lean();
    if (!questionSet) {
      throw new ApiError(404, 'Question set not found');
    }
    return this.toDetail(questionSet);
  }

  async updateQuestionSet(params: UpdateQuestionSetParams) {
    const { userId, questionSetId, name, description, questions } = params;

    const questionSet = await QuestionSet.findOne({ _id: questionSetId, ...buildTenantOwnerFilter({ userId }) });
    if (!questionSet) {
      throw new ApiError(404, 'Question set not found');
    }

    if (name !== undefined) questionSet.name = name.trim();
    if (description !== undefined) questionSet.description = description.trim() || undefined;
    // Full replacement only — no per-index merge, so a stale/partial client
    // payload can never silently blend with the previously saved snapshot.
    if (questions !== undefined) questionSet.questions = normalizeAndValidateQuestions(questions);

    await questionSet.save();
    return this.toDetail(questionSet.toObject());
  }

  async deleteQuestionSet(userId: string, questionSetId: string): Promise<void> {
    const result = await QuestionSet.deleteOne({ _id: questionSetId, ...buildTenantOwnerFilter({ userId }) });
    if (result.deletedCount === 0) {
      throw new ApiError(404, 'Question set not found');
    }
  }

  private toDetail(questionSet: {
    _id: Types.ObjectId;
    name: string;
    description?: string;
    source: 'manual' | 'uploaded';
    questions: IQuestionSetQuestion[];
    createdAt: Date;
    updatedAt: Date;
  }) {
    const summary = summarize(questionSet.questions);
    return {
      id: questionSet._id.toString(),
      name: questionSet.name,
      description: questionSet.description,
      source: questionSet.source,
      questions: questionSet.questions,
      ...summary,
      createdAt: questionSet.createdAt,
      updatedAt: questionSet.updatedAt,
    };
  }
}

export const questionSetService = new QuestionSetService();
