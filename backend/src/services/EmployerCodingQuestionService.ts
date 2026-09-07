import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJob, { IEmployerJob } from '../models/EmployerJob.model';
import EmployerJobApplication from '../models/EmployerJobApplication.model';
import EmployerJobDescriptionCompetencies from '../models/EmployerJobDescriptionCompetencies.model';
import { EmployerJobDescriptionCompetenciesStatus } from '../constants/employerJobDescriptionCompetencies';
import Interview, { IInterview } from '../models/interview.model';
import { InterviewPurpose } from '../constants/interview';
import EmployerInterviewCompetencyRubric from '../models/EmployerInterviewCompetencyRubric.model';
import EmployerCodingQuestion, {
  IEmployerCodingQuestion,
  IEmployerCodingExample,
  IEmployerCodingFunctionSignature,
  IEmployerCodingStarterCode,
} from '../models/EmployerCodingQuestion.model';
import EmployerCodingTestCase from '../models/EmployerCodingTestCase.model';
import {
  CODING_SUPPORTED_LANGUAGES,
  EmployerCodingQuestionDifficulty,
  CODING_QUESTION_DIFFICULTIES,
  MIN_TIME_LIMIT_MS,
  MAX_TIME_LIMIT_MS,
  MIN_MEMORY_LIMIT_MB,
  MAX_MEMORY_LIMIT_MB,
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_CONSTRAINT_LENGTH,
  MAX_CONSTRAINTS,
  MAX_EXAMPLES,
  MAX_EXAMPLE_FIELD_LENGTH,
  MAX_STARTER_CODE_LENGTH,
  MAX_COMPETENCY_NAMES,
  MAX_SKILLS,
  MAX_FUNCTION_PARAMETERS,
} from '../constants/employerCodingQuestion';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const QUESTION_VERSION = 'coding-question-v1';

export interface CodingQuestionInput {
  jobId: string;
  applicationId?: string;
  interviewId?: string;
  title: string;
  description: string;
  difficulty: EmployerCodingQuestionDifficulty;
  supportedLanguages: string[];
  competencyNames?: string[];
  skills?: string[];
  constraints?: string[];
  examples?: IEmployerCodingExample[];
  starterCode?: IEmployerCodingStarterCode;
  functionSignature?: IEmployerCodingFunctionSignature;
  timeLimitMs: number;
  memoryLimitMb: number;
}

export interface CodingQuestionListFilters {
  jobId?: string;
  interviewId?: string;
  status?: string;
}

/**
 * Structured employer coding-problem foundation (30A) — definitions only,
 * NO code execution, NO AI. `jobId` is always resolved/validated
 * server-side; `applicationId`/`interviewId` (when present) are re-derived
 * from an exact, org-scoped interview — never trusted verbatim from the
 * client. A `ready` question's content/test cases are immutable except for
 * `archive` (v1 simplification — no back-to-draft path).
 */
export class EmployerCodingQuestionService {
  /** POST /organizations/:organizationId/coding-questions — requires INTERVIEWS_MANAGE. */
  async createQuestion(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    membershipId: string,
    input: CodingQuestionInput
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const { job, application, interview } = await this.resolveChain(organization, input.jobId, input.applicationId, input.interviewId);
    const normalized = await this.validateAndNormalize(organization, job, interview, input);

    const doc = await EmployerCodingQuestion.create({
      organizationId: organization._id,
      applicationId: application?._id,
      jobId: job._id,
      interviewId: interview?._id,
      questionVersion: QUESTION_VERSION,
      status: 'draft',
      createdByMembershipId: membershipId,
      ...normalized,
    });

    return this.toDetail(doc);
  }

  /** GET /organizations/:organizationId/coding-questions — requires ORGANIZATION_VIEW. */
  async listQuestions(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    filters: CodingQuestionListFilters
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const query: Record<string, unknown> = { organizationId: organization._id };
    if (filters.jobId) query.jobId = filters.jobId;
    if (filters.interviewId) query.interviewId = filters.interviewId;
    if (filters.status) query.status = filters.status;

    const questions = await EmployerCodingQuestion.find(query).sort({ createdAt: -1 });
    const testCaseCounts = await EmployerCodingTestCase.aggregate([
      { $match: { organizationId: organization._id, status: 'active' } },
      { $group: { _id: '$codingQuestionId', count: { $sum: 1 } } },
    ]);
    const countByQuestionId = new Map(testCaseCounts.map((c) => [c._id.toString(), c.count]));

    return { questions: questions.map((q) => this.toSummary(q, countByQuestionId.get(q._id.toString()) ?? 0)) };
  }

