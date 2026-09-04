import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJob from '../models/EmployerJob.model';
import { EmployerJobStatus, EmployerJobWorkplaceType, EmployerJobEmploymentType, EMPLOYER_JOB_STATUS_TRANSITIONS } from '../constants/employerJob';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const MAX_ARRAY_ITEMS = 50;
const MAX_ARRAY_ITEM_LENGTH = 300;

interface ListJobsParams {
  page: number;
  limit: number;
  status?: EmployerJobStatus;
  department?: string;
  workplaceType?: EmployerJobWorkplaceType;
  employmentType?: EmployerJobEmploymentType;
  search?: string;
}

interface JobFields {
  title?: string;
  jobCode?: string;
  department?: string;
  location?: string;
  workplaceType?: EmployerJobWorkplaceType;
  employmentType?: EmployerJobEmploymentType;
  experienceMinYears?: number;
  experienceMaxYears?: number;
  openings?: number;
  description?: string;
  responsibilities?: string[];
  requiredSkills?: string[];
  preferredSkills?: string[];
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  applicationDeadline?: string;
}

/**
 * Employer job postings (16B). Authorization mirrors the institute domain
 * services exactly: the `requireOrganizationPermission` middleware (8D)
 * resolves the caller's trusted role onto the request, and these methods
 * take that already-trusted `organizationId`/`actingRole`. Company-only: an
 * INSTITUTE organization gets 400 from every method here. Reads use
 * ORGANIZATION_VIEW; mutations (including status transitions) use
 * INTERVIEWS_MANAGE — the existing hiring/interview-management permission,
 * not the generic profile-update permission, since job postings are a
 * hiring-workflow concern. No JD AI parsing (17), no candidates/applications
 * (18), no hiring-team scoping (16D) here.
 */
export class EmployerJobService {
  async getJobs(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    params: ListJobsParams
  ): Promise<{
    jobs: Array<Record<string, unknown>>;
    pagination: { page: number; limit: number; total: number; pages: number };
  }> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const filter: Record<string, unknown> = { organizationId: organization._id };
    if (params.status) filter.status = params.status;
    if (params.department) filter.department = params.department;
    if (params.workplaceType) filter.workplaceType = params.workplaceType;
    if (params.employmentType) filter.employmentType = params.employmentType;

    const search = params.search?.trim();
    if (search) {
      // Escape regex metacharacters — this is a plain substring search, not a pattern language exposed to the caller.
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(escaped, 'i');
      filter.$or = [{ title: pattern }, { jobCode: pattern }, { department: pattern }, { location: pattern }];
    }

    const skip = (params.page - 1) * params.limit;
    const [jobs, total] = await Promise.all([
      EmployerJob.find(filter).sort({ createdAt: -1 }).skip(skip).limit(params.limit).lean(),
      EmployerJob.countDocuments(filter),
    ]);

