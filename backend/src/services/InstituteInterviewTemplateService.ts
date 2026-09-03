import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import InstituteCourse from '../models/InstituteCourse.model';
import InstituteBatch from '../models/InstituteBatch.model';
import QuestionSet from '../models/QuestionSet.model';
import InstituteInterviewTemplate, { IInstituteInterviewTemplateConfig } from '../models/InstituteInterviewTemplate.model';
import { InstituteInterviewTemplateStatus } from '../constants/instituteInterviewTemplate';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { DifficultyLevel } from './OpenAIService';
import { ApiError } from '../utils/ApiError';

interface QuestionSetRef {
  _id: Types.ObjectId;
  name: string;
  questions: unknown[];
}

interface ListTemplatesParams {
  page: number;
  limit: number;
  status?: InstituteInterviewTemplateStatus;
  courseId?: string;
  batchId?: string;
}

interface InterviewConfigInput {
  difficulty?: DifficultyLevel;
  style?: string;
  language?: string;
  questionLimit?: number;
}

interface TemplateFields {
  name?: string;
  description?: string;
  questionSetId?: string;
  // undefined = leave unchanged, null = clear, a string = set/change
  // (revalidated for same-org membership and mutual consistency).
  courseId?: string | null;
  batchId?: string | null;
  // Whole-object replacement when supplied (not a per-field merge) — same
  // convention OrganizationService uses for instituteProfile/companyProfile.
  interviewConfig?: InterviewConfigInput | null;
}

/**
 * Institute interview template management (12C). References an EXISTING
 * QuestionSet by id only — question text/answers are never copied.
 * Authorization mirrors the other institute services: the
 * `requireOrganizationPermission` middleware (8D) resolves the caller's
 * trusted role onto the request, and these methods take that
 * already-trusted `organizationId`/`actingRole`. Institute-only: a COMPANY
 * organization gets 400 from every method here. No student assignment or
 * interview creation from a template here — that's 12D.
 */
export class InstituteInterviewTemplateService {
  async getTemplates(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    params: ListTemplatesParams
  ): Promise<{
    templates: Array<Record<string, unknown>>;
    pagination: { page: number; limit: number; total: number; pages: number };
  }> {
    this.assertHasPermission(actingRole, OrganizationPermission.QUESTION_SETS_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);

    const filter: Record<string, unknown> = { organizationId: organization._id };
    if (params.status) filter.status = params.status;
    if (params.courseId) filter.courseId = new Types.ObjectId(params.courseId);
    if (params.batchId) filter.batchId = new Types.ObjectId(params.batchId);

    const skip = (params.page - 1) * params.limit;

    const [templates, total] = await Promise.all([
      InstituteInterviewTemplate.find(filter).sort({ createdAt: -1 }).skip(skip).limit(params.limit).lean(),
      InstituteInterviewTemplate.countDocuments(filter),
    ]);

    const questionSetIds = templates.map((t) => t.questionSetId);
    const questionSets = await QuestionSet.find({ _id: { $in: questionSetIds }, organizationId: organization._id })
      .select('_id name questions')
      .lean();
    const questionSetById = new Map(questionSets.map((qs) => [qs._id.toString(), qs]));

    return {
      templates: templates.map((t) => this.toDetail(t, questionSetById.get(t.questionSetId.toString()))),
      pagination: { page: params.page, limit: params.limit, total, pages: Math.ceil(total / params.limit) },
    };
  }

  async getTemplateById(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    templateId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.QUESTION_SETS_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);

    // Tenant-scoped: never findById(templateId) alone.
    const template = await InstituteInterviewTemplate.findOne({ _id: templateId, organizationId: organization._id }).lean();
    if (!template) {
      throw new ApiError(404, 'Template not found');
    }

