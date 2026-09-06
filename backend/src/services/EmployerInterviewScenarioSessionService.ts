import Organization, { IOrganization } from '../models/Organization.model';
import Interview from '../models/interview.model';
import { InterviewPurpose } from '../constants/interview';
import EmployerInterviewScenario from '../models/EmployerInterviewScenario.model';
import EmployerInterviewScenarioQuestionSet from '../models/EmployerInterviewScenarioQuestionSet.model';
import EmployerInterviewScenarioSession, { IEmployerInterviewScenarioSession } from '../models/EmployerInterviewScenarioSession.model';
import { OrganizationType } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

/**
 * Employer-internal, READ-ONLY view of a candidate's 28D scenario session
 * progress + submitted responses — never mutates the session, never
 * triggers 28C evaluation while rendering.
 */
export class EmployerInterviewScenarioSessionService {
  /** GET .../scenarios/:scenarioId/session — requires ORGANIZATION_VIEW. */
  async getSessionDetail(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    interviewId: string,
    scenarioId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id }).select('_id purpose');
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }
    const scenario = await EmployerInterviewScenario.findOne({ _id: scenarioId, organizationId: organization._id, interviewId: interview._id }).select(
      '_id'
    );
    if (!scenario) {
      throw new ApiError(404, 'Scenario not found');
    }

    const questionSet = await EmployerInterviewScenarioQuestionSet.findOne({ organizationId: organization._id, scenarioId: scenario._id })
      .select('status questions')
      .lean();
    const totalQuestions = questionSet?.questions?.length ?? 0;

    const session = await EmployerInterviewScenarioSession.findOne({
      organizationId: organization._id,
      interviewId: interview._id,
      scenarioId: scenario._id,
    });
    if (!session) {
      return { started: false, status: 'not_started', progress: { current: 0, total: totalQuestions }, responses: [] };
    }

    return this.toDetail(session, totalQuestions);
  }

  private toDetail(session: IEmployerInterviewScenarioSession, totalQuestions: number): Record<string, unknown> {
    return {
      started: true,
      status: session.status,
      progress: { current: session.status === 'completed' ? totalQuestions : session.currentSequence, total: totalQuestions },
      responses: session.responses.map((r) => ({
        questionSequence: r.questionSequence,
        questionTextSnapshot: r.questionTextSnapshot,
        scenarioUpdateSnapshot: r.scenarioUpdateSnapshot,
        answerText: r.answerText,
        answeredAt: r.answeredAt,
        durationSeconds: r.durationSeconds,
      })),
      startedAt: session.startedAt,
      completedAt: session.completedAt,
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
}

export const employerInterviewScenarioSessionService = new EmployerInterviewScenarioSessionService();
export default employerInterviewScenarioSessionService;
