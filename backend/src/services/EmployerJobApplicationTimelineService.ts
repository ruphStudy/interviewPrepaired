import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJobApplication from '../models/EmployerJobApplication.model';
import { EmployerJobApplicationStatus } from '../constants/employerJobApplication';
import EmployerJobApplicationActivity from '../models/EmployerJobApplicationActivity.model';
import EmployerHiringAssessmentFinalization from '../models/EmployerHiringAssessmentFinalization.model';
import OrganizationMember from '../models/OrganizationMember.model';
import { User } from '../models/user.model';
import { OrganizationType } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

interface TimelineItemInternal {
  type: 'application_created' | 'status_changed' | 'assessment_finalized';
  occurredAt: Date;
  actorType: 'member' | 'system';
  actorMembershipId?: string;
  fromStatus?: EmployerJobApplicationStatus;
  toStatus?: EmployerJobApplicationStatus;
  metadata?: Record<string, unknown>;
}

/**
 * Read-only audit/activity timeline for one job application (23C) —
 * combines stored append-only `EmployerJobApplicationActivity` rows with a
 * deterministic `application_created` fallback (for applications that
 * predate activity tracking) and a live-derived `assessment_finalized`
 * milestone from the immutable 22E finalization (never a duplicate stored
 * row). This is audit history only: it never decides pipeline stage,
 * never computes a comparison position, never alters application
 * lifecycle, and is entirely distinct from the 23B pipeline board.
 */
export class EmployerJobApplicationTimelineService {
  async getTimeline(organizationId: string, actingRole: OrganizationMemberRole, applicationId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    // Read-only — an archived application/organization remains readable.
    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id });
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }

    const activities = await EmployerJobApplicationActivity.find({
      organizationId: organization._id,
      applicationId: application._id,
    })
      .sort({ occurredAt: 1 })
      .lean();

    const items: TimelineItemInternal[] = [];

    const hasStoredCreation = activities.some((a) => a.type === 'application_created');
    if (!hasStoredCreation) {
      // Pre-23C application — no stored creation event. Never fabricates a
      // historical actor/status transition; only the one fact we actually
      // know (the application's own `appliedAt`) is used.
      items.push({
        type: 'application_created',
        occurredAt: application.appliedAt,
        actorType: 'system',
      });
    }

    for (const activity of activities) {
      items.push({
        type: activity.type,
        occurredAt: activity.occurredAt,
        actorType: activity.actorType,
        actorMembershipId: activity.actorMembershipId?.toString(),
        fromStatus: activity.fromStatus,
        toStatus: activity.toStatus,
        metadata: activity.metadata,
      });
    }

    // Derived milestone only — NEVER a duplicate stored row. The most
    // recently created finalization for this application is the CURRENT one.
    const finalization = await EmployerHiringAssessmentFinalization.findOne({
      organizationId: organization._id,
      applicationId: application._id,
    }).sort({ createdAt: -1 });
    if (finalization) {
      items.push({
        type: 'assessment_finalized',
        occurredAt: finalization.finalizedAt,
        actorType: 'member',
        actorMembershipId: finalization.finalizedByMembershipId.toString(),
        metadata: {
          overallScore: finalization.snapshot.overallScore,
          competencyCoveragePercent: finalization.snapshot.competencyCoveragePercent,
        },
      });
    }

    items.sort((a, b) => {
      const diff = a.occurredAt.getTime() - b.occurredAt.getTime();
      if (diff !== 0) return diff;
      return a.type.localeCompare(b.type);
    });

    const displayNameByMembershipId = await this.resolveDisplayNames(organization._id, items);

    return {
      applicationId: application._id.toString(),
      currentStatus: application.status,
      timeline: items.map((item) => ({
        type: item.type,
        occurredAt: item.occurredAt,
        actor:
          item.actorType === 'member'
            ? {
                type: 'member' as const,
                membershipId: item.actorMembershipId,
                displayName: item.actorMembershipId ? displayNameByMembershipId.get(item.actorMembershipId) : undefined,
              }
            : { type: 'system' as const },
        fromStatus: item.fromStatus,
        toStatus: item.toStatus,
        metadata: item.metadata,
      })),
    };
  }

  /** Best-effort reviewer/actor display name resolution — a lookup failure (member/user no longer exists) never blocks the timeline; that item simply carries no `displayName`. Never exposes email/contact. */
  private async resolveDisplayNames(organizationId: Types.ObjectId, items: TimelineItemInternal[]): Promise<Map<string, string>> {
    const membershipIds = [...new Set(items.filter((i) => i.actorType === 'member' && i.actorMembershipId).map((i) => i.actorMembershipId!))];
    if (membershipIds.length === 0) {
      return new Map();
    }

    const members = await OrganizationMember.find({
      _id: { $in: membershipIds.map((id) => new Types.ObjectId(id)) },
      organizationId,
    })
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

export const employerJobApplicationTimelineService = new EmployerJobApplicationTimelineService();
export default employerJobApplicationTimelineService;