    const questionSet = await QuestionSet.findOne({ _id: template.questionSetId, organizationId: organization._id })
      .select('_id name questions')
      .lean();
    return this.toDetail(template, questionSet ?? undefined);
  }

  async createTemplate(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    fields: TemplateFields
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.QUESTION_SETS_MANAGE);

    const name = fields.name?.trim();
    if (!name) {
      throw new ApiError(400, 'name is required');
    }
    if (!fields.questionSetId) {
      throw new ApiError(400, 'questionSetId is required');
    }

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);
    this.assertOrganizationMutable(organization);

    const questionSet = await this.loadOrgQuestionSet(organization._id, fields.questionSetId);
    const { courseId, batchId } = await this.resolveCourseAndBatch(organization._id, {
      courseId: fields.courseId ?? undefined,
      batchId: fields.batchId ?? undefined,
    });

    const template = await InstituteInterviewTemplate.create({
      organizationId: organization._id,
      name,
      description: fields.description?.trim() || undefined,
      questionSetId: questionSet._id,
      courseId,
      batchId,
      interviewConfig: this.normalizeInterviewConfig(fields.interviewConfig),
      status: InstituteInterviewTemplateStatus.ACTIVE,
    });

    return this.toDetail(template.toObject(), questionSet);
  }

  /** PATCH-like merge despite the PUT route — status is never accepted here; DELETE is the only status transition. */
  async updateTemplate(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    templateId: string,
    fields: TemplateFields
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.QUESTION_SETS_MANAGE);
    if (Object.values(fields).every((value) => value === undefined)) {
      throw new ApiError(400, 'At least one field is required');
    }

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);
    this.assertOrganizationMutable(organization);

    const template = await InstituteInterviewTemplate.findOne({ _id: templateId, organizationId: organization._id });
    if (!template) {
      throw new ApiError(404, 'Template not found');
    }

    if (fields.name !== undefined) {
      const trimmedName = fields.name.trim();
      if (!trimmedName) {
        throw new ApiError(400, 'name cannot be empty');
      }
      template.name = trimmedName;
    }
    if (fields.description !== undefined) template.description = fields.description.trim() || undefined;

    let questionSet: QuestionSetRef | null = null;
    if (fields.questionSetId !== undefined) {
      questionSet = await this.loadOrgQuestionSet(organization._id, fields.questionSetId);
      template.questionSetId = questionSet._id;
    }

    const relationshipChanged = fields.courseId !== undefined || fields.batchId !== undefined;
    if (relationshipChanged) {
      // Re-resolve using the FINAL effective course/batch — an explicitly
      // supplied field wins, otherwise fall back to whatever the template
      // currently has.
      const effectiveCourseId = fields.courseId !== undefined ? fields.courseId ?? undefined : template.courseId?.toString();
      const effectiveBatchId = fields.batchId !== undefined ? fields.batchId ?? undefined : template.batchId?.toString();

      const resolved = await this.resolveCourseAndBatch(organization._id, {
        courseId: effectiveCourseId,
        batchId: effectiveBatchId,
      });
      template.courseId = resolved.courseId;
      template.batchId = resolved.batchId;
    }

    if (fields.interviewConfig !== undefined) {
      template.interviewConfig = this.normalizeInterviewConfig(fields.interviewConfig);
    }

    await template.save();

    if (!questionSet) {
      questionSet = await QuestionSet.findOne({ _id: template.questionSetId, organizationId: organization._id })
        .select('_id name questions')
        .lean();
    }

    return this.toDetail(template.toObject(), questionSet ?? undefined);
  }

  /** Soft deactivate only — never a physical delete. Idempotent if already inactive. */
  async removeTemplate(organizationId: string, actingRole: OrganizationMemberRole, templateId: string): Promise<void> {
    this.assertHasPermission(actingRole, OrganizationPermission.QUESTION_SETS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);
    this.assertOrganizationMutable(organization);

    const template = await InstituteInterviewTemplate.findOne({ _id: templateId, organizationId: organization._id });
    if (!template) {
      throw new ApiError(404, 'Template not found');
    }

    if (template.status !== InstituteInterviewTemplateStatus.INACTIVE) {
      template.status = InstituteInterviewTemplateStatus.INACTIVE;
      await template.save();
    }
  }

  /**
   * A supplied questionSetId must be organization-scoped — a personal
   * QuestionSet (organizationId absent) never matches this query, and a
   * cross-org/nonexistent id both return the same 404.
   */
  private async loadOrgQuestionSet(organizationId: unknown, questionSetId: string): Promise<QuestionSetRef> {
    const questionSet = await QuestionSet.findOne({ _id: questionSetId, organizationId }).select('_id name questions');
    if (!questionSet) {
      throw new ApiError(404, 'Question set not found');
    }
    return { _id: questionSet._id as Types.ObjectId, name: questionSet.name, questions: questionSet.questions };
  }

  /** If a batchId is supplied, its own courseId is authoritative — an independently supplied courseId is only accepted if it matches (400 otherwise). Without a batchId, courseId is independent, organization-scoped. */
  private async resolveCourseAndBatch(
    organizationId: unknown,
    input: { courseId?: string; batchId?: string }
  ): Promise<{ courseId?: Types.ObjectId; batchId?: Types.ObjectId }> {
    if (!input.batchId) {
      if (!input.courseId) {
        return {};
      }
      const course = await InstituteCourse.findOne({ _id: input.courseId, organizationId }).select('_id');
      if (!course) {
        throw new ApiError(404, 'Course not found');
      }
      return { courseId: course._id as Types.ObjectId };
    }

    const batch = await InstituteBatch.findOne({ _id: input.batchId, organizationId }).select('_id courseId');
    if (!batch) {
      throw new ApiError(404, 'Batch not found');
    }
    if (input.courseId && input.courseId !== batch.courseId.toString()) {
      throw new ApiError(400, "courseId does not match the selected batch's course");
    }

    return { courseId: batch.courseId as Types.ObjectId, batchId: batch._id as Types.ObjectId };
  }

  private normalizeInterviewConfig(config?: InterviewConfigInput | null): IInstituteInterviewTemplateConfig | undefined {
    if (!config) return undefined;
    return {
      difficulty: config.difficulty,
      style: config.style?.trim() || undefined,
      language: config.language as IInstituteInterviewTemplateConfig['language'],
      questionLimit: config.questionLimit,
    };
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

  /** Type guard — never a silent empty template list/detail for a company org. */
  private assertIsInstitute(organization: IOrganization): void {
    if (organization.type !== OrganizationType.INSTITUTE) {
      throw new ApiError(400, 'This organization is not an institute');
    }
  }

  private toDetail(template: any, questionSet?: { _id: Types.ObjectId; name: string; questions: unknown[] }): Record<string, unknown> {
    return {
      id: template._id.toString(),
      organizationId: template.organizationId.toString(),
      name: template.name,
      description: template.description,
      questionSetId: template.questionSetId.toString(),
      // Only id/name/derived count — never the full question array here.
      questionSet: questionSet
        ? { id: questionSet._id.toString(), name: questionSet.name, questionCount: questionSet.questions.length }
        : undefined,
      courseId: template.courseId ? template.courseId.toString() : undefined,
      batchId: template.batchId ? template.batchId.toString() : undefined,
      interviewConfig: template.interviewConfig
        ? {
            difficulty: template.interviewConfig.difficulty,
            style: template.interviewConfig.style,
            language: template.interviewConfig.language,
            questionLimit: template.interviewConfig.questionLimit,
          }
        : undefined,
      status: template.status,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };
  }
}

export const instituteInterviewTemplateService = new InstituteInterviewTemplateService();
