import { Types } from 'mongoose';
import Organization from '../models/Organization.model';
import Interview from '../models/interview.model';
import QuestionSet from '../models/QuestionSet.model';
import OrganizationMember from '../models/OrganizationMember.model';
import OrganizationInvitation from '../models/OrganizationInvitation.model';
import { OrganizationType } from '../constants/organization';
import { OrganizationMemberRole, OrganizationMemberStatus } from '../constants/organizationMember';
import { OrganizationInvitationStatus } from '../constants/organizationInvitation';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { InterviewStatus } from '../constants/interview';
import { ApiError } from '../utils/ApiError';

interface DashboardAccessContext {
  role: OrganizationMemberRole;
  permissions: readonly OrganizationPermission[];
  membershipId: string;
}

interface MemberSummary {
  total: number;
  active: number;
  inactive: number;
  byRole: {
    owner: number;
    admin: number;
    trainer: number;
    recruiter: number;
    member: number;
  };
  // number when the caller also has MEMBERS_MANAGE, otherwise explicitly
  // null — pending invitation counts are more sensitive than the rest of
  // the summary and are never included for TRAINER/RECRUITER.
  pendingInvitations: number | null;
}

const RECENT_LIMIT = 5;

/**
 * Read-only, persisted-data-only dashboard snapshot. No AI calls, no member
 * analytics (9C), no usage/cost (9D), no settings mutation (9B) — those are
 * separate, later prompts. Every Interview/QuestionSet query is scoped by
 * `organizationId` only — never `userId`/`ownerUserId`, so personal data
 * never leaks in, and a zero-record organization returns zero counts rather
 * than falling back to anything else.
 */
export class OrganizationDashboardService {
  /**
   * Permission-aware member summary (9C). Returns null outright — zero
   * OrganizationMember/OrganizationInvitation queries — when the caller
   * lacks MEMBERS_VIEW (e.g. MEMBER role), so member data never leaks to a
   * caller who only has ORGANIZATION_VIEW. `pendingInvitations` is only
   * populated when the caller additionally has MEMBERS_MANAGE; otherwise
   * it stays explicit `null` rather than being omitted or leaked.
   */
  private async buildMemberSummary(
    orgObjectId: Types.ObjectId,
    context: DashboardAccessContext
  ): Promise<MemberSummary | null> {
    if (!hasOrganizationPermission(context.role, OrganizationPermission.MEMBERS_VIEW)) {
      return null;
    }

    const [total, active, inactive, owner, admin, trainer, recruiter, member] = await Promise.all([
      OrganizationMember.countDocuments({ organizationId: orgObjectId }),
      OrganizationMember.countDocuments({ organizationId: orgObjectId, status: OrganizationMemberStatus.ACTIVE }),
      OrganizationMember.countDocuments({ organizationId: orgObjectId, status: OrganizationMemberStatus.INACTIVE }),
      OrganizationMember.countDocuments({ organizationId: orgObjectId, role: OrganizationMemberRole.OWNER }),
      OrganizationMember.countDocuments({ organizationId: orgObjectId, role: OrganizationMemberRole.ADMIN }),
      OrganizationMember.countDocuments({ organizationId: orgObjectId, role: OrganizationMemberRole.TRAINER }),
      OrganizationMember.countDocuments({ organizationId: orgObjectId, role: OrganizationMemberRole.RECRUITER }),
      OrganizationMember.countDocuments({ organizationId: orgObjectId, role: OrganizationMemberRole.MEMBER }),
    ]);

    let pendingInvitations: number | null = null;

    if (hasOrganizationPermission(context.role, OrganizationPermission.MEMBERS_MANAGE)) {
      // Lazily flip stale PENDING invitations to EXPIRED before counting —
      // one updateMany, no loop/save — mirroring 8E's existing lazy
      // expiration semantics so an expired-but-still-PENDING row is never
      // counted as pending.
      await OrganizationInvitation.updateMany(
        {
          organizationId: orgObjectId,
          status: OrganizationInvitationStatus.PENDING,
          expiresAt: { $lte: new Date() },
        },
        { $set: { status: OrganizationInvitationStatus.EXPIRED } }
      );

      pendingInvitations = await OrganizationInvitation.countDocuments({
        organizationId: orgObjectId,
        status: OrganizationInvitationStatus.PENDING,
      });
    }

    return {
      total,
      active,
      inactive,
      byRole: { owner, admin, trainer, recruiter, member },
      pendingInvitations,
    };
  }

  async getDashboard(organizationId: string, context: DashboardAccessContext): Promise<Record<string, unknown>> {
    const organization = await Organization.findById(organizationId).lean();
    if (!organization) {
      throw new ApiError(404, 'Organization not found');
    }

    const orgObjectId = new Types.ObjectId(organizationId);

    const [
      totalInterviews,
      inProgressInterviews,
      completedInterviews,
      totalQuestionSets,
      recentInterviews,
      recentQuestionSets,
      memberSummary,
    ] = await Promise.all([
      Interview.countDocuments({ organizationId: orgObjectId }),
      Interview.countDocuments({ organizationId: orgObjectId, status: InterviewStatus.IN_PROGRESS }),
      Interview.countDocuments({
        organizationId: orgObjectId,
        status: { $in: [InterviewStatus.COMPLETED, InterviewStatus.EVALUATED] },
      }),
      QuestionSet.countDocuments({ organizationId: orgObjectId }),
      Interview.find({ organizationId: orgObjectId })
        .select('topic status createdAt updatedAt')
        .sort({ createdAt: -1 })
        .limit(RECENT_LIMIT)
        .lean(),
      QuestionSet.find({ organizationId: orgObjectId })
        .select('name source createdAt updatedAt')
        .sort({ createdAt: -1 })
        .limit(RECENT_LIMIT)
        .lean(),
      this.buildMemberSummary(orgObjectId, context),
    ]);

    return {
      organization: {
        id: organization._id.toString(),
        name: organization.name,
        slug: organization.slug,
        type: organization.type,
        status: organization.status,
        logoUrl: organization.logoUrl,
        description: organization.description,
        instituteProfile: organization.type === OrganizationType.INSTITUTE ? organization.instituteProfile : undefined,
        companyProfile: organization.type === OrganizationType.COMPANY ? organization.companyProfile : undefined,
      },
      access: {
        membershipId: context.membershipId,
        role: context.role,
        permissions: context.permissions,
      },
      interviews: {
        total: totalInterviews,
        inProgress: inProgressInterviews,
        completed: completedInterviews,
      },
      questionSets: {
        total: totalQuestionSets,
      },
      memberSummary,
      recentActivity: {
        recentInterviews: recentInterviews.map((interview) => ({
          id: interview._id.toString(),
          topic: interview.topic,
          status: interview.status,
          createdAt: interview.createdAt,
          updatedAt: interview.updatedAt,
        })),
        recentQuestionSets: recentQuestionSets.map((questionSet) => ({
          id: questionSet._id.toString(),
          name: questionSet.name,
          source: questionSet.source,
          createdAt: questionSet.createdAt,
          updatedAt: questionSet.updatedAt,
        })),
      },
    };
  }
}

export const organizationDashboardService = new OrganizationDashboardService();
