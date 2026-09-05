import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerCandidate from '../models/EmployerCandidate.model';
import EmployerJobApplicationCollaborator from '../models/EmployerJobApplicationCollaborator.model';
import EmployerCollaborationNotification from '../models/EmployerCollaborationNotification.model';
import OrganizationMember from '../models/OrganizationMember.model';
import { User } from '../models/user.model';
import { OrganizationType } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

/**
 * In-app-only employer collaboration notification center (24C) — no
 * email/SMS/WhatsApp/push, no delivery infrastructure. The two "create"
 * methods are internal (called only from EmployerJobApplicationNoteService
 * / EmployerJobApplicationCollaborationService after their own write has
 * already succeeded) and NEVER throw — a notification-write failure is
 * logged and swallowed, never undoing the source note/collaborator
 * assignment. Read methods always scope to the ACTING organization
 * membership as recipient — never another member's notifications.
 */
export class EmployerCollaborationNotificationService {
  /** Called after a 24A/24B note successfully persists. Never notifies the author for mentioning themselves; duplicate/concurrent creates are deduped via the model's own unique index. */
  async createNoteMentionNotifications(params: {
    organizationId: Types.ObjectId;
    applicationId: Types.ObjectId;
    jobId: Types.ObjectId;
    candidateId: Types.ObjectId;
    noteId: Types.ObjectId;
    authorMembershipId: Types.ObjectId;
    mentionMembershipIds: Types.ObjectId[];
  }): Promise<void> {
    for (const recipientId of params.mentionMembershipIds) {
      if (recipientId.toString() === params.authorMembershipId.toString()) continue; // never notify self
      await this.safeCreate({
        organizationId: params.organizationId,
        recipientMembershipId: recipientId,
        type: 'note_mention',
        applicationId: params.applicationId,
        jobId: params.jobId,
        candidateId: params.candidateId,
        sourceId: params.noteId,
        actorMembershipId: params.authorMembershipId,
      });
    }
  }

  /** Called after a 24B collaborator assignment is NEWLY created (never on a role-only update of an existing assignment). Never notifies the assigner for assigning themselves. */
  async createCollaboratorAssignedNotification(params: {
    organizationId: Types.ObjectId;
    applicationId: Types.ObjectId;
    jobId: Types.ObjectId;
    candidateId: Types.ObjectId;
    collaboratorAssignmentId: Types.ObjectId;
    recipientMembershipId: Types.ObjectId;
    assignerMembershipId: Types.ObjectId;
  }): Promise<void> {
    if (params.recipientMembershipId.toString() === params.assignerMembershipId.toString()) return; // never notify self
    await this.safeCreate({
      organizationId: params.organizationId,
      recipientMembershipId: params.recipientMembershipId,
      type: 'collaborator_assigned',
      applicationId: params.applicationId,
      jobId: params.jobId,
      candidateId: params.candidateId,
      sourceId: params.collaboratorAssignmentId,
      actorMembershipId: params.assignerMembershipId,
    });
  }

  /** Best-effort create — a duplicate (E11000) or any other failure is logged and swallowed, never thrown, so the caller's already-successful write is never affected. */
  private async safeCreate(doc: {
    organizationId: Types.ObjectId;
    recipientMembershipId: Types.ObjectId;
    type: 'note_mention' | 'collaborator_assigned';
    applicationId: Types.ObjectId;
    jobId: Types.ObjectId;
    candidateId: Types.ObjectId;
    sourceId: Types.ObjectId;
    actorMembershipId: Types.ObjectId;
  }): Promise<void> {
    try {
      await EmployerCollaborationNotification.create(doc);
    } catch (error: any) {
      if (error?.code !== 11000) {
        console.error('[EmployerCollaborationNotificationService] Failed to create notification (non-fatal)', error);
      }
    }
  }

