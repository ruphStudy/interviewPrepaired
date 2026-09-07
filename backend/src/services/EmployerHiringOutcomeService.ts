import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJobApplication, { IEmployerJobApplication } from '../models/EmployerJobApplication.model';
import { EmployerJobApplicationStatus } from '../constants/employerJobApplication';
import EmployerHiringOutcome, {
  IEmployerHiringOutcome,
  EmployerHiringOutcomeDecision,
  IEmployerHiringEmploymentOutcome,
} from '../models/EmployerHiringOutcome.model';
import EmployerHiringOutcomeHistory from '../models/EmployerHiringOutcomeHistory.model';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const OUTCOME_VERSION = 'hiring-outcome-v1';
const EMPLOYMENT_STATUSES = ['unknown', 'joined', 'did_not_join', 'employed', 'left'];
const REVIEW_WINDOWS = ['not_available', 'thirty_day', 'ninety_day', 'six_month', 'twelve_month'];
const PERFORMANCE_BANDS = ['below_expectations', 'meets_expectations', 'exceeds_expectations'];
const RETENTION_STATUSES = ['unknown', 'retained', 'exited'];
const MAX_NOTES_LENGTH = 2000;

export interface UpdateHiringOutcomeInput {
  employmentOutcome?: {
    status?: string;
    joinedAt?: string;
    leftAt?: string;
    reviewWindow?: string;
    performanceBand?: string;
    retentionStatus?: string;
  };
  notes?: string;
}

/**
 * Structured, employer-entered hiring/employment OUTCOME tracking (32C) —
 * POST-HOC observation only. NEVER used to auto-score/alter the current
 * assessment, auto-decide a hiring outcome, or rank candidates. The
 * application pipeline itself always remains the source of truth for the
 * actual hiring decision; this service only best-effort MIRRORS a reached
 * terminal pipeline status.
 */
export class EmployerHiringOutcomeService {
  /**
   * Trusted, no-RBAC entry point called best-effort from the application
   * status transition path — NEVER invents a decision the pipeline itself
   * didn't reach. Preserves any existing manually-recorded
   * `employmentOutcome`/notes.
   */
  async syncFromPipeline(organizationId: Types.ObjectId, application: IEmployerJobApplication): Promise<void> {
    let hiringOutcome: EmployerHiringOutcomeDecision | null = null;
    if (application.status === EmployerJobApplicationStatus.HIRED) hiringOutcome = 'hired';
    else if (application.status === EmployerJobApplicationStatus.REJECTED) hiringOutcome = 'rejected';
    else if (application.status === EmployerJobApplicationStatus.WITHDRAWN) hiringOutcome = 'withdrawn';
    if (!hiringOutcome) return;

    const existing = await EmployerHiringOutcome.findOne({ organizationId, applicationId: application._id });
    if (existing && existing.hiringOutcome === hiringOutcome) return; // Already in sync — no-op, no duplicate history row.

    const previous = existing ? { hiringOutcome: existing.hiringOutcome, decisionAt: existing.decisionAt } : null;
    const decisionAt = new Date();

    const updated = await EmployerHiringOutcome.findOneAndUpdate(
      { organizationId, applicationId: application._id },
      {
        $set: { hiringOutcome, decisionAt, source: 'pipeline' },
        $setOnInsert: {
          candidateId: application.candidateId,
          jobId: application.jobId,
          outcomeVersion: OUTCOME_VERSION,
        },
      },
      { upsert: true, new: true }
    );

    await EmployerHiringOutcomeHistory.create({
      organizationId,
      applicationId: application._id,
      source: 'pipeline',
      previous: previous ?? {},
      next: { hiringOutcome: updated.hiringOutcome, decisionAt: updated.decisionAt },
      changedAt: decisionAt,
    });
  }

