import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJob from '../models/EmployerJob.model';
import EmployerJobDescriptionSource from '../models/EmployerJobDescriptionSource.model';
import { EmployerJobStatus } from '../constants/employerJob';
import { EmployerJobDescriptionSourceType, JD_RAW_TEXT_MIN_LENGTH, JD_RAW_TEXT_MAX_LENGTH } from '../constants/employerJobDescription';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const HISTORY_LIMIT = 20;
const MAX_VERSION_CREATE_ATTEMPTS = 3;

interface JobRef {
  _id: Types.ObjectId;
  status: EmployerJobStatus;
}

interface CreateJdSourceFields {
  rawText?: string;
  sourceType?: EmployerJobDescriptionSourceType;
}

/**
 * Job description raw-text intake and versioning (17A) — NO AI parsing,
 * skill extraction, or competency generation happens here (later sprints).
 * Every operation verifies the organization exists, is a COMPANY, and that
 * the job belongs to that EXACT organization before touching any JD row.
 * Reads use ORGANIZATION_VIEW; the create mutation uses INTERVIEWS_MANAGE.
 */
export class EmployerJobDescriptionService {
  /**
   * GET .../jd — read-only, so an archived organization/job remains
   * readable. `current` is the highest-version row for this job (version is
   * unique and monotonically increasing per job) — derived this way rather
   * than trusted from the `isCurrent` flag alone, so a rare bookkeeping
   * inconsistency in that flag can never surface the wrong "current" JD.
   */
  async getJobDescription(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    jobId: string
  ): Promise<{ current: Record<string, unknown> | null; history: Array<Record<string, unknown>> }> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    const job = await this.getJobInOrganization(organization._id, jobId);

    const sources = await EmployerJobDescriptionSource.find({ organizationId: organization._id, jobId: job._id })
      .sort({ version: -1 })
      .limit(HISTORY_LIMIT)
      .lean();

    return {
      current: sources.length > 0 ? this.toDetail(sources[0]) : null,
      history: sources.map((s) => this.toDetail(s)),
    };
  }

  /** GET .../jd/:jdSourceId — exact org+job scoped detail read; a cross-org/cross-job/nonexistent version is always 404. */
  async getJobDescriptionSourceById(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    jobId: string,
    jdSourceId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    const job = await this.getJobInOrganization(organization._id, jobId);

    const source = await EmployerJobDescriptionSource.findOne({
      _id: jdSourceId,
      organizationId: organization._id,
      jobId: job._id,
    }).lean();
    if (!source) {
      throw new ApiError(404, 'Job description version not found');
    }
    return this.toDetail(source);
  }

  /**
   * Creates the NEXT version for this job and makes it current — never
   * overwrites an existing version. `version` is computed as (highest
   * existing version for this job) + 1; the unique
   * {organizationId, jobId, version} index is the actual concurrency guard.
   * On a duplicate-version race (two concurrent saves both computing the
   * same next version) the E11000 error is caught and the create is
   * retried — recomputing the next version each time — up to
   * MAX_VERSION_CREATE_ATTEMPTS times, rather than silently creating a
   * duplicate version or introducing transaction infrastructure this
   * project doesn't otherwise use.
   */
  async createJobDescriptionSource(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    createdByMembershipId: string,
    jobId: string,
    fields: CreateJdSourceFields
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);

    const rawText = fields.rawText?.trim();
    if (!rawText) {
      throw new ApiError(400, 'rawText is required');
    }
    if (rawText.length < JD_RAW_TEXT_MIN_LENGTH) {
      throw new ApiError(400, `rawText must be at least ${JD_RAW_TEXT_MIN_LENGTH} characters`);
    }
    if (rawText.length > JD_RAW_TEXT_MAX_LENGTH) {
      throw new ApiError(400, `rawText must be at most ${JD_RAW_TEXT_MAX_LENGTH} characters`);
    }
    if (!fields.sourceType || !Object.values(EmployerJobDescriptionSourceType).includes(fields.sourceType)) {
      throw new ApiError(400, 'A valid sourceType is required');
    }

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);
    const job = await this.getJobInOrganization(organization._id, jobId);
    this.assertJobMutable(job);

    let created: InstanceType<typeof EmployerJobDescriptionSource> | undefined;
    for (let attempt = 0; attempt < MAX_VERSION_CREATE_ATTEMPTS; attempt++) {
      const nextVersion = await this.computeNextVersion(organization._id, job._id);
      try {
        created = await EmployerJobDescriptionSource.create({
          organizationId: organization._id,
          jobId: job._id,
          rawText,
          sourceType: fields.sourceType,
          version: nextVersion,
          isCurrent: true,
          createdByMembershipId: new Types.ObjectId(createdByMembershipId),
        });
        break;
      } catch (error: any) {
        const isLastAttempt = attempt === MAX_VERSION_CREATE_ATTEMPTS - 1;
        if (error?.code === 11000 && !isLastAttempt) {
          continue; // Another concurrent request took this version number — recompute and retry.
        }
        throw error;
      }
    }
    if (!created) {
      throw new ApiError(500, 'Failed to create job description version — please try again');
    }

    // Best-effort demotion of any previously-current row(s). The new row is
    // already the authoritative "current" by version number regardless of
    // this step's outcome — GET derives `current` from the max version,
    // never from `isCurrent` alone — so a failure here is not fatal to
    // correctness, only to the older row's display flag.
    await EmployerJobDescriptionSource.updateMany(
      { organizationId: organization._id, jobId: job._id, isCurrent: true, _id: { $ne: created._id } },
      { $set: { isCurrent: false } }
    );

    return this.toDetail(created.toObject());
  }

  private async computeNextVersion(organizationId: Types.ObjectId, jobId: Types.ObjectId): Promise<number> {
    const latest = await EmployerJobDescriptionSource.findOne({ organizationId, jobId })
      .sort({ version: -1 })
      .select('version')
      .lean();
    return (latest?.version ?? 0) + 1;
  }

  /** Exact {_id, organizationId} match only — a cross-org job id is treated identically to a nonexistent one (404). */
  private async getJobInOrganization(organizationId: Types.ObjectId, jobId: string): Promise<JobRef> {
    const job = await EmployerJob.findOne({ _id: jobId, organizationId }).select('_id status').lean();
    if (!job) {
      throw new ApiError(404, 'Job not found');
    }
    return { _id: job._id as Types.ObjectId, status: job.status };
  }

  /** An archived JOB (independent of organization archival) can still have its JD read, but never a new version created. */
  private assertJobMutable(job: JobRef): void {
    if (job.status === EmployerJobStatus.ARCHIVED) {
      throw new ApiError(409, 'Job is archived and its job description cannot be modified');
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

  /** Type guard — job descriptions don't apply to an institute org. */
  private assertIsCompany(organization: IOrganization): void {
    if (organization.type !== OrganizationType.COMPANY) {
      throw new ApiError(400, 'This organization is not a company');
    }
  }

  /** Never exposes auth internals — just the JD content and its versioning/authorship metadata. */
  private toDetail(source: any): Record<string, unknown> {
    return {
      id: source._id.toString(),
      jobId: source.jobId.toString(),
      rawText: source.rawText,
      sourceType: source.sourceType,
      version: source.version,
      isCurrent: source.isCurrent,
      createdByMembershipId: source.createdByMembershipId.toString(),
      createdAt: source.createdAt,
    };
  }
}

export const employerJobDescriptionService = new EmployerJobDescriptionService();