  /** GET .../collaboration/notifications — requires ORGANIZATION_VIEW. Recipient is always the ACTING membership. */
  async listNotifications(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    actingMembershipId: string,
    page: number,
    limit: number,
    unreadOnly: boolean
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const recipientObjectId = new Types.ObjectId(actingMembershipId);
    const filter: Record<string, unknown> = { organizationId: organization._id, recipientMembershipId: recipientObjectId };
    if (unreadOnly) {
      filter.readAt = { $exists: false };
    }

    const skip = (page - 1) * limit;
    const [rows, total, unreadCount] = await Promise.all([
      EmployerCollaborationNotification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      EmployerCollaborationNotification.countDocuments(filter),
      EmployerCollaborationNotification.countDocuments({
        organizationId: organization._id,
        recipientMembershipId: recipientObjectId,
        readAt: { $exists: false },
      }),
    ]);

    if (rows.length === 0) {
      return { notifications: [], unreadCount, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
    }

    const candidateIds = [...new Set(rows.map((r) => r.candidateId.toString()))].map((id) => new Types.ObjectId(id));
    const actorMembershipIds = rows.map((r) => r.actorMembershipId.toString());
    const collaboratorSourceIds = rows.filter((r) => r.type === 'collaborator_assigned').map((r) => r.sourceId);

    const [candidates, displayNames, collaboratorRows] = await Promise.all([
      EmployerCandidate.find({ organizationId: organization._id, _id: { $in: candidateIds } }).select('firstName lastName').lean(),
      this.resolveDisplayNames(organization._id, actorMembershipIds),
      collaboratorSourceIds.length > 0
        ? EmployerJobApplicationCollaborator.find({ organizationId: organization._id, _id: { $in: collaboratorSourceIds } })
            .select('_id collaborationRole')
            .lean()
        : Promise.resolve([]),
    ]);
    const candidateById = new Map(candidates.map((c) => [c._id.toString(), c]));
    const collaborationRoleBySourceId = new Map(collaboratorRows.map((c) => [c._id.toString(), c.collaborationRole]));

    return {
      notifications: rows.map((r) => {
        const candidate = candidateById.get(r.candidateId.toString());
        const actorId = r.actorMembershipId.toString();
        const context: Record<string, unknown> =
          r.type === 'note_mention'
            ? { noteId: r.sourceId.toString() }
            : { collaborationRole: collaborationRoleBySourceId.get(r.sourceId.toString()) };

        return {
          id: r._id.toString(),
          type: r.type,
          read: Boolean(r.readAt),
          createdAt: r.createdAt,
          actor: { membershipId: actorId, displayName: displayNames.get(actorId) },
          applicationId: r.applicationId.toString(),
          jobId: r.jobId.toString(),
          candidate: candidate
            ? { id: candidate._id.toString(), firstName: candidate.firstName, lastName: candidate.lastName }
            : { id: r.candidateId.toString() },
          context,
        };
      }),
      unreadCount,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  /** PATCH .../notifications/:notificationId/read — requires ORGANIZATION_VIEW. Exact {organizationId, recipientMembershipId, notificationId} only. Idempotent — an already-read notification is returned as-is, readAt never overwritten. */
  async markRead(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    actingMembershipId: string,
    notificationId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const notification = await EmployerCollaborationNotification.findOne({
      _id: notificationId,
      organizationId: organization._id,
      recipientMembershipId: new Types.ObjectId(actingMembershipId),
    });
    if (!notification) {
      throw new ApiError(404, 'Notification not found');
    }

    if (!notification.readAt) {
      notification.readAt = new Date();
      await notification.save();
    }

    return { id: notification._id.toString(), read: true, readAt: notification.readAt };
  }

  /** POST .../notifications/read-all — requires ORGANIZATION_VIEW. Only the ACTING membership's own unread notifications. */
  async markAllRead(organizationId: string, actingRole: OrganizationMemberRole, actingMembershipId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const result = await EmployerCollaborationNotification.updateMany(
      {
        organizationId: organization._id,
        recipientMembershipId: new Types.ObjectId(actingMembershipId),
        readAt: { $exists: false },
      },
      { $set: { readAt: new Date() } }
    );

    return { updatedCount: result.modifiedCount };
  }

  /** Best-effort display-name resolution — a lookup failure (member/user no longer exists) never blocks the response; that notification's actor simply carries no `displayName`. Never exposes email/contact. */
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
}

export const employerCollaborationNotificationService = new EmployerCollaborationNotificationService();
export default employerCollaborationNotificationService;