  /** GET /organizations/:organizationId/coding-questions/:codingQuestionId — requires ORGANIZATION_VIEW. */
  async getQuestion(organizationId: string, actingRole: OrganizationMemberRole, codingQuestionId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const doc = await this.findQuestionOrThrow(organization, codingQuestionId);
    return this.toDetail(doc);
  }

  /** PATCH /organizations/:organizationId/coding-questions/:codingQuestionId — requires INTERVIEWS_MANAGE. Only mutable while `draft`. */
  async updateQuestion(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    codingQuestionId: string,
    input: Partial<CodingQuestionInput>
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const doc = await this.findQuestionOrThrow(organization, codingQuestionId);
    if (doc.status !== 'draft') {
      throw new ApiError(409, 'Only a draft coding question can be edited.');
    }

    const merged: CodingQuestionInput = {
      jobId: doc.jobId.toString(),
      applicationId: doc.applicationId?.toString(),
      interviewId: doc.interviewId?.toString(),
      title: input.title ?? doc.title,
      description: input.description ?? doc.description,
      difficulty: input.difficulty ?? doc.difficulty,
      supportedLanguages: input.supportedLanguages ?? doc.supportedLanguages,
      competencyNames: input.competencyNames ?? doc.competencyNames,
      skills: input.skills ?? doc.skills,
      constraints: input.constraints ?? doc.constraints,
      examples: input.examples ?? doc.examples,
      starterCode: input.starterCode ?? doc.starterCode,
      functionSignature: input.functionSignature ?? doc.functionSignature,
      timeLimitMs: input.timeLimitMs ?? doc.timeLimitMs,
      memoryLimitMb: input.memoryLimitMb ?? doc.memoryLimitMb,
    };

    const { job, interview } = await this.resolveChain(organization, merged.jobId, merged.applicationId, merged.interviewId);
    const normalized = await this.validateAndNormalize(organization, job, interview, merged);

    doc.set(normalized);
    await doc.save();
    return this.toDetail(doc);
  }

  /** POST .../ready — requires INTERVIEWS_MANAGE. Requires >=1 active test case, at least one hidden. */
  async markReady(organizationId: string, actingRole: OrganizationMemberRole, codingQuestionId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const doc = await this.findQuestionOrThrow(organization, codingQuestionId);
    if (doc.status !== 'draft') {
      throw new ApiError(409, 'Only a draft coding question can be marked ready.');
    }

    const testCases = await EmployerCodingTestCase.find({ organizationId: organization._id, codingQuestionId: doc._id, status: 'active' });
    if (testCases.length === 0) {
      throw new ApiError(409, 'At least one test case is required before marking this question ready.');
    }
    const hasHidden = testCases.some((t) => t.type === 'hidden');
    if (!hasHidden) {
      throw new ApiError(409, 'At least one hidden test case is required before marking this question ready.');
    }

    doc.status = 'ready';
    await doc.save();
    return this.toDetail(doc);
  }

  /** POST .../archive — requires INTERVIEWS_MANAGE. Read-only afterward. */
  async archiveQuestion(organizationId: string, actingRole: OrganizationMemberRole, codingQuestionId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const doc = await this.findQuestionOrThrow(organization, codingQuestionId);
    if (doc.status === 'archived') {
      return this.toDetail(doc);
    }
    doc.status = 'archived';
    await doc.save();
    return this.toDetail(doc);
  }

  // ---- shared, package-internal helpers (used by EmployerCodingTestCaseService / session services too) ----

  async findQuestionOrThrow(organization: IOrganization, codingQuestionId: string): Promise<IEmployerCodingQuestion> {
    const doc = await EmployerCodingQuestion.findOne({ _id: codingQuestionId, organizationId: organization._id });
    if (!doc) {
      throw new ApiError(404, 'Coding question not found');
    }
    return doc;
  }

