import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJobApplication from '../models/EmployerJobApplication.model';
import EmployerInterviewInvitation from '../models/EmployerInterviewInvitation.model';
import { employerInterviewInvitationService } from './EmployerInterviewInvitationService';
import Interview, { IInterview } from '../models/interview.model';
import { hiringAnswerEvaluationService } from './HiringAnswerEvaluationService';
import { OrganizationType } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

/**
 * Authenticated, recruiter-facing READ of the 20E hiring-assessment
 * interview session — no mutation exists here (20E is read-only on the
 * employer side). Resolves the session via the CURRENT applicable
 * invitation's own `interviewId` reverse-link, re-verified against the
 * exact organization for tenant safety. Never creates or modifies a
 * session, never touches EmployerJobApplication.status.
 */
export class EmployerInterviewSessionService {
  /** GET .../interview-session — the session for the CURRENT applicable invitation, or null if none has been created yet. */
  async getCurrentSession(
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

    const invitationDetail = await employerInterviewInvitationService.getCurrentInvitation(organizationId, actingRole, applicationId);
    if (!invitationDetail) {
      return null;
    }

    const invitation = await EmployerInterviewInvitation.findOne({ _id: invitationDetail.id, organizationId: organization._id }).select(
      'interviewId'
    );
    if (!invitation?.interviewId) {
      return null;
    }

    const interview = await Interview.findOne({ _id: invitation.interviewId, organizationId: organization._id });
    if (!interview) {
      return null;
    }

    return this.toDetail(interview);
  }

  /**
   * GET .../interview-session/questions (21A) — recruiter-facing, read-only.
   * Unlike the public candidate response, this MAY include competencies,
   * skills, evaluation intent, and evidence-expected — this endpoint is
   * authenticated org-context. No mutation exists here; materialization is
   * only ever triggered through the public candidate handoff.
   */
  async getCurrentSessionQuestions(
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

    const invitationDetail = await employerInterviewInvitationService.getCurrentInvitation(organizationId, actingRole, applicationId);
    if (!invitationDetail) {
      return null;
    }

    const invitation = await EmployerInterviewInvitation.findOne({ _id: invitationDetail.id, organizationId: organization._id }).select(
      'interviewId'
    );
    if (!invitation?.interviewId) {
      return null;
    }

    const interview = await Interview.findOne({ _id: invitation.interviewId, organizationId: organization._id });
    if (!interview) {
      return null;
    }

    return this.toQuestionsDetail(interview);
  }

  /**
   * GET .../interview-session/answers (21B) — recruiter-facing, read-only.
   * No evaluation exists yet, so only the raw saved answer + timing is
   * returned alongside the question/section/category/difficulty context.
   */
  async getCurrentSessionAnswers(
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

    const invitationDetail = await employerInterviewInvitationService.getCurrentInvitation(organizationId, actingRole, applicationId);
    if (!invitationDetail) {
      return null;
    }

    const invitation = await EmployerInterviewInvitation.findOne({ _id: invitationDetail.id, organizationId: organization._id }).select(
      'interviewId'
    );
    if (!invitation?.interviewId) {
      return null;
    }

    const interview = await Interview.findOne({ _id: invitation.interviewId, organizationId: organization._id });
    if (!interview) {
      return null;
    }

    return this.toAnswersDetail(interview);
  }

