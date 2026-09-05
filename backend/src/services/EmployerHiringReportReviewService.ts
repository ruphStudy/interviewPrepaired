import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJobApplication from '../models/EmployerJobApplication.model';
import EmployerInterviewInvitation from '../models/EmployerInterviewInvitation.model';
import { employerInterviewInvitationService } from './EmployerInterviewInvitationService';
import Interview from '../models/interview.model';
import { InterviewPurpose } from '../constants/interview';
import EmployerHiringAssessmentResult from '../models/EmployerHiringAssessmentResult.model';
import EmployerHiringAssessmentReport, { IEmployerHiringAssessmentReport } from '../models/EmployerHiringAssessmentReport.model';
import EmployerHiringReportReview, { IEmployerHiringReportReview } from '../models/EmployerHiringReportReview.model';
import OrganizationMember, { IOrganizationMember } from '../models/OrganizationMember.model';
import { OrganizationMemberRole, OrganizationMemberStatus } from '../constants/organizationMember';
import { User } from '../models/user.model';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const MAX_NOTES_LENGTH = 2000;

/**
 * Informational recruiter review workflow around one immutable 22C hiring
 * report (22D) — never a hire/reject verdict, never mutates the report
 * itself, never changes EmployerJobApplication status. A reviewer may only
 * ever upsert their OWN row (`reviewerMembershipId` is always taken from
 * the acting `organizationContext.member`, never from the request body).
 */
export class EmployerHiringReportReviewService {
  /** GET .../interview-session/report/reviews — reviews for the CURRENT exact report, or null if no report exists yet. */
  async getReviewSummary(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    actingMembershipId: string,
    applicationId: string
  ): Promise<Record<string, unknown> | null> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const report = await this.resolveCurrentReport(organization, actingRole, applicationId);
    if (!report) {
      return null;
    }

    return this.buildSummary(organization, report, actingMembershipId);
  }

  /**
   * POST/PUT .../interview-session/report/reviews — upserts the ACTING
   * membership's own review only. `reviewerMembershipId` is never
   * accepted from the request — always the caller's own membership id.
   */
  async upsertReview(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    actingMembershipId: string,
    applicationId: string,
    reviewNotes: unknown
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const report = await this.resolveCurrentReport(organization, actingRole, applicationId);
    if (!report) {
      throw new ApiError(404, 'Hiring report not found');
    }

    const trimmedNotes = typeof reviewNotes === 'string' ? reviewNotes.trim().slice(0, MAX_NOTES_LENGTH) : undefined;

    const update: Record<string, unknown> = {
      organizationId: organization._id,
      applicationId: report.applicationId,
      interviewId: report.interviewId,
      reportId: report._id,
      reviewerMembershipId: new Types.ObjectId(actingMembershipId),
      status: 'reviewed',
      reviewedAt: new Date(),
    };
    if (trimmedNotes !== undefined) {
      update.reviewNotes = trimmedNotes;
    }

    let saved: IEmployerHiringReportReview | null;
    try {
      saved = await EmployerHiringReportReview.findOneAndUpdate(
        { organizationId: organization._id, reportId: report._id, reviewerMembershipId: new Types.ObjectId(actingMembershipId) },
        { $set: update },
        { new: true, upsert: true }
      );
    } catch (error: any) {
      if (error?.code !== 11000) {
        throw error;
      }
      // Extremely rare concurrent-upsert race — the row now exists; retry as a plain update.
      saved = await EmployerHiringReportReview.findOneAndUpdate(
        { organizationId: organization._id, reportId: report._id, reviewerMembershipId: new Types.ObjectId(actingMembershipId) },
        { $set: update },
        { new: true }
      );
    }
    if (!saved) {
      throw new ApiError(500, 'Failed to save review');
    }

    return this.buildSummary(organization, report, actingMembershipId);
  }

  /** Resolves the exact tenant-scoped CURRENT hiring report (never trusts any artifact id from the caller) — returns null (not a throw) if no report exists yet, mirroring the report service's own GET convention. */
  private async resolveCurrentReport(
    organization: IOrganization,
    actingRole: OrganizationMemberRole,
    applicationId: string
  ): Promise<IEmployerHiringAssessmentReport | null> {
    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id }).select('_id');
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }

    const invitationDetail = await employerInterviewInvitationService.getCurrentInvitation(
      organization._id.toString(),
      actingRole,
      applicationId
    );
    if (!invitationDetail) {
      return null;
    }
    const invitation = await EmployerInterviewInvitation.findOne({ _id: invitationDetail.id, organizationId: organization._id }).select(
      'interviewId'
    );
    if (!invitation?.interviewId) {
      return null;
    }

    const interview = await Interview.findOne({ _id: invitation.interviewId, organizationId: organization._id }).select('_id purpose');
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      return null;
    }

    const assessmentResult = await EmployerHiringAssessmentResult.findOne({
      organizationId: organization._id,
      interviewId: interview._id,
    }).select('_id');
    if (!assessmentResult) {
      return null;
    }

    return EmployerHiringAssessmentReport.findOne({
      organizationId: organization._id,
      interviewId: interview._id,
      assessmentResultId: assessmentResult._id,
    });
  }

  /**
   * Reviewer count/status summary. "Eligible reviewers" = ACTIVE members
   * whose role carries INTERVIEWS_MANAGE (the same permission required to
   * submit a review) — this is a read-only headcount, never a mutation.
   */
  private async buildSummary(
    organization: IOrganization,
    report: IEmployerHiringAssessmentReport,
    actingMembershipId?: string
  ): Promise<Record<string, unknown>> {
    const members: IOrganizationMember[] = await OrganizationMember.find({
      organizationId: organization._id,
      status: OrganizationMemberStatus.ACTIVE,
    });
    const eligibleMembers = members.filter((m) => hasOrganizationPermission(m.role, OrganizationPermission.INTERVIEWS_MANAGE));

    const reviews = await EmployerHiringReportReview.find({ organizationId: organization._id, reportId: report._id }).sort({
      updatedAt: -1,
    });

    // Best-effort reviewer display info — a lookup failure never blocks the summary.
    const userIds = eligibleMembers.map((m) => m.userId);
    const users = await User.find({ _id: { $in: userIds } }).select('_id name email').lean();
    const userById = new Map(users.map((u) => [u._id.toString(), u as { _id: Types.ObjectId; name: string; email: string }]));
    const memberById = new Map(eligibleMembers.map((m) => [m._id.toString(), m]));

    const reviewedCount = reviews.filter((r) => r.status === 'reviewed').length;
    const totalReviewers = eligibleMembers.length;
    const pendingCount = Math.max(0, totalReviewers - reviewedCount);

    const reviewList = reviews.map((r) => {
      const member = memberById.get(r.reviewerMembershipId.toString());
      const user = member ? userById.get(member.userId.toString()) : undefined;
      return {
        reviewerMembershipId: r.reviewerMembershipId.toString(),
        reviewerName: user?.name,
        reviewerEmail: user?.email,
        status: r.status,
        reviewNotes: r.reviewNotes,
        reviewedAt: r.reviewedAt,
        updatedAt: r.updatedAt,
      };
    });

    const currentUserReview = actingMembershipId ? reviewList.find((r) => r.reviewerMembershipId === actingMembershipId) ?? null : null;

    return {
      reportId: report._id.toString(),
      totalReviewers,
      reviewedCount,
      pendingCount,
      currentUserReview,
      reviews: reviewList,
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
}

export const employerHiringReportReviewService = new EmployerHiringReportReviewService();
export default employerHiringReportReviewService;
