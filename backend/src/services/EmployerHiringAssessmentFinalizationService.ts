import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJobApplication from '../models/EmployerJobApplication.model';
import EmployerInterviewInvitation from '../models/EmployerInterviewInvitation.model';
import { employerInterviewInvitationService } from './EmployerInterviewInvitationService';
import Interview, { IInterview } from '../models/interview.model';
import { InterviewPurpose, InterviewStatus } from '../constants/interview';
import EmployerHiringAssessmentResult, { IEmployerHiringAssessmentResult } from '../models/EmployerHiringAssessmentResult.model';
import EmployerHiringEvidenceMatrix, { IEmployerHiringEvidenceMatrix } from '../models/EmployerHiringEvidenceMatrix.model';
import EmployerHiringFollowUpPlan, { IEmployerHiringFollowUpPlan } from '../models/EmployerHiringFollowUpPlan.model';
import EmployerHiringAssessmentReport, { IEmployerHiringAssessmentReport } from '../models/EmployerHiringAssessmentReport.model';
import { employerHiringReportReviewService } from './EmployerHiringReportReviewService';
import EmployerHiringAssessmentFinalization, {
  IEmployerHiringAssessmentFinalization,
  IFinalizationSnapshot,
} from '../models/EmployerHiringAssessmentFinalization.model';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const CALCULATION_VERSION = 'hiring-assessment-finalization-v1';

interface ResolvedArtifacts {
  interview: IInterview | null;
  assessmentResult: IEmployerHiringAssessmentResult | null;
  evidenceMatrix: IEmployerHiringEvidenceMatrix | null;
  followUpPlan: IEmployerHiringFollowUpPlan | null;
  report: IEmployerHiringAssessmentReport | null;
  needsFollowUp: boolean;
}

interface ReadinessChecklist {
  assessmentEvaluated: boolean;
  assessmentResultReady: boolean;
  evidenceReady: boolean;
  followUpReadyOrNotRequired: boolean;
  reportReady: boolean;
  currentUserReviewed: boolean;
  canFinalize: boolean;
}

/**
 * Finalizes (22E) — deterministically, NO AI — one hiring Interview's
 * entire Sprint 21/22 assessment evidence package as a single immutable
 * record for downstream Sprint 23 comparison/pipeline work. This is
 * workflow readiness only; it is NEVER a hire/reject/candidate-suitability
 * decision, never changes EmployerJobApplication status, never mutates any
 * prior artifact.
 */
