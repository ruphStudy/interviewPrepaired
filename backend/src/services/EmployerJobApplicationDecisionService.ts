import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJobApplication from '../models/EmployerJobApplication.model';
import { EmployerJobApplicationStatus } from '../constants/employerJobApplication';
import EmployerJobApplicationDecision, {
  IEmployerJobApplicationDecision,
  EmployerJobApplicationDecisionType,
  EmployerJobApplicationDecisionReasonCode,
  EMPLOYER_JOB_APPLICATION_DECISION_TYPES,
  EMPLOYER_JOB_APPLICATION_DECISION_REASON_CODES,
} from '../models/EmployerJobApplicationDecision.model';
import OrganizationMember from '../models/OrganizationMember.model';
import { User } from '../models/user.model';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const MAX_NOTES_LENGTH = 2000;

/**
 * Append-only, HUMAN-entered decision/reason log for one job application
 * (23E) — audit labels only, never a hiring recommendation, never a
 * lifecycle status write. `EmployerJobApplicationService.updateApplicationStatus`
 * remains the ONLY way `application.status` changes; creating a decision
 * row here never touches it, and moving lifecycle status never
 * auto-creates a row here — the two are deliberately separate operations.
 */
export class EmployerJobApplicationDecisionService {
  /** POST .../applications/:applicationId/decisions — requires INTERVIEWS_MANAGE. `createdByMembershipId` is always the ACTING organization context's own membership — never accepted from the request body. */
  async createDecision(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    actingMembershipId: string,
    applicationId: string,
    decisionType: unknown,
    reasonCode: unknown,
    notes: unknown
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);

    if (typeof decisionType !== 'string' || !EMPLOYER_JOB_APPLICATION_DECISION_TYPES.includes(decisionType as EmployerJobApplicationDecisionType)) {
      throw new ApiError(400, 'A valid decisionType is required');
    }
    if (
      typeof reasonCode !== 'string' ||
      !EMPLOYER_JOB_APPLICATION_DECISION_REASON_CODES.includes(reasonCode as EmployerJobApplicationDecisionReasonCode)
    ) {
      throw new ApiError(400, 'A valid reasonCode is required');
    }
    if (notes !== undefined && typeof notes !== 'string') {
      throw new ApiError(400, 'notes must be a string');
    }

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id });
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }
    this.assertApplicationMutable(application.status);

    const trimmedNotes = typeof notes === 'string' ? notes.trim().slice(0, MAX_NOTES_LENGTH) : undefined;

    const decision = await EmployerJobApplicationDecision.create({
      organizationId: organization._id,
      applicationId: application._id,
      jobId: application.jobId,
      candidateId: application.candidateId,
      decisionType: decisionType as EmployerJobApplicationDecisionType,
      reasonCode: reasonCode as EmployerJobApplicationDecisionReasonCode,
      notes: trimmedNotes || undefined,
      applicationStatusAtDecision: application.status,
      createdByMembershipId: new Types.ObjectId(actingMembershipId),
    });

    const displayNames = await this.resolveDisplayNames(organization._id, [actingMembershipId]);
    return this.toDetail(decision, displayNames);
  }

  /** GET .../applications/:applicationId/decisions — requires ORGANIZATION_VIEW. Read-only; an archived application remains readable. */
  async getDecisions(organizationId: string, actingRole: OrganizationMemberRole, applicationId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id }).select('_id');
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }

    const decisions = await EmployerJobApplicationDecision.find({
      organizationId: organization._id,
      applicationId: application._id,
    }).sort({ createdAt: -1 });

    const displayNames = await this.resolveDisplayNames(
      organization._id,
      decisions.map((d) => d.createdByMembershipId.toString())
    );

    return { decisions: decisions.map((d) => this.toDetail(d, displayNames)) };
  }

  /** Best-effort display-name resolution — a lookup failure (member/user no longer exists) never blocks the response; that decision simply carries no `displayName`. Never exposes email/contact. */
  private async resolveDisplayNames(organizationId: Types.ObjectId, membershipIds: string[]): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(membershipIds)];
    if (uniqueIds.length === 0) {
      return new Map();
    }

    const members = await OrganizationMember.find({ _id: { $in: uniqueIds.map((id) => new Types.ObjectId(id)) }, organizationId })
      .select('_id userId')
      .lean();
    if (members.length === 0) {
      return new Map();
    }

    const userIds = [...new Set(members.map((m) => m.userId.toString()))].map((id) => new Types.ObjectId(id));
    const users = await User.find({ _id: { $in: userIds } }).select('_id name').lean();
    const nameByUserId = new Map(users.map((u) => [u._id.toString(), u.name]));

    const nameByMembershipId = new Map<string, string>();
    for (const member of members) {
      const name = nameByUserId.get(member.userId.toString());
      if (name) {
        nameByMembershipId.set(member._id.toString(), name);
      }
    }
    return nameByMembershipId;
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

  /** Mirrors EmployerJobApplicationService's own guard exactly — an archived application is read-only. */
  private assertApplicationMutable(status: EmployerJobApplicationStatus): void {
    if (status === EmployerJobApplicationStatus.ARCHIVED) {
      throw new ApiError(400, 'This application is archived and read-only');
    }
  }

  private toDetail(decision: IEmployerJobApplicationDecision, displayNames: Map<string, string>): Record<string, unknown> {
    const membershipId = decision.createdByMembershipId.toString();
    return {
      id: decision._id.toString(),
      decisionType: decision.decisionType,
      reasonCode: decision.reasonCode,
      notes: decision.notes,
      applicationStatusAtDecision: decision.applicationStatusAtDecision,
      createdAt: decision.createdAt,
      createdBy: {
        membershipId,
        displayName: displayNames.get(membershipId),
      },
    };
  }
}

export const employerJobApplicationDecisionService = new EmployerJobApplicationDecisionService();
export default employerJobApplicationDecisionService;