  /** PUT .../applications/:applicationId/hiring-outcome — requires INTERVIEWS_MANAGE. Employer-entered POST-HOC employment outcome only — never alters the hiring decision itself. */
  async updateOutcome(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    membershipId: string,
    applicationId: string,
    input: UpdateHiringOutcomeInput
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id });
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }

    const existing = await EmployerHiringOutcome.findOne({ organizationId: organization._id, applicationId: application._id });
    const employmentOutcome = this.validateEmploymentOutcome(input.employmentOutcome, existing?.decisionAt);
    const notes = input.notes !== undefined ? input.notes.trim().slice(0, MAX_NOTES_LENGTH) || undefined : existing?.notes;

    const previous = existing
      ? { employmentOutcome: existing.employmentOutcome, notes: existing.notes }
      : {};

    const changedAt = new Date();
    const updated = await EmployerHiringOutcome.findOneAndUpdate(
      { organizationId: organization._id, applicationId: application._id },
      {
        $set: {
          employmentOutcome,
          notes,
          source: 'manual',
          updatedByMembershipId: membershipId,
        },
        $setOnInsert: {
          candidateId: application.candidateId,
          jobId: application.jobId,
          outcomeVersion: OUTCOME_VERSION,
          hiringOutcome: this.inferHiringOutcomeFromStatus(application.status),
          createdByMembershipId: membershipId,
        },
      },
      { upsert: true, new: true }
    );

    await EmployerHiringOutcomeHistory.create({
      organizationId: organization._id,
      applicationId: application._id,
      changedByMembershipId: membershipId,
      source: 'manual',
      previous,
      next: { employmentOutcome: updated.employmentOutcome, notes: updated.notes },
      changedAt,
    });

    return this.toDetail(updated!, application);
  }

  /** GET .../applications/:applicationId/hiring-outcome — requires ORGANIZATION_VIEW. Absent returns a controlled, inferred-from-pipeline shape — never a fabricated recorded outcome. */
  async getOutcome(organizationId: string, actingRole: OrganizationMemberRole, applicationId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id });
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }

    const doc = await EmployerHiringOutcome.findOne({ organizationId: organization._id, applicationId: application._id });
    if (!doc) {
      return { recorded: false, hiringOutcome: this.inferHiringOutcomeFromStatus(application.status) };
    }
    return this.toDetail(doc, application);
  }

  private inferHiringOutcomeFromStatus(status: EmployerJobApplicationStatus): EmployerHiringOutcomeDecision {
    if (status === EmployerJobApplicationStatus.HIRED) return 'hired';
    if (status === EmployerJobApplicationStatus.REJECTED) return 'rejected';
    if (status === EmployerJobApplicationStatus.WITHDRAWN) return 'withdrawn';
    return 'no_decision';
  }

  /**
   * Deterministic chronology/consistency validation (32C section 20) — no
   * arbitrary values accepted. `performanceBand` requires an employment
   * status of `employed`/`left` AND a review window other than
   * `not_available` — it is never meaningful without both.
   */
  private validateEmploymentOutcome(
    input: UpdateHiringOutcomeInput['employmentOutcome'],
    decisionAt?: Date
  ): IEmployerHiringEmploymentOutcome | undefined {
    if (!input) return undefined;

    const status = EMPLOYMENT_STATUSES.includes(input.status ?? '') ? (input.status as IEmployerHiringEmploymentOutcome['status']) : 'unknown';
    const reviewWindow = REVIEW_WINDOWS.includes(input.reviewWindow ?? '')
      ? (input.reviewWindow as IEmployerHiringEmploymentOutcome['reviewWindow'])
      : 'not_available';

    let joinedAt: Date | undefined;
    if (input.joinedAt) {
      joinedAt = new Date(input.joinedAt);
      if (Number.isNaN(joinedAt.getTime())) {
        throw new ApiError(400, 'joinedAt must be a valid date');
      }
      if (decisionAt && joinedAt < decisionAt) {
        throw new ApiError(400, 'joinedAt cannot precede the hiring decision date');
      }
    }

    let leftAt: Date | undefined;
    if (input.leftAt) {
      leftAt = new Date(input.leftAt);
      if (Number.isNaN(leftAt.getTime())) {
        throw new ApiError(400, 'leftAt must be a valid date');
      }
      if (joinedAt && leftAt < joinedAt) {
        throw new ApiError(400, 'leftAt cannot precede joinedAt');
      }
    }

    let performanceBand: IEmployerHiringEmploymentOutcome['performanceBand'];
    if (input.performanceBand) {
      if (!PERFORMANCE_BANDS.includes(input.performanceBand)) {
        throw new ApiError(400, 'Invalid performanceBand');
      }
      const statusSupportsPerformance = status === 'employed' || status === 'left';
      if (!statusSupportsPerformance || reviewWindow === 'not_available') {
        throw new ApiError(400, 'performanceBand requires an "employed"/"left" status with a review window set');
      }
      performanceBand = input.performanceBand as IEmployerHiringEmploymentOutcome['performanceBand'];
    }

    let retentionStatus: IEmployerHiringEmploymentOutcome['retentionStatus'];
    if (input.retentionStatus) {
      if (!RETENTION_STATUSES.includes(input.retentionStatus)) {
        throw new ApiError(400, 'Invalid retentionStatus');
      }
      retentionStatus = input.retentionStatus as IEmployerHiringEmploymentOutcome['retentionStatus'];
    }

    return {
      status,
      joinedAt,
      leftAt,
      reviewWindow,
      performanceBand,
      retentionStatus,
      recordedAt: new Date(),
    };
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

  private toDetail(doc: IEmployerHiringOutcome, application: IEmployerJobApplication): Record<string, unknown> {
    return {
      recorded: true,
      hiringOutcome: doc.hiringOutcome,
      decisionAt: doc.decisionAt,
      employmentOutcome: doc.employmentOutcome,
      source: doc.source,
      notes: doc.notes,
      currentApplicationStatus: application.status,
      updatedAt: doc.updatedAt,
    };
  }
}

export const employerHiringOutcomeService = new EmployerHiringOutcomeService();
export default employerHiringOutcomeService;
