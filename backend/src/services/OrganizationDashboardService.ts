import { Types } from 'mongoose';
import Organization from '../models/Organization.model';
import Interview from '../models/interview.model';
import QuestionSet from '../models/QuestionSet.model';
import { OrganizationType } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission } from '../constants/organizationPermissions';
import { InterviewStatus } from '../constants/interview';
import { ApiError } from '../utils/ApiError';

interface DashboardAccessContext {
  role: OrganizationMemberRole;
  permissions: readonly OrganizationPermission[];
  membershipId: string;
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