    return {
      jobs: jobs.map((j) => this.toDetail(j)),
      pagination: { page: params.page, limit: params.limit, total, pages: Math.ceil(total / params.limit) },
    };
  }

  async getJobById(organizationId: string, actingRole: OrganizationMemberRole, jobId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    // Tenant-scoped: never findById(jobId) alone.
    const job = await EmployerJob.findOne({ _id: jobId, organizationId: organization._id }).lean();
    if (!job) {
      throw new ApiError(404, 'Job not found');
    }
    return this.toDetail(job);
  }

  async createJob(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    creatorMembershipId: string,
    fields: JobFields
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);

    const title = fields.title?.trim();
    if (!title) {
      throw new ApiError(400, 'title is required');
    }

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);
    this.assertIntegrity(fields);

    try {
      const job = await EmployerJob.create({
        organizationId: organization._id,
        title,
        jobCode: this.normalizeCode(fields.jobCode),
        department: fields.department?.trim() || undefined,
        location: fields.location?.trim() || undefined,
        workplaceType: fields.workplaceType,
        employmentType: fields.employmentType,
        experienceMinYears: fields.experienceMinYears,
        experienceMaxYears: fields.experienceMaxYears,
        openings: fields.openings,
        description: fields.description?.trim() || undefined,
        responsibilities: this.cleanStringArray(fields.responsibilities),
        requiredSkills: this.cleanStringArray(fields.requiredSkills),
        preferredSkills: this.cleanStringArray(fields.preferredSkills),
        salaryMin: fields.salaryMin,
        salaryMax: fields.salaryMax,
        salaryCurrency: fields.salaryCurrency?.trim().toUpperCase() || undefined,
        applicationDeadline: fields.applicationDeadline ? new Date(fields.applicationDeadline) : undefined,
        // Always DRAFT server-side — never accepted from the request body at all.
        status: EmployerJobStatus.DRAFT,
        createdByMembershipId: new Types.ObjectId(creatorMembershipId),
      });
      return this.toDetail(job.toObject());
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ApiError(409, 'A job with this jobCode already exists in this organization');
      }
      throw error;
    }
  }

  /**
   * PATCH-like merge despite the PUT route — status/organizationId/
   * createdByMembershipId/timestamps are never accepted here (rejected at
   * the route validator). The dedicated status endpoint is the only status
   * transition path.
   */
  async updateJob(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    jobId: string,
    fields: JobFields
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    if (Object.values(fields).every((value) => value === undefined)) {
      throw new ApiError(400, 'At least one field is required');
    }

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const job = await EmployerJob.findOne({ _id: jobId, organizationId: organization._id });
    if (!job) {
      throw new ApiError(404, 'Job not found');
    }

    if (fields.title !== undefined) {
      const trimmedTitle = fields.title.trim();
      if (!trimmedTitle) {
        throw new ApiError(400, 'title cannot be empty');
      }
      job.title = trimmedTitle;
    }
    if (fields.jobCode !== undefined) job.jobCode = this.normalizeCode(fields.jobCode);
    if (fields.department !== undefined) job.department = fields.department.trim() || undefined;
    if (fields.location !== undefined) job.location = fields.location.trim() || undefined;
    if (fields.workplaceType !== undefined) job.workplaceType = fields.workplaceType;
    if (fields.employmentType !== undefined) job.employmentType = fields.employmentType;
    if (fields.experienceMinYears !== undefined) job.experienceMinYears = fields.experienceMinYears;
    if (fields.experienceMaxYears !== undefined) job.experienceMaxYears = fields.experienceMaxYears;
    if (fields.openings !== undefined) job.openings = fields.openings;
    if (fields.description !== undefined) job.description = fields.description.trim() || undefined;
    if (fields.responsibilities !== undefined) job.responsibilities = this.cleanStringArray(fields.responsibilities);
    if (fields.requiredSkills !== undefined) job.requiredSkills = this.cleanStringArray(fields.requiredSkills);
    if (fields.preferredSkills !== undefined) job.preferredSkills = this.cleanStringArray(fields.preferredSkills);
    if (fields.salaryMin !== undefined) job.salaryMin = fields.salaryMin;
    if (fields.salaryMax !== undefined) job.salaryMax = fields.salaryMax;
    if (fields.salaryCurrency !== undefined) job.salaryCurrency = fields.salaryCurrency.trim().toUpperCase() || undefined;
    if (fields.applicationDeadline !== undefined) {
      job.applicationDeadline = fields.applicationDeadline ? new Date(fields.applicationDeadline) : undefined;
    }

    this.assertIntegrity({
      experienceMinYears: job.experienceMinYears,
      experienceMaxYears: job.experienceMaxYears,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
    });

    try {
      await job.save();
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ApiError(409, 'A job with this jobCode already exists in this organization');
      }
      throw error;
    }

    return this.toDetail(job.toObject());
  }

  /**
   * The ONLY way a job's status changes — status is rejected on the
   * create/update endpoints entirely. Explicit transition map
   * (EMPLOYER_JOB_STATUS_TRANSITIONS); an unlisted or same-status
   * "transition" is rejected with a clear 409, never silently accepted.
   */
  async updateJobStatus(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    jobId: string,
    targetStatus: EmployerJobStatus
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);

    if (!targetStatus || !Object.values(EmployerJobStatus).includes(targetStatus)) {
      throw new ApiError(400, 'A valid status is required');
    }

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const job = await EmployerJob.findOne({ _id: jobId, organizationId: organization._id });
    if (!job) {
      throw new ApiError(404, 'Job not found');
    }

    const allowedNextStatuses = EMPLOYER_JOB_STATUS_TRANSITIONS[job.status] ?? [];
    if (!allowedNextStatuses.includes(targetStatus)) {
      throw new ApiError(409, `Cannot transition job from "${job.status}" to "${targetStatus}"`);
    }

    job.status = targetStatus;
    await job.save();
    return this.toDetail(job.toObject());
  }

  /** experienceMax >= experienceMin and salaryMax >= salaryMin — only checked when both sides of a pair are present. */
  private assertIntegrity(fields: {
    experienceMinYears?: number;
    experienceMaxYears?: number;
    salaryMin?: number;
    salaryMax?: number;
  }): void {
    if (
      fields.experienceMinYears !== undefined &&
      fields.experienceMaxYears !== undefined &&
      fields.experienceMaxYears < fields.experienceMinYears
    ) {
      throw new ApiError(400, 'experienceMaxYears must be greater than or equal to experienceMinYears');
    }
    if (fields.salaryMin !== undefined && fields.salaryMax !== undefined && fields.salaryMax < fields.salaryMin) {
      throw new ApiError(400, 'salaryMax must be greater than or equal to salaryMin');
    }
  }

  /** Same trim/filter-empty pattern as InstituteTrainerService's specialization cleanup, plus a count/length cap. */
  private cleanStringArray(values?: string[]): string[] | undefined {
    if (values === undefined) return undefined;
    const cleaned = values
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter(Boolean)
      .slice(0, MAX_ARRAY_ITEMS)
      .map((v) => v.slice(0, MAX_ARRAY_ITEM_LENGTH));
    return cleaned.length > 0 ? cleaned : undefined;
  }

  private normalizeCode(code?: string): string | undefined {
    if (code === undefined) return undefined;
    return code.trim().toUpperCase() || undefined;
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

  /** Type guard — never a silent empty job list/detail for an institute org. */
  private assertIsCompany(organization: IOrganization): void {
    if (organization.type !== OrganizationType.COMPANY) {
      throw new ApiError(400, 'This organization is not a company');
    }
  }

  private toDetail(job: any): Record<string, unknown> {
    return {
      id: job._id.toString(),
      organizationId: job.organizationId.toString(),
      title: job.title,
      jobCode: job.jobCode,
      department: job.department,
      location: job.location,
      workplaceType: job.workplaceType,
      employmentType: job.employmentType,
      experienceMinYears: job.experienceMinYears,
      experienceMaxYears: job.experienceMaxYears,
      openings: job.openings,
      description: job.description,
      responsibilities: job.responsibilities,
      requiredSkills: job.requiredSkills,
      preferredSkills: job.preferredSkills,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      salaryCurrency: job.salaryCurrency,
      applicationDeadline: job.applicationDeadline,
      status: job.status,
      createdByMembershipId: job.createdByMembershipId.toString(),
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }
}

export const employerJobService = new EmployerJobService();
