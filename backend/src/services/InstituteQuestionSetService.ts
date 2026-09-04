import { Types } from 'mongoose';
import QuestionSet, { IQuestionSetQuestion } from '../models/QuestionSet.model';
import Organization, { IOrganization } from '../models/Organization.model';
import { normalizeUploadedQuestions, ParsedQuestion } from './QuestionFileParserService';
import { MAX_UPLOADED_QUESTIONS } from '../constants/interview';
import { OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

interface ListParams {
  page: number;
  limit: number;
}

interface CreateFields {
  name: string;
  description?: string;
  questions: ParsedQuestion[];
}

interface UpdateFields {
  name?: string;
  description?: string;
  questions?: ParsedQuestion[];
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

/** Same trust boundary as the personal QuestionSetService — both surfaces agree on the same content contract. */
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

/**
 * Organization-scoped QuestionSet CRUD (UI-05 unblock). A SEPARATE surface
 * from the personal/B2C QuestionSetService: every read/write here is
 * scoped by organizationId, never userId — it can never return/touch a
 * personal set (organizationId absent) or another organization's set, and
 * the personal QuestionSetService itself is completely untouched. Reuses
 * the exact same question normalization/validation and response shape
 * (id/name/description/source/questions/summary/timestamps) as the
 * personal service so both surfaces agree on one content contract.
 *
 * Available to any organization type (institute or company) — nothing
 * here asserts institute-only, since interview templates/question sets
 * are not an institute-exclusive concept in the existing permission model
 * (QUESTION_SETS_VIEW/MANAGE apply the same way to both org types).
 */
export class InstituteQuestionSetService {
  async createQuestionSet(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    creatorUserId: string,
    fields: CreateFields
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.QUESTION_SETS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertOrganizationMutable(organization);

    if (!fields.name?.trim()) {
      throw new ApiError(400, 'name is required');
    }

    const questions = normalizeAndValidateQuestions(fields.questions);

    const questionSet = new QuestionSet({
      userId: new Types.ObjectId(creatorUserId),
      // The only thing that makes this an organization-scoped set instead
      // of a personal one — always the trusted route param, never accepted
      // from the request body.
      organizationId: organization._id,
      name: fields.name.trim(),
      description: fields.description?.trim() || undefined,
      questions,
      source: 'manual',
    });

    await questionSet.save();
    return this.toDetail(questionSet.toObject());
  }

  async getQuestionSets(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    params: ListParams
  ): Promise<{
    questionSets: Array<Record<string, unknown>>;
    pagination: { page: number; limit: number; total: number; pages: number };
  }> {
    this.assertHasPermission(actingRole, OrganizationPermission.QUESTION_SETS_VIEW);
    const organization = await this.getOrganizationById(organizationId);

    // Exact organizationId match only — never falls back to a bare
    // {organizationId: {$exists: false}} personal-set filter like the
    // personal service does for its own scope.
    const filter = { organizationId: organization._id };
    const skip = (params.page - 1) * params.limit;

    const [sets, total] = await Promise.all([
      QuestionSet.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(params.limit).lean(),
      QuestionSet.countDocuments(filter),
    ]);

    return {
      questionSets: sets.map((s) => this.toSummary(s)),
      pagination: { page: params.page, limit: params.limit, total, pages: Math.ceil(total / params.limit) },
    };
  }

  async getQuestionSet(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    questionSetId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.QUESTION_SETS_VIEW);
    const organization = await this.getOrganizationById(organizationId);

    const questionSet = await QuestionSet.findOne({ _id: questionSetId, organizationId: organization._id }).lean();
    if (!questionSet) {
      throw new ApiError(404, 'Question set not found');
    }
    return this.toDetail(questionSet);
  }

  async updateQuestionSet(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    questionSetId: string,
    fields: UpdateFields
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.QUESTION_SETS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertOrganizationMutable(organization);

    const questionSet = await QuestionSet.findOne({ _id: questionSetId, organizationId: organization._id });
    if (!questionSet) {
      throw new ApiError(404, 'Question set not found');
    }

    if (fields.name !== undefined) questionSet.name = fields.name.trim();
    if (fields.description !== undefined) questionSet.description = fields.description.trim() || undefined;
    // Full replacement only — no per-index merge, matching the personal service exactly.
    if (fields.questions !== undefined) questionSet.questions = normalizeAndValidateQuestions(fields.questions);

    await questionSet.save();
    return this.toDetail(questionSet.toObject());
  }

  /** Physical delete — matches the personal QuestionSetService's own delete behavior exactly; the model has no status/soft-delete concept. */
  async deleteQuestionSet(organizationId: string, actingRole: OrganizationMemberRole, questionSetId: string): Promise<void> {
    this.assertHasPermission(actingRole, OrganizationPermission.QUESTION_SETS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertOrganizationMutable(organization);

    const result = await QuestionSet.deleteOne({ _id: questionSetId, organizationId: organization._id });
    if (result.deletedCount === 0) {
      throw new ApiError(404, 'Question set not found');
    }
  }

  /** Access is already verified by the RBAC middleware — this just loads by ID (trusted organizationId). */
  private async getOrganizationById(organizationId: string): Promise<IOrganization> {
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      throw new ApiError(404, 'Organization not found');
    }
    return organization;
  }

  /** Defense in depth — the middleware already checked this; never duplicates the 8C matrix, just reuses it. */
  private assertHasPermission(role: OrganizationMemberRole, permission: OrganizationPermission): void {
    if (!hasOrganizationPermission(role, permission)) {
      throw new ApiError(403, 'You do not have permission to perform this action');
    }
  }

  private assertOrganizationMutable(organization: IOrganization): void {
    if (organization.status === OrganizationStatus.ARCHIVED) {
      throw new ApiError(409, 'Organization is archived');
    }
  }

  private toSummary(questionSet: {
    _id: Types.ObjectId;
    name: string;
    description?: string;
    source: 'manual' | 'uploaded';
    questions: IQuestionSetQuestion[];
    createdAt: Date;
    updatedAt: Date;
  }): Record<string, unknown> {
    const summary = summarize(questionSet.questions);
    return {
      id: questionSet._id.toString(),
      name: questionSet.name,
      description: questionSet.description,
      source: questionSet.source,
      ...summary,
      createdAt: questionSet.createdAt,
      updatedAt: questionSet.updatedAt,
    };
  }

  private toDetail(questionSet: {
    _id: Types.ObjectId;
    name: string;
    description?: string;
    source: 'manual' | 'uploaded';
    questions: IQuestionSetQuestion[];
    createdAt: Date;
    updatedAt: Date;
  }): Record<string, unknown> {
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

export const instituteQuestionSetService = new InstituteQuestionSetService();
