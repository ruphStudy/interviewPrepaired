import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJob from '../models/EmployerJob.model';
import EmployerCandidate from '../models/EmployerCandidate.model';
import EmployerCandidateResumeSource from '../models/EmployerCandidateResumeSource.model';
import EmployerCandidateResumeAnalysis from '../models/EmployerCandidateResumeAnalysis.model';
import EmployerJobApplication from '../models/EmployerJobApplication.model';
import { EmployerJobStatus } from '../constants/employerJob';
import { EmployerCandidateStatus } from '../constants/employerCandidate';
import { EmployerCandidateResumeAnalysisStatus } from '../constants/employerCandidateResumeAnalysis';
import {
  EmployerJobApplicationStatus,
  EmployerJobApplicationSource,
  EMPLOYER_JOB_APPLICATION_STATUS_TRANSITIONS,
  APPLICATION_ELIGIBLE_JOB_STATUSES,
} from '../constants/employerJobApplication';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const MAX_SEARCH_MATCH_IDS = 500;

interface ListApplicationsParams {
  page: number;
  limit: number;
  jobId?: string;
  candidateId?: string;
  status?: EmployerJobApplicationStatus;
  source?: EmployerJobApplicationSource;
  search?: string;
}

interface CreateApplicationFields {
  jobId?: string;
  candidateId?: string;
  source?: EmployerJobApplicationSource;
  notes?: string;
}

interface UpdateApplicationFields {
  notes?: string;
  source?: EmployerJobApplicationSource;
}

/**
 * Links an existing company candidate to an existing company job (18D) and
 * manages the application's own lifecycle. No screening/ranking (19), no
 * interview blueprint/invitations (20), no AI. Authorization mirrors every
 * other employer-domain service exactly: reads use ORGANIZATION_VIEW,
 * mutations use INTERVIEWS_MANAGE, company-only, exact organization scope.
 */
export class EmployerJobApplicationService {
  async getApplications(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    params: ListApplicationsParams
  ): Promise<{
    applications: Array<Record<string, unknown>>;
    pagination: { page: number; limit: number; total: number; pages: number };
  }> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const filter: Record<string, unknown> = { organizationId: organization._id };
    if (params.jobId) filter.jobId = params.jobId;
    if (params.candidateId) filter.candidateId = params.candidateId;
    if (params.status) filter.status = params.status;
    if (params.source) filter.source = params.source;

    const search = params.search?.trim();
    if (search) {
      // Bounded, tenant-scoped lookups (never an unbounded/cross-collection
      // aggregation) — find matching candidates/jobs in THIS organization
      // first, then filter applications by those ids.
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(escaped, 'i');
      const [matchingCandidates, matchingJobs] = await Promise.all([
        EmployerCandidate.find({ organizationId: organization._id, $or: [{ firstName: pattern }, { lastName: pattern }, { email: pattern }] })
          .select('_id')
          .limit(MAX_SEARCH_MATCH_IDS)
          .lean(),
        EmployerJob.find({ organizationId: organization._id, $or: [{ title: pattern }, { jobCode: pattern }] })
          .select('_id')
          .limit(MAX_SEARCH_MATCH_IDS)
          .lean(),
      ]);
      const candidateIds = matchingCandidates.map((c) => c._id);
      const jobIds = matchingJobs.map((j) => j._id);

      if (candidateIds.length === 0 && jobIds.length === 0) {
        return { applications: [], pagination: { page: params.page, limit: params.limit, total: 0, pages: 0 } };
      }
      filter.$or = [
        ...(candidateIds.length > 0 ? [{ candidateId: { $in: candidateIds } }] : []),
        ...(jobIds.length > 0 ? [{ jobId: { $in: jobIds } }] : []),
      ];
    }

    const skip = (params.page - 1) * params.limit;
    const [applications, total] = await Promise.all([
      EmployerJobApplication.find(filter).sort({ createdAt: -1 }).skip(skip).limit(params.limit).lean(),
      EmployerJobApplication.countDocuments(filter),
    ]);

