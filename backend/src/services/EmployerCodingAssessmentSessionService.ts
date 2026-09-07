import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import Interview, { IInterview } from '../models/interview.model';
import { InterviewPurpose } from '../constants/interview';
import EmployerCodingQuestion from '../models/EmployerCodingQuestion.model';
import EmployerCodingAssessmentSession, { IEmployerCodingAssessmentSession } from '../models/EmployerCodingAssessmentSession.model';
import EmployerCodingSubmission from '../models/EmployerCodingSubmission.model';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

export const CODING_SESSION_VERSION = 'coding-assessment-session-v1';
const MIN_QUESTIONS = 1;
const MAX_QUESTIONS = 5;

/**
 * Employer-internal coding-assessment session management (30B) — attaches a
 * fixed set of READY `EmployerCodingQuestion`s to one exact hiring
 * interview. NO execution, NO AI. Once the candidate has started
 * (`status` past `not_started`), the question list is immutable.
 */
export class EmployerCodingAssessmentSessionService {
  /** POST .../interviews/:interviewId/coding-session — requires INTERVIEWS_MANAGE. Controlled update allowed only before the candidate starts. */
  async createOrUpdateSession(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    interviewId: string,
    codingQuestionIds: string[]
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const interview = await this.loadInterview(organization, interviewId);

    const uniqueIds = Array.from(new Set(codingQuestionIds));
    if (uniqueIds.length < MIN_QUESTIONS || uniqueIds.length > MAX_QUESTIONS) {
      throw new ApiError(400, `Select between ${MIN_QUESTIONS} and ${MAX_QUESTIONS} coding questions.`);
    }
    if (uniqueIds.length !== codingQuestionIds.length) {
      throw new ApiError(400, 'Duplicate coding question IDs are not allowed.');
    }

    const questions = await EmployerCodingQuestion.find({ _id: { $in: uniqueIds }, organizationId: organization._id });
    if (questions.length !== uniqueIds.length) {
      throw new ApiError(404, 'One or more coding questions were not found.');
    }
    const notReady = questions.filter((q) => q.status !== 'ready');
    if (notReady.length > 0) {
      throw new ApiError(400, 'All selected coding questions must be status "ready".');
    }

    const existing = await EmployerCodingAssessmentSession.findOne({ organizationId: organization._id, interviewId: interview._id });
    if (existing) {
      if (existing.status !== 'not_started') {
        throw new ApiError(409, 'The candidate has already started this coding assessment; the question list can no longer be changed.');
      }
      existing.questionIds = uniqueIds.map((id) => new Types.ObjectId(id));
      await existing.save();
      return this.toEmployerDetail(existing);
    }

    if (!interview.employerApplicationId || !interview.employerJobId) {
      throw new ApiError(409, 'This interview is not linked to a hiring application/job.');
    }

    const created = await EmployerCodingAssessmentSession.create({
      organizationId: organization._id,
      applicationId: interview.employerApplicationId,
      jobId: interview.employerJobId,
      interviewId: interview._id,
      sessionVersion: CODING_SESSION_VERSION,
      status: 'not_started',
      questionIds: uniqueIds.map((id) => new Types.ObjectId(id)),
      currentQuestionIndex: 0,
    });

    return this.toEmployerDetail(created);
  }

  /** GET .../interviews/:interviewId/coding-session — requires ORGANIZATION_VIEW. Read-only; never creates. */
  async getSession(organizationId: string, actingRole: OrganizationMemberRole, interviewId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    const interview = await this.loadInterview(organization, interviewId);

    const session = await EmployerCodingAssessmentSession.findOne({ organizationId: organization._id, interviewId: interview._id });
    if (!session) {
      return { configured: false };
    }
    return this.toEmployerDetail(session);
  }

  private async loadInterview(organization: IOrganization, interviewId: string): Promise<IInterview> {
    const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id });
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }
    return interview;
  }

  /** Employer-facing detail — may include source code/submission metadata (never candidate-restricted here; this is the employer read path). */
  private async toEmployerDetail(session: IEmployerCodingAssessmentSession): Promise<Record<string, unknown>> {
    const questions = await EmployerCodingQuestion.find({ _id: { $in: session.questionIds } }).select('_id title difficulty supportedLanguages');
    const questionById = new Map(questions.map((q) => [q._id.toString(), q]));

    const submissions = await EmployerCodingSubmission.find({ organizationId: session.organizationId, codingSessionId: session._id }).sort({
      codingQuestionId: 1,
      attemptNumber: 1,
    });

    const submissionsByQuestion = new Map<string, typeof submissions>();
    for (const submission of submissions) {
      const key = submission.codingQuestionId.toString();
      const list = submissionsByQuestion.get(key) ?? [];
      list.push(submission);
      submissionsByQuestion.set(key, list);
    }

    const questionSummaries = session.questionIds.map((id) => {
      const question = questionById.get(id.toString());
      const questionSubmissions = (submissionsByQuestion.get(id.toString()) ?? []).filter((s) => s.status !== 'draft');
      return {
        codingQuestionId: id.toString(),
        title: question?.title ?? 'Unknown question',
        difficulty: question?.difficulty,
        supportedLanguages: question?.supportedLanguages ?? [],
        submissions: questionSubmissions.map((s) => ({
          id: s._id.toString(),
          attemptNumber: s.attemptNumber,
          language: s.language,
          sourceCode: s.sourceCode,
          status: s.status,
          submittedAt: s.submittedAt,
        })),
      };
    });

    return {
      configured: true,
      sessionVersion: session.sessionVersion,
      status: session.status,
      totalQuestions: session.questionIds.length,
      currentQuestionIndex: session.currentQuestionIndex,
      startedAt: session.startedAt,
      submittedAt: session.submittedAt,
      completedAt: session.completedAt,
      questions: questionSummaries,
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

export const employerCodingAssessmentSessionService = new EmployerCodingAssessmentSessionService();
export default employerCodingAssessmentSessionService;
