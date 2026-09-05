import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJob from '../models/EmployerJob.model';
import EmployerCandidate from '../models/EmployerCandidate.model';
import EmployerJobApplication from '../models/EmployerJobApplication.model';
import { EmployerJobApplicationStatus } from '../constants/employerJobApplication';
import { employerJobApplicationService } from './EmployerJobApplicationService';
import { employerCandidateScreeningService } from './EmployerCandidateScreeningService';
import { EmployerCandidateScreeningStatus } from '../constants/employerCandidateScreening';
import { employerCandidateScreeningScoreService } from './EmployerCandidateScreeningScoreService';
import EmployerCandidateShortlistDecision from '../models/EmployerCandidateShortlistDecision.model';
import { EmployerCandidateShortlistDecisionValue } from '../constants/employerCandidateShortlist';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

/**
 * Explicit-recruiter-action shortlist workflow (19E) — screens
 * ELIGIBILITY only; the actual decision to shortlist is always a human
 * action, never automatic. Reuses the EXISTING 18D application lifecycle
 * (`EmployerJobApplicationService.updateApplicationStatus`) for the
 * screening -> shortlisted transition rather than writing
 * `application.status` directly, and the EXISTING 19A/19B services
 * (`getCurrentScreening`/`getScore`) to resolve the CURRENT applicable
 * screening/score rather than re-deriving that logic a third time. No new
 * scoring formula, no AI, no automatic rejection of other candidates.
 */