    return {
      applications: await this.enrichWithJobAndCandidate(organization._id, applications),
      pagination: { page: params.page, limit: params.limit, total, pages: Math.ceil(total / params.limit) },
    };
  }

  async getApplicationById(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    applicationId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    // Tenant-scoped: never findById(applicationId) alone.
    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id }).lean();
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }

    const [job, candidate] = await this.getReferencedJobAndCandidate(organization._id, application.jobId, application.candidateId);
    return this.toDetail(application, job, candidate);
  }

  /**
   * Creates a new application linking `fields.jobId` to `fields.candidateId`
   * — both are re-validated against THIS exact organization, never trusted
   * from the client as-is. Duplicate {organizationId, jobId, candidateId}
   * is rejected with 409 via the model's own unique index — a candidate is
   * never linked twice to the same job.
   */
  async createApplication(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    creatorMembershipId: string,
    fields: CreateApplicationFields
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);

    if (!fields.jobId) {
      throw new ApiError(400, 'jobId is required');
    }
    if (!fields.candidateId) {
      throw new ApiError(400, 'candidateId is required');
    }

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const job = await EmployerJob.findOne({ _id: fields.jobId, organizationId: organization._id });
    if (!job) {
      throw new ApiError(404, 'Job not found');
    }
    this.assertJobAcceptsApplications(job.status);

    const candidate = await EmployerCandidate.findOne({ _id: fields.candidateId, organizationId: organization._id });
    if (!candidate) {
      throw new ApiError(404, 'Candidate not found');
    }
    if (candidate.status === EmployerCandidateStatus.ARCHIVED) {
      throw new ApiError(409, 'This candidate is archived and cannot be added to a job');
    }

    // Deterministic snapshot only — the CURRENT resume version (if any) and
    // its COMPLETED analysis (if any). Never required, never a copy of the
    // resume/profile content itself.
    const currentResume = await EmployerCandidateResumeSource.findOne({ organizationId: organization._id, candidateId: candidate._id })
      .sort({ version: -1 })
      .select('_id');

    let resumeAnalysisId: Types.ObjectId | undefined;
    if (currentResume) {
      const completedAnalysis = await EmployerCandidateResumeAnalysis.findOne({
        organizationId: organization._id,
        candidateId: candidate._id,
        resumeSourceId: currentResume._id,
        status: EmployerCandidateResumeAnalysisStatus.COMPLETED,
      }).select('_id');
      resumeAnalysisId = completedAnalysis?._id as Types.ObjectId | undefined;
    }

    try {
      const application = await EmployerJobApplication.create({
        organizationId: organization._id,
        jobId: job._id,
        candidateId: candidate._id,
        status: EmployerJobApplicationStatus.APPLIED,
        source: fields.source ?? EmployerJobApplicationSource.MANUAL,
        appliedAt: new Date(),
        resumeSourceId: currentResume?._id,
        resumeAnalysisId,
        notes: fields.notes?.trim() || undefined,
        createdByMembershipId: new Types.ObjectId(creatorMembershipId),
      });
      return this.toDetail(application.toObject(), job.toObject(), candidate.toObject());
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ApiError(409, 'This candidate has already applied to this job');
      }
      throw error;
    }
  }

  /**
   * PATCH-like merge despite the PUT route — jobId/candidateId/status/
   * organizationId/createdByMembershipId/timestamps are never accepted here
   * (rejected at the route validator). The dedicated status endpoint is the
   * only status transition path. An archived application is read-only; a
   * mutation is also blocked if the application's referenced job or
   * candidate has since been archived.
   */
  async updateApplication(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    applicationId: string,
    fields: UpdateApplicationFields
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    if (fields.notes === undefined && fields.source === undefined) {
      throw new ApiError(400, 'At least one field is required');
    }

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id });
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }
    this.assertApplicationMutable(application.status);
    await this.assertReferencedEntitiesMutable(organization._id, application.jobId, application.candidateId);

    if (fields.notes !== undefined) application.notes = fields.notes.trim() || undefined;
    if (fields.source !== undefined) application.source = fields.source;

    await application.save();

    const [job, candidate] = await this.getReferencedJobAndCandidate(organization._id, application.jobId, application.candidateId);
    return this.toDetail(application.toObject(), job, candidate);
  }

  /**
   * The ONLY way an application's status changes. Explicit transition map
   * (EMPLOYER_JOB_APPLICATION_STATUS_TRANSITIONS); an unlisted or
   * same-status "transition" is rejected with a clear 409, never silently
   * accepted. No reopening a hired/rejected/withdrawn application in 18D —
   * the only outgoing transition from those is to `archived`.
   */
  async updateApplicationStatus(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    applicationId: string,
    targetStatus: EmployerJobApplicationStatus
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    return this.transitionApplicationStatus(organizationId, applicationId, targetStatus);
  }

  /**
   * INTERNAL, backend-only entry point for a trusted system workflow to
   * advance an application's status (e.g. 21C: hiring-assessment
   * completion moving shortlisted -> interview). No RBAC check — there is
   * no acting organization member in a public/system workflow, and
   * impersonating one (a fake role) is exactly what this method exists to
   * avoid. Never exposed by a controller/route. Runs the SAME transition
   * map, mutability checks, and persistence as `updateApplicationStatus` —
   * see `transitionApplicationStatus`, the one lifecycle authority both
   * methods share.
   */
  async syncApplicationStatusFromHiringWorkflow(
    organizationId: string,
    applicationId: string,
    targetStatus: EmployerJobApplicationStatus
  ): Promise<Record<string, unknown>> {
    return this.transitionApplicationStatus(organizationId, applicationId, targetStatus);
  }

  /**
   * The ONLY place an application's status actually changes. Explicit
   * transition map (EMPLOYER_JOB_APPLICATION_STATUS_TRANSITIONS); an
   * unlisted or same-status "transition" is rejected with a clear 409,
   * never silently accepted. No reopening a hired/rejected/withdrawn
   * application — the only outgoing transition from those is to
   * `archived`. Callers are responsible for their own authorization
   * (RBAC for `updateApplicationStatus`, trusted-internal-caller-only for
   * `syncApplicationStatusFromHiringWorkflow`) before reaching this helper.
   */
  private async transitionApplicationStatus(
    organizationId: string,
    applicationId: string,
    targetStatus: EmployerJobApplicationStatus
  ): Promise<Record<string, unknown>> {
    if (!targetStatus || !Object.values(EmployerJobApplicationStatus).includes(targetStatus)) {
      throw new ApiError(400, 'A valid status is required');
    }

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id });
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }

    if (application.status === targetStatus) {
      throw new ApiError(409, `Application is already "${targetStatus}"`);
    }
    const allowedNextStatuses = EMPLOYER_JOB_APPLICATION_STATUS_TRANSITIONS[application.status] ?? [];
    if (!allowedNextStatuses.includes(targetStatus)) {
      throw new ApiError(409, `Cannot transition application from "${application.status}" to "${targetStatus}"`);
    }

    await this.assertReferencedEntitiesMutable(organization._id, application.jobId, application.candidateId);

    application.status = targetStatus;
    await application.save();

    const [job, candidate] = await this.getReferencedJobAndCandidate(organization._id, application.jobId, application.candidateId);
    return this.toDetail(application.toObject(), job, candidate);
  }

  /** Batch-fetches the distinct jobs/candidates referenced by a page of applications, then maps each row to its enriched detail shape. */
  private async enrichWithJobAndCandidate(organizationId: Types.ObjectId, applications: any[]): Promise<Record<string, unknown>[]> {
    if (applications.length === 0) return [];

    const jobIds = Array.from(new Set(applications.map((a) => a.jobId.toString())));
    const candidateIds = Array.from(new Set(applications.map((a) => a.candidateId.toString())));

    const [jobs, candidates] = await Promise.all([
      EmployerJob.find({ _id: { $in: jobIds }, organizationId }).select('_id title jobCode status').lean(),
      EmployerCandidate.find({ _id: { $in: candidateIds }, organizationId }).select('_id firstName lastName email status').lean(),
    ]);

    const jobMap = new Map(jobs.map((j) => [(j._id as Types.ObjectId).toString(), j]));
    const candidateMap = new Map(candidates.map((c) => [(c._id as Types.ObjectId).toString(), c]));

    return applications.map((app) =>
      this.toDetail(app, jobMap.get(app.jobId.toString()), candidateMap.get(app.candidateId.toString()))
    );
  }

  private async getReferencedJobAndCandidate(organizationId: Types.ObjectId, jobId: Types.ObjectId, candidateId: Types.ObjectId) {
    return Promise.all([
      EmployerJob.findOne({ _id: jobId, organizationId }).select('_id title jobCode status').lean(),
      EmployerCandidate.findOne({ _id: candidateId, organizationId }).select('_id firstName lastName email status').lean(),
    ]);
  }

  /** A CLOSED or ARCHIVED job never accepts a NEW application — existing applications on such a job remain manageable (see assertReferencedEntitiesMutable, which only blocks on an ARCHIVED job). */
  private assertJobAcceptsApplications(status: EmployerJobStatus): void {
    if (!APPLICATION_ELIGIBLE_JOB_STATUSES.includes(status)) {
      throw new ApiError(409, `Cannot add a candidate to a "${status}" job`);
    }
  }

  /** An archived application is read-only through both the generic update and the status endpoint. */
  private assertApplicationMutable(status: EmployerJobApplicationStatus): void {
    if (status === EmployerJobApplicationStatus.ARCHIVED) {
      throw new ApiError(409, 'Archived applications are read-only');
    }
  }

  /**
   * Conservative 18D safety net: once the job or candidate an application
   * refers to has itself been archived, that application is frozen (no
   * notes/source edits, no status transitions) rather than left mutable
   * against a since-archived record. A merely CLOSED (not archived) job
   * does NOT block this — existing applicants in the pipeline still need
   * to be moved to rejected/withdrawn/hired/archived even after the job
   * stops accepting new applications.
   */
  private async assertReferencedEntitiesMutable(organizationId: Types.ObjectId, jobId: Types.ObjectId, candidateId: Types.ObjectId): Promise<void> {
    const [job, candidate] = await Promise.all([
      EmployerJob.findOne({ _id: jobId, organizationId }).select('status').lean(),
      EmployerCandidate.findOne({ _id: candidateId, organizationId }).select('status').lean(),
    ]);
    if (job?.status === EmployerJobStatus.ARCHIVED) {
      throw new ApiError(409, "This application's job is archived — mutation is disabled");
    }
    if (candidate?.status === EmployerCandidateStatus.ARCHIVED) {
      throw new ApiError(409, "This application's candidate is archived — mutation is disabled");
    }
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

  private assertOrganizationMutable(organization: IOrganization): void {
    if (organization.status === OrganizationStatus.ARCHIVED) {
      throw new ApiError(409, 'Organization is archived');
    }
  }

  /** Type guard — applications don't apply to an institute org. */
  private assertIsCompany(organization: IOrganization): void {
    if (organization.type !== OrganizationType.COMPANY) {
      throw new ApiError(400, 'This organization is not a company');
    }
  }

  /** Never exposes resumeSourceId/resumeAnalysisId (internal snapshot references) or auth/security internals — just the application plus safe job/candidate display fields. */
  private toDetail(application: any, job?: any, candidate?: any): Record<string, unknown> {
    return {
      id: application._id.toString(),
      organizationId: application.organizationId.toString(),
      jobId: application.jobId.toString(),
      candidateId: application.candidateId.toString(),
      job: job
        ? {
            id: job._id.toString(),
            title: job.title,
            jobCode: job.jobCode,
            status: job.status,
          }
        : null,
      candidate: candidate
        ? {
            id: candidate._id.toString(),
            firstName: candidate.firstName,
            lastName: candidate.lastName,
            email: candidate.email,
            status: candidate.status,
          }
        : null,
      status: application.status,
      source: application.source,
      appliedAt: application.appliedAt,
      notes: application.notes,
      createdByMembershipId: application.createdByMembershipId.toString(),
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
    };
  }
}

export const employerJobApplicationService = new EmployerJobApplicationService();