  /**
   * POST .../interview-session/evaluate (21D) — triggers question-level
   * evaluation via `HiringAnswerEvaluationService`. INTERVIEWS_MANAGE
   * (a mutation), unlike every other read-only method in this class.
   */
  async evaluateCurrentSession(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    applicationId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id }).select('_id');
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }

    const invitationDetail = await employerInterviewInvitationService.getCurrentInvitation(organizationId, actingRole, applicationId);
    if (!invitationDetail) {
      throw new ApiError(404, 'Interview session not found');
    }

    const invitation = await EmployerInterviewInvitation.findOne({ _id: invitationDetail.id, organizationId: organization._id }).select(
      'interviewId'
    );
    if (!invitation?.interviewId) {
      throw new ApiError(404, 'Interview session not found');
    }

    const interview = await hiringAnswerEvaluationService.evaluate(organizationId, invitation.interviewId.toString());
    return this.toAnswersDetail(interview);
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

  /** Type guard — hiring-assessment interview sessions don't apply to an institute org. */
  private assertIsCompany(organization: IOrganization): void {
    if (organization.type !== OrganizationType.COMPANY) {
      throw new ApiError(400, 'This organization is not a company');
    }
  }

  /** Recruiter-facing safe summary — includes internal employer-domain ids (this endpoint is authenticated org-context, unlike the public candidate response). No mutation, no question/answer content. */
  private toDetail(interview: IInterview): Record<string, unknown> {
    return {
      id: interview._id.toString(),
      status: interview.status,
      candidateId: interview.employerCandidateId?.toString(),
      jobId: interview.employerJobId?.toString(),
      blueprintId: interview.employerBlueprintId?.toString(),
      rubricId: interview.employerRubricId?.toString(),
      createdAt: interview.createdAt,
      completedAt: interview.completedAt,
      updatedAt: interview.updatedAt,
    };
  }

  /** Recruiter-facing question detail (21A) — read-only, includes evaluation metadata never exposed to the candidate. */
  private toQuestionsDetail(interview: IInterview): Record<string, unknown> {
    return {
      sessionId: interview._id.toString(),
      status: interview.status,
      materializationStatus: interview.questionMaterializationStatus ?? (interview.questions.length > 0 ? 'completed' : 'pending'),
      totalQuestions: interview.questions.length,
      questions: interview.questions.map((q, index) => ({
        id: String(index),
        question: q.questionText,
        category: q.questionType,
        difficulty: q.difficulty,
        blueprintSectionId: q.blueprintSectionId,
        competencyNames: q.competencyNames ?? [],
        skillNames: q.skillNames ?? [],
        evaluationIntent: q.evaluationIntent,
        evidenceExpected: q.evidenceExpected ?? [],
        followUpFocus: q.followUpFocus ?? [],
      })),
    };
  }

  /**
   * Recruiter-facing answer detail (21B, extended 21D) — includes the
   * hiring evaluation (rubric score, competency scores, strengths,
   * concerns, evidence summary) once `HiringAnswerEvaluationService` has
   * run. Never exposed to the candidate; that isolation lives entirely in
   * the public service, which never calls this method.
   */
  private toAnswersDetail(interview: IInterview): Record<string, unknown> {
    const totalQuestions = interview.questions.length;
    const answeredQuestions = interview.questions.filter((q) => q.answerText && q.answerText.trim().length > 0).length;
    return {
      sessionId: interview._id.toString(),
      status: interview.status,
      hiringEvaluationStatus: interview.hiringEvaluationStatus ?? (interview.status === 'evaluated' ? 'completed' : 'pending'),
      totalQuestions,
      answeredQuestions,
      questions: interview.questions.map((q, index) => ({
        id: String(index),
        question: q.questionText,
        category: q.questionType,
        difficulty: q.difficulty,
        blueprintSectionId: q.blueprintSectionId,
        answerText: q.answerText,
        answeredAt: q.answeredAt,
        duration: q.duration,
        evaluation: q.evaluation
          ? {
              overallScore: q.evaluation.hiringRubricScore,
              competencyScores: q.evaluation.hiringCompetencyScores ?? [],
              strengths: q.evaluation.strengths ?? [],
              concerns: q.evaluation.weaknesses ?? [],
              evidenceSummary: q.evaluation.hiringEvidenceSummary,
            }
          : undefined,
      })),
    };
  }
}

export const employerInterviewSessionService = new EmployerInterviewSessionService();