  private async resolveChain(
    organization: IOrganization,
    jobId: string,
    applicationId: string | undefined,
    interviewId: string | undefined
  ): Promise<{ job: IEmployerJob; application: { _id: any } | null; interview: IInterview | null }> {
    if (interviewId) {
      const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id });
      if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
        throw new ApiError(404, 'Interview session not found');
      }
      if (!interview.employerJobId) {
        throw new ApiError(409, 'This interview is not linked to a hiring job.');
      }
      const job = await EmployerJob.findOne({ _id: interview.employerJobId, organizationId: organization._id });
      if (!job) {
        throw new ApiError(404, 'Job not found');
      }
      const application = interview.employerApplicationId
        ? await EmployerJobApplication.findOne({ _id: interview.employerApplicationId, organizationId: organization._id }).select('_id')
        : null;
      return { job, application, interview };
    }

    const job = await EmployerJob.findOne({ _id: jobId, organizationId: organization._id });
    if (!job) {
      throw new ApiError(404, 'Job not found');
    }
    let application: { _id: any } | null = null;
    if (applicationId) {
      application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id, jobId: job._id }).select('_id');
      if (!application) {
        throw new ApiError(404, 'Application not found');
      }
    }
    return { job, application, interview: null };
  }

  /**
   * Deterministic (NO AI) validation/normalization. Competency names are
   * validated against the EXACT interview rubric when interview-linked, or
   * the job's own completed JD-competency set when available at job level
   * (best-effort — skipped when no such analysis exists yet). Unknown
   * references are rejected outright (never silently invented/renamed).
   */
  private async validateAndNormalize(
    organization: IOrganization,
    job: IEmployerJob,
    interview: IInterview | null,
    input: CodingQuestionInput
  ): Promise<Partial<IEmployerCodingQuestion>> {
    const title = input.title?.trim();
    if (!title || title.length === 0) {
      throw new ApiError(400, 'title is required');
    }
    if (title.length > MAX_TITLE_LENGTH) {
      throw new ApiError(400, `title cannot exceed ${MAX_TITLE_LENGTH} characters`);
    }

    const description = input.description?.trim();
    if (!description || description.length === 0) {
      throw new ApiError(400, 'description is required');
    }
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      throw new ApiError(400, `description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters`);
    }

    if (!CODING_QUESTION_DIFFICULTIES.includes(input.difficulty)) {
      throw new ApiError(400, 'Invalid difficulty');
    }

    const supportedLanguages = this.dedupeStrings(input.supportedLanguages);
    if (supportedLanguages.length === 0) {
      throw new ApiError(400, 'At least one supported language is required');
    }
    for (const lang of supportedLanguages) {
      if (!(CODING_SUPPORTED_LANGUAGES as readonly string[]).includes(lang)) {
        throw new ApiError(400, `Unsupported language: ${lang}`);
      }
    }

    if (!Number.isFinite(input.timeLimitMs) || input.timeLimitMs < MIN_TIME_LIMIT_MS || input.timeLimitMs > MAX_TIME_LIMIT_MS) {
      throw new ApiError(400, `timeLimitMs must be between ${MIN_TIME_LIMIT_MS} and ${MAX_TIME_LIMIT_MS}`);
    }
    if (!Number.isFinite(input.memoryLimitMb) || input.memoryLimitMb < MIN_MEMORY_LIMIT_MB || input.memoryLimitMb > MAX_MEMORY_LIMIT_MB) {
      throw new ApiError(400, `memoryLimitMb must be between ${MIN_MEMORY_LIMIT_MB} and ${MAX_MEMORY_LIMIT_MB}`);
    }

    const constraints = this.dedupeStrings(input.constraints ?? [], MAX_CONSTRAINTS, MAX_CONSTRAINT_LENGTH);
    const skills = this.dedupeStrings(input.skills ?? [], MAX_SKILLS, 100);
    const competencyNames = this.dedupeStrings(input.competencyNames ?? [], MAX_COMPETENCY_NAMES, 200);

    await this.validateCompetencyNames(organization, job, interview, competencyNames);

    const examples = (input.examples ?? []).slice(0, MAX_EXAMPLES).map((e) => ({
      input: (e.input ?? '').toString().slice(0, MAX_EXAMPLE_FIELD_LENGTH),
      output: (e.output ?? '').toString().slice(0, MAX_EXAMPLE_FIELD_LENGTH),
      explanation: e.explanation ? e.explanation.toString().slice(0, MAX_EXAMPLE_FIELD_LENGTH) : undefined,
    }));

    let starterCode: IEmployerCodingStarterCode | undefined;
    if (input.starterCode) {
      starterCode = {};
      for (const lang of CODING_SUPPORTED_LANGUAGES) {
        const code = input.starterCode[lang];
        if (typeof code === 'string' && code.trim().length > 0) {
          starterCode[lang] = code.slice(0, MAX_STARTER_CODE_LENGTH);
        }
      }
    }

    let functionSignature: IEmployerCodingFunctionSignature | undefined;
    if (input.functionSignature?.name) {
      functionSignature = {
        name: input.functionSignature.name.trim().slice(0, 100),
        returnType: input.functionSignature.returnType?.trim().slice(0, 100),
        parameters: (input.functionSignature.parameters ?? []).slice(0, MAX_FUNCTION_PARAMETERS).map((p) => ({
          name: (p.name ?? '').toString().trim().slice(0, 100),
          type: p.type ? p.type.toString().trim().slice(0, 100) : undefined,
        })),
      };
    }

    return {
      title,
      description,
      difficulty: input.difficulty,
      supportedLanguages,
      competencyNames,
      skills,
      constraints,
      examples,
      starterCode,
      functionSignature,
      timeLimitMs: Math.round(input.timeLimitMs),
      memoryLimitMb: Math.round(input.memoryLimitMb),
    };
  }

  private async validateCompetencyNames(
    organization: IOrganization,
    job: IEmployerJob,
    interview: IInterview | null,
    competencyNames: string[]
  ): Promise<void> {
    if (competencyNames.length === 0) return;

    if (interview) {
      if (!interview.employerRubricId) {
        throw new ApiError(409, 'This interview does not have an evaluation rubric yet.');
      }
      const rubric = await EmployerInterviewCompetencyRubric.findOne({ _id: interview.employerRubricId, organizationId: organization._id });
      if (!rubric) {
        throw new ApiError(409, 'This interview does not have an evaluation rubric yet.');
      }
      const allowed = new Set(rubric.rubric.competencies.map((c) => c.competencyName));
      const invalid = competencyNames.filter((name) => !allowed.has(name));
      if (invalid.length > 0) {
        throw new ApiError(400, `Unknown competency name(s) for this interview's rubric: ${invalid.join(', ')}`);
      }
      return;
    }

    // Job-level, best-effort — validated against the job's completed JD competency set when one exists.
    const jobCompetencies = await EmployerJobDescriptionCompetencies.findOne({
      organizationId: organization._id,
      jobId: job._id,
      status: EmployerJobDescriptionCompetenciesStatus.COMPLETED,
    }).sort({ createdAt: -1 });
    if (!jobCompetencies) return;

    const allowed = new Set(jobCompetencies.competencies.map((c) => c.name));
    const invalid = competencyNames.filter((name) => !allowed.has(name));
    if (invalid.length > 0) {
      throw new ApiError(400, `Unknown competency name(s) for this job: ${invalid.join(', ')}`);
    }
  }

  private dedupeStrings(values: string[] | undefined, maxItems = 50, maxLength = 200): string[] {
    if (!Array.isArray(values)) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of values) {
      if (typeof raw !== 'string') continue;
      const trimmed = raw.trim().slice(0, maxLength);
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(trimmed);
      if (result.length >= maxItems) break;
    }
    return result;
  }

  private async getOrganizationById(organizationId: string): Promise<IOrganization> {
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      throw new ApiError(404, 'Organization not found');
    }
    return organization;
  }

  private assertHasPermission(role: OrganizationMemberRole, permission: OrganizationPermission): void {
    if (!hasOrganizationPermission(role, permission)) {
      throw new ApiError(403, 'You do not have permission to perform this action');
    }
  }

  private assertIsCompany(organization: IOrganization): void {
    if (organization.type !== OrganizationType.COMPANY) {
      throw new ApiError(400, 'This organization is not a company');
    }
  }

  private assertOrganizationMutable(organization: IOrganization): void {
    if (organization.status === OrganizationStatus.ARCHIVED) {
      throw new ApiError(400, 'This organization is archived and read-only');
    }
  }

  private toSummary(doc: IEmployerCodingQuestion, testCaseCount: number): Record<string, unknown> {
    return {
      id: doc._id.toString(),
      title: doc.title,
      difficulty: doc.difficulty,
      supportedLanguages: doc.supportedLanguages,
      status: doc.status,
      jobId: doc.jobId.toString(),
      applicationId: doc.applicationId?.toString(),
      interviewId: doc.interviewId?.toString(),
      testCaseCount,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private toDetail(doc: IEmployerCodingQuestion): Record<string, unknown> {
    return {
      id: doc._id.toString(),
      organizationId: doc.organizationId.toString(),
      jobId: doc.jobId.toString(),
      applicationId: doc.applicationId?.toString(),
      interviewId: doc.interviewId?.toString(),
      questionVersion: doc.questionVersion,
      title: doc.title,
      description: doc.description,
      difficulty: doc.difficulty,
      supportedLanguages: doc.supportedLanguages,
      competencyNames: doc.competencyNames,
      skills: doc.skills,
      constraints: doc.constraints,
      examples: doc.examples,
      starterCode: doc.starterCode,
      functionSignature: doc.functionSignature,
      timeLimitMs: doc.timeLimitMs,
      memoryLimitMb: doc.memoryLimitMb,
      status: doc.status,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}

export const employerCodingQuestionService = new EmployerCodingQuestionService();
export default employerCodingQuestionService;
