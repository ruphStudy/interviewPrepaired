import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJobApplication from '../models/EmployerJobApplication.model';
import { EmployerJobApplicationStatus } from '../constants/employerJobApplication';
import EmployerJobApplicationCollaborator from '../models/EmployerJobApplicationCollaborator.model';
import { EmployerJobApplicationCollaborationRole } from '../constants/employerJobApplicationCollaboration';
import { employerCollaborationNotificationService } from './EmployerCollaborationNotificationService';
import OrganizationMember from '../models/OrganizationMember.model';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole, OrganizationMemberStatus } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

/**
 * Application-local collaborator assignment (24B) — collaboration
 * metadata ONLY. `collaborationRole` is never used as an RBAC permission
 * and never grants organization access; the acting caller's real
 * `OrganizationPermission`s remain the sole authority for every mutation
 * here. Never changes application.status, never affects assessment
 * artifacts.
 */
export class EmployerJobApplicationCollaborationService {
  /** GET .../applications/:applicationId/collaborators — requires ORGANIZATION_VIEW. Read-only; an archived application/organization remains readable. */
  async getCollaborators(organizationId: string, actingRole: OrganizationMemberRole, applicationId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id }).select('_id');
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }

    const rows = await EmployerJobApplicationCollaborator.find({ organizationId: organization._id, applicationId: application._id })
      .populate({ path: 'membershipId', select: 'role status userId', populate: { path: 'userId', select: 'name' } })
      .sort({ createdAt: -1 })
      .lean();

    const availableMembers = await OrganizationMember.find({
      organizationId: organization._id,
      status: OrganizationMemberStatus.ACTIVE,
    })
      .select('role userId')
      .populate('userId', 'name')
      .lean();

    return {
      collaborators: rows.map((row: any) => this.toDetail(row)),
      availableMembers: availableMembers.map((member: any) => ({
        membershipId: member._id.toString(),
        displayName: member.userId?.name,
        role: member.role,
      })),
    };
  }

  /** POST/PUT .../applications/:applicationId/collaborators — requires INTERVIEWS_MANAGE. Upserts one collaborator assignment. `assignedByMembershipId` is always the ACTING organization context's own membership. */
  async assignCollaborator(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    assignedByMembershipId: string,
    applicationId: string,
    fields: { membershipId?: string; collaborationRole?: EmployerJobApplicationCollaborationRole }
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);

    if (!fields.membershipId) {
      throw new ApiError(400, 'membershipId is required');
    }
    if (!fields.collaborationRole || !Object.values(EmployerJobApplicationCollaborationRole).includes(fields.collaborationRole)) {
      throw new ApiError(400, 'A valid collaborationRole is required');
    }

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id });
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }
    this.assertApplicationMutable(application.status);

    // Critical member validation: must be an EXISTING, same-organization,
    // ACTIVE OrganizationMember — never a userId, never created here.
    const member = await OrganizationMember.findOne({
      _id: fields.membershipId,
      organizationId: organization._id,
      status: OrganizationMemberStatus.ACTIVE,
    }).select('_id');
    if (!member) {
      throw new ApiError(404, 'Organization member not found');
    }

    // Existence checked BEFORE the upsert so we know whether this is a
    // brand-new assignment — a notification is only ever created for a
    // NEW assignment, never merely for a role update.
    const existing = await EmployerJobApplicationCollaborator.findOne({
      organizationId: organization._id,
      applicationId: application._id,
      membershipId: member._id,
    }).select('_id');
    const isNewAssignment = !existing;

    const row = await EmployerJobApplicationCollaborator.findOneAndUpdate(
      { organizationId: organization._id, applicationId: application._id, membershipId: member._id },
      {
        $set: { collaborationRole: fields.collaborationRole },
        $setOnInsert: {
          jobId: application.jobId,
          candidateId: application.candidateId,
          assignedByMembershipId: new Types.ObjectId(assignedByMembershipId),
        },
      },
      { new: true, upsert: true }
    );

    if (isNewAssignment) {
      // Notification write is secondary — never fails/undoes the already-created assignment.
      try {
        await employerCollaborationNotificationService.createCollaboratorAssignedNotification({
          organizationId: organization._id,
          applicationId: application._id as Types.ObjectId,
          jobId: application.jobId,
          candidateId: application.candidateId,
          collaboratorAssignmentId: row!._id as Types.ObjectId,
          recipientMembershipId: member._id as Types.ObjectId,
          assignerMembershipId: new Types.ObjectId(assignedByMembershipId),
        });
      } catch (error) {
        console.error('[EmployerJobApplicationCollaborationService] Failed to create assignment notification (non-fatal)', error);
      }
    }

    return this.toDetail(await this.populateRow(row!._id as Types.ObjectId));
  }

  /** DELETE .../applications/:applicationId/collaborators/:membershipId — requires INTERVIEWS_MANAGE. Removes only the assignment row — never the underlying OrganizationMember. */
  async removeCollaborator(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    applicationId: string,
    membershipId: string
  ): Promise<void> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id }).select('_id status');
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }
    this.assertApplicationMutable(application.status);

    const result = await EmployerJobApplicationCollaborator.deleteOne({
      organizationId: organization._id,
      applicationId: application._id,
      membershipId,
    });
    if (result.deletedCount === 0) {
      throw new ApiError(404, 'Collaborator assignment not found');
    }
  }

  private async populateRow(id: Types.ObjectId): Promise<any> {
    return EmployerJobApplicationCollaborator.findById(id)
      .populate({ path: 'membershipId', select: 'role status userId', populate: { path: 'userId', select: 'name' } })
      .lean();
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

  private assertApplicationMutable(status: EmployerJobApplicationStatus): void {
    if (status === EmployerJobApplicationStatus.ARCHIVED) {
      throw new ApiError(400, 'This application is archived and read-only');
    }
  }

  /** Never exposes auth/security internals — only name (from User) and role/status (from OrganizationMember). */
  private toDetail(row: any): Record<string, unknown> {
    const member = row.membershipId && typeof row.membershipId === 'object' ? row.membershipId : null;
    const user = member?.userId && typeof member.userId === 'object' ? member.userId : null;
    return {
      membershipId: (member?._id ?? row.membershipId).toString(),
      collaborationRole: row.collaborationRole,
      displayName: user?.name,
      assignedByMembershipId: row.assignedByMembershipId.toString(),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

export const employerJobApplicationCollaborationService = new EmployerJobApplicationCollaborationService();
export default employerJobApplicationCollaborationService;