export class EmployerCandidateShortlistService {
  /** GET .../applications/:applicationId/shortlist — the most recent shortlist decision for this application, or null if never shortlisted through this service. Read-only, so archived org/application remain readable. */
  async getCurrentShortlistDecision(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    applicationId: string
  ): Promise<Record<string, unknown> | null> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id }).select('_id');
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }

    const decision = await EmployerCandidateShortlistDecision.findOne({ organizationId: organization._id, applicationId: application._id })
      .sort({ createdAt: -1 })
      .lean();

    return decision ? this.toDecisionDetail(decision) : null;
  }

  /** GET .../jobs/:jobId/shortlist — every CURRENTLY shortlisted application for this job, enriched with candidate + the score that supported the decision (if this service recorded one). */
  async getJobShortlist(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    jobId: string
  ): Promise<{ shortlisted: Array<Record<string, unknown>> }> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const job = await EmployerJob.findOne({ _id: jobId, organizationId: organization._id }).select('_id');
    if (!job) {
      throw new ApiError(404, 'Job not found');
    }

    const applications = await EmployerJobApplication.find({
      organizationId: organization._id,
      jobId: job._id,
      status: EmployerJobApplicationStatus.SHORTLISTED,
    })
      .select('_id candidateId status')
      .lean();

    if (applications.length === 0) {
      return { shortlisted: [] };
    }

    const applicationIds = applications.map((a) => a._id);
    const candidateIds = Array.from(new Set(applications.map((a) => a.candidateId.toString())));

    const [decisions, candidates] = await Promise.all([
      EmployerCandidateShortlistDecision.find({ organizationId: organization._id, applicationId: { $in: applicationIds } })
        .sort({ createdAt: -1 })
        .lean(),
      EmployerCandidate.find({ _id: { $in: candidateIds }, organizationId: organization._id })
        .select('_id firstName lastName email')
        .lean(),
    ]);

    const candidateMap = new Map(candidates.map((c) => [(c._id as Types.ObjectId).toString(), c]));
    // Newest decision per application only — decisions are already sorted desc.
    const latestDecisionByApplication = new Map<string, (typeof decisions)[number]>();
    for (const decision of decisions) {
      const key = decision.applicationId.toString();
      if (!latestDecisionByApplication.has(key)) {
        latestDecisionByApplication.set(key, decision);
      }
    }

    const shortlisted = applications.map((app) => {
      const decision = latestDecisionByApplication.get((app._id as Types.ObjectId).toString());
      const candidate = candidateMap.get(app.candidateId.toString());
      return {
        applicationId: app._id.toString(),
        candidate: candidate
          ? { id: candidate._id.toString(), firstName: candidate.firstName, lastName: candidate.lastName, email: candidate.email }
          : null,
        explainableScore: decision ? decision.explainableScore : null,
        shortlistedAt: decision ? decision.decidedAt : null,
        applicationStatus: app.status,
      };
    });

    return { shortlisted };
  }

  /**
   * POST .../applications/:applicationId/shortlist — the ONLY mutation
   * here. Validates the CURRENT applicable screening is completed and the
   * CURRENT applicable explainable score exists, then performs the
   * screening -> shortlisted transition through the EXISTING 18D lifecycle
   * service. An audit row is claimed via the unique
   * {applicationId, screeningId} index before the transition is attempted;
   * if the transition itself then fails for any reason other than the
   * application already being shortlisted, a row THIS call just created is
   * deleted (compensation) so no false shortlist audit is ever left
   * behind. A pre-existing decision (from an earlier successful call) is
   * never deleted.
   */
  async shortlistApplication(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    actorMembershipId: string,
    applicationId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id });
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }

    // Idempotent: already shortlisted — return the most recent decision this
    // service recorded, if any. Never reopens, never re-derives a decision
    // for a status this call didn't produce.
    if (application.status === EmployerJobApplicationStatus.SHORTLISTED) {
      const existingDecision = await EmployerCandidateShortlistDecision.findOne({
        organizationId: organization._id,
        applicationId: application._id,
      }).sort({ createdAt: -1 });
      if (existingDecision) {
        return this.toDecisionDetail(existingDecision.toObject());
      }
      throw new ApiError(409, 'This application is already shortlisted');
    }

    if (application.status === EmployerJobApplicationStatus.APPLIED) {
      throw new ApiError(409, 'Move application to screening first');
    }
    if (application.status !== EmployerJobApplicationStatus.SCREENING) {
      throw new ApiError(409, `Cannot shortlist an application with status "${application.status}"`);
    }

    // Resolve the CURRENT applicable screening + score — the EXACT same
    // semantics 19A/19B/19D already use. Never trusts an obsolete
    // historical screening/score.
    const screeningDetail = await employerCandidateScreeningService.getCurrentScreening(organizationId, actingRole, applicationId);
    if (!screeningDetail || screeningDetail.status !== EmployerCandidateScreeningStatus.COMPLETED) {
      throw new ApiError(409, 'A completed screening is required before shortlisting');
    }

    const scoreDetail = await employerCandidateScreeningScoreService.getScore(organizationId, actingRole, applicationId);
    if (!scoreDetail) {
      throw new ApiError(409, 'An explainable score is required before shortlisting');
    }

    const screeningId = new Types.ObjectId(screeningDetail.id as string);
    const screeningScoreId = new Types.ObjectId(scoreDetail.id as string);
    const explainableScore = (scoreDetail.score as { overallScore: number }).overallScore;

    const claim = await this.claimDecision(
      organization._id,
      application.jobId,
      application._id as Types.ObjectId,
      application.candidateId,
      screeningId,
      screeningScoreId,
      explainableScore,
      actorMembershipId
    );

    try {
      await employerJobApplicationService.updateApplicationStatus(
        organizationId,
        actingRole,
        applicationId,
        EmployerJobApplicationStatus.SHORTLISTED
      );
    } catch (error: any) {
      const isAlreadyShortlisted =
        error instanceof ApiError && error.statusCode === 409 && error.message === 'Application is already "shortlisted"';
      if (!isAlreadyShortlisted) {
        if (!claim.alreadyExisted) {
          // Compensate — this row was just created by THIS call and the
          // transition never actually took effect; never leave a false audit.
          await EmployerCandidateShortlistDecision.deleteOne({ _id: claim.row._id });
        }
        throw error;
      }
      // Someone else concurrently completed the exact same transition — our audit row is still an accurate record of this decision.
    }

    return this.toDecisionDetail(claim.row.toObject());
  }

  /** Wins (or recovers) the audit row for this exact {applicationId, screeningId} combination. */
  private async claimDecision(
    organizationId: Types.ObjectId,
    jobId: Types.ObjectId,
    applicationId: Types.ObjectId,
    candidateId: Types.ObjectId,
    screeningId: Types.ObjectId,
    screeningScoreId: Types.ObjectId,
    explainableScore: number,
    decidedByMembershipId: string
  ): Promise<{ row: InstanceType<typeof EmployerCandidateShortlistDecision>; alreadyExisted: boolean }> {
    try {
      const created = await EmployerCandidateShortlistDecision.create({
        organizationId,
        jobId,
        applicationId,
        candidateId,
        screeningId,
        screeningScoreId,
        explainableScore,
        decision: EmployerCandidateShortlistDecisionValue.SHORTLISTED,
        decidedByMembershipId: new Types.ObjectId(decidedByMembershipId),
        decidedAt: new Date(),
      });
      return { row: created, alreadyExisted: false };
    } catch (error: any) {
      if (error?.code !== 11000) {
        throw error;
      }
    }

    const existing = await EmployerCandidateShortlistDecision.findOne({ organizationId, applicationId, screeningId });
    if (!existing) {
      throw new ApiError(409, 'Shortlist decision is already being recorded — please try again shortly');
    }
    return { row: existing, alreadyExisted: true };
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

  /** Type guard — shortlisting doesn't apply to an institute org. */
  private assertIsCompany(organization: IOrganization): void {
    if (organization.type !== OrganizationType.COMPANY) {
      throw new ApiError(400, 'This organization is not a company');
    }
  }

  /** Never exposes auth/security internals or the full screening/gap/resume/JD content — just the decision's own fields. */
  private toDecisionDetail(doc: any): Record<string, unknown> {
    return {
      id: doc._id.toString(),
      jobId: doc.jobId.toString(),
      applicationId: doc.applicationId.toString(),
      candidateId: doc.candidateId.toString(),
      screeningId: doc.screeningId.toString(),
      screeningScoreId: doc.screeningScoreId.toString(),
      explainableScore: doc.explainableScore,
      decision: doc.decision,
      decidedByMembershipId: doc.decidedByMembershipId.toString(),
      decidedAt: doc.decidedAt,
      createdAt: doc.createdAt,
    };
  }
}

export const employerCandidateShortlistService = new EmployerCandidateShortlistService();