export class EmployerHiringAssessmentFinalizationService {
  /**
   * GET .../interview-session/finalization — readiness checklist + the
   * existing finalization (or null). Never throws for "not ready yet";
   * only for genuine access/lookup failures.
   */
  async getReadiness(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    actingMembershipId: string,
    applicationId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id }).select('_id');
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }

    const artifacts = await this.resolveArtifacts(organization, actingRole, applicationId);
    const reviewSummary = await employerHiringReportReviewService.getReviewSummary(
      organizationId,
      actingRole,
      actingMembershipId,
      applicationId
    );
    const currentUserReviewed = (reviewSummary as any)?.currentUserReview?.status === 'reviewed';

    const checklist = this.buildChecklist(artifacts, currentUserReviewed);

    let finalization: IEmployerHiringAssessmentFinalization | null = null;
    if (artifacts.interview) {
      finalization = await EmployerHiringAssessmentFinalization.findOne({
        organizationId: organization._id,
        interviewId: artifacts.interview._id,
      });
    }

    return {
      finalization: finalization ? this.toDetail(finalization) : null,
      checklist,
    };
  }

  /**
   * POST .../interview-session/finalization — deterministic create. An
   * existing finalization for the exact current interview is returned
   * as-is, never recalculated. `finalizedByMembershipId` is always the
   * ACTING organization context's own membership — never accepted from
   * the request body.
   */
  async createFinalization(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    actingMembershipId: string,
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

    const artifacts = await this.resolveArtifacts(organization, actingRole, applicationId);
    if (!artifacts.interview) {
      throw new ApiError(404, 'Interview session not found');
    }

    const existing = await EmployerHiringAssessmentFinalization.findOne({
      organizationId: organization._id,
      interviewId: artifacts.interview._id,
    });
    if (existing) {
      return this.toDetail(existing);
    }

    const reviewSummary = await employerHiringReportReviewService.getReviewSummary(
      organizationId,
      actingRole,
      actingMembershipId,
      applicationId
    );
    const currentUserReviewed = (reviewSummary as any)?.currentUserReview?.status === 'reviewed';

    const checklist = this.buildChecklist(artifacts, currentUserReviewed);
    if (!checklist.canFinalize) {
      throw new ApiError(409, 'Assessment package is not ready to be finalized yet.');
    }

    const assessmentResult = artifacts.assessmentResult!;
    const evidenceMatrix = artifacts.evidenceMatrix!;
    const report = artifacts.report!;
    const reviewSummaryTyped = reviewSummary as { totalReviewers: number; reviewedCount: number };

    const snapshot: IFinalizationSnapshot = {
      overallScore: assessmentResult.result.overallScore,
      averageRubricScore: assessmentResult.result.averageRubricScore,
      competencyCoveragePercent: assessmentResult.result.competencyCoveragePercent,
      assessedWeight: assessmentResult.result.assessedWeight,
      evidenceSummary: {
        strongCount: evidenceMatrix.matrix.summary.strongCount,
        sufficientCount: evidenceMatrix.matrix.summary.sufficientCount,
        partialCount: evidenceMatrix.matrix.summary.partialCount,
        insufficientCount: evidenceMatrix.matrix.summary.insufficientCount,
        followUpCompetencyCount: evidenceMatrix.matrix.summary.followUpCompetencyCount,
        criticalFollowUpCount: evidenceMatrix.matrix.summary.criticalFollowUpCount,
      },
      followUpQuestionCount: artifacts.followUpPlan?.plan?.totalQuestions ?? 0,
      reviewSummary: {
        eligibleReviewerCount: reviewSummaryTyped.totalReviewers,
        reviewedCount: reviewSummaryTyped.reviewedCount,
      },
      calculationVersion: CALCULATION_VERSION,
    };

    let doc: IEmployerHiringAssessmentFinalization;
    try {
      doc = await EmployerHiringAssessmentFinalization.create({
        organizationId: organization._id,
        applicationId: application._id,
        jobId: artifacts.interview.employerJobId,
        candidateId: artifacts.interview.employerCandidateId,
        interviewId: artifacts.interview._id,
        blueprintId: artifacts.interview.employerBlueprintId,
        rubricId: artifacts.interview.employerRubricId,
        assessmentResultId: assessmentResult._id,
        evidenceMatrixId: evidenceMatrix._id,
        followUpPlanId: artifacts.followUpPlan?._id,
        reportId: report._id,
        finalizedByMembershipId: new Types.ObjectId(actingMembershipId),
        finalizedAt: new Date(),
        snapshot,
      });
    } catch (error: any) {
      if (error?.code !== 11000) {
        throw error;
      }
      const winner = await EmployerHiringAssessmentFinalization.findOne({
        organizationId: organization._id,
        interviewId: artifacts.interview._id,
      });
      if (!winner) {
        throw new ApiError(409, 'Finalization is already being prepared — please try again shortly');
      }
      return this.toDetail(winner);
    }

    return this.toDetail(doc);
  }

  /** Resolves whatever exists for the CURRENT applicable hiring session — never throws for a missing artifact, only for genuine lookup failures upstream. */
  private async resolveArtifacts(
    organization: IOrganization,
    actingRole: OrganizationMemberRole,
    applicationId: string
  ): Promise<ResolvedArtifacts> {
    const empty: ResolvedArtifacts = {
      interview: null,
      assessmentResult: null,
      evidenceMatrix: null,
      followUpPlan: null,
      report: null,
      needsFollowUp: false,
    };

    const invitationDetail = await employerInterviewInvitationService.getCurrentInvitation(
      organization._id.toString(),
      actingRole,
      applicationId
    );
    if (!invitationDetail) {
      return empty;
    }
    const invitation = await EmployerInterviewInvitation.findOne({ _id: invitationDetail.id, organizationId: organization._id }).select(
      'interviewId'
    );
    if (!invitation?.interviewId) {
      return empty;
    }

    const interview = await Interview.findOne({ _id: invitation.interviewId, organizationId: organization._id });
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      return empty;
    }

    const assessmentResult = await EmployerHiringAssessmentResult.findOne({
      organizationId: organization._id,
      interviewId: interview._id,
    });

    const evidenceMatrix = assessmentResult
      ? await EmployerHiringEvidenceMatrix.findOne({ organizationId: organization._id, interviewId: interview._id })
      : null;

    const needsFollowUp = evidenceMatrix ? evidenceMatrix.matrix.summary.followUpCompetencyCount > 0 : false;

    const followUpPlan = evidenceMatrix
      ? await EmployerHiringFollowUpPlan.findOne({
          organizationId: organization._id,
          interviewId: interview._id,
          evidenceMatrixId: evidenceMatrix._id,
        })
      : null;

    const report = assessmentResult
      ? await EmployerHiringAssessmentReport.findOne({
          organizationId: organization._id,
          interviewId: interview._id,
          assessmentResultId: assessmentResult._id,
        })
      : null;

    return { interview, assessmentResult, evidenceMatrix, followUpPlan, report, needsFollowUp };
  }

  private buildChecklist(artifacts: ResolvedArtifacts, currentUserReviewed: boolean): ReadinessChecklist {
    const assessmentEvaluated =
      !!artifacts.interview &&
      artifacts.interview.status === InterviewStatus.EVALUATED &&
      artifacts.interview.hiringEvaluationStatus === 'completed';
    const assessmentResultReady = !!artifacts.assessmentResult;
    const evidenceReady = !!artifacts.evidenceMatrix;
    const followUpReadyOrNotRequired = !artifacts.needsFollowUp || artifacts.followUpPlan?.status === 'completed';
    const reportReady = artifacts.report?.status === 'completed';

    const canFinalize =
      assessmentEvaluated &&
      assessmentResultReady &&
      evidenceReady &&
      followUpReadyOrNotRequired &&
      Boolean(reportReady) &&
      currentUserReviewed;

    return {
      assessmentEvaluated,
      assessmentResultReady,
      evidenceReady,
      followUpReadyOrNotRequired,
      reportReady: Boolean(reportReady),
      currentUserReviewed,
      canFinalize,
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

  private toDetail(doc: IEmployerHiringAssessmentFinalization): Record<string, unknown> {
    return {
      id: doc._id.toString(),
      interviewId: doc.interviewId.toString(),
      blueprintId: doc.blueprintId.toString(),
      rubricId: doc.rubricId.toString(),
      assessmentResultId: doc.assessmentResultId.toString(),
      evidenceMatrixId: doc.evidenceMatrixId.toString(),
      followUpPlanId: doc.followUpPlanId?.toString(),
      reportId: doc.reportId.toString(),
      finalizedByMembershipId: doc.finalizedByMembershipId.toString(),
      finalizedAt: doc.finalizedAt,
      snapshot: doc.snapshot,
      createdAt: doc.createdAt,
    };
  }
}

export const employerHiringAssessmentFinalizationService = new EmployerHiringAssessmentFinalizationService();
export default employerHiringAssessmentFinalizationService;
