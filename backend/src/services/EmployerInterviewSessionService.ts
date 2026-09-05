import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJobApplication from '../models/EmployerJobApplication.model';
import EmployerInterviewInvitation from '../models/EmployerInterviewInvitation.model';
import { employerInterviewInvitationService } from './EmployerInterviewInvitationService';
import Interview, { IInterview } from '../models/interview.model';
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
}

export const employerInterviewSessionService = new EmployerInterviewSessionService();
