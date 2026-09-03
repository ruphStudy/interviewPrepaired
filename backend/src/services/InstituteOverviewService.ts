import { Types } from 'mongoose';
import InstituteBranch from '../models/InstituteBranch.model';
import InstituteCourse from '../models/InstituteCourse.model';
import { InstituteBranchStatus } from '../constants/instituteBranch';
import { InstituteCourseStatus } from '../constants/instituteCourse';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { organizationService } from './OrganizationService';

/**
 * Institute-domain overview (10D): combines the existing institute profile
 * (10A) with lightweight branch (10B) and course (10C) counts. Deliberately
 * reuses organizationService.getInstituteProfileTrusted for the
 * organization/profile portion — the ORGANIZATION_VIEW permission check,
 * the institute type-guard (400 for a COMPANY org), the "org not found"
 * 404, and archived-org-readable behavior are already correct there; this
 * service only adds count aggregations on top, scoped to the exact same
 * organizationId. Never fetches full branch/course lists — countDocuments only.
 */
export class InstituteOverviewService {
  async getOverview(organizationId: string, actingRole: OrganizationMemberRole): Promise<Record<string, unknown>> {
    const { organization, profile }: any = await organizationService.getInstituteProfileTrusted(organizationId, actingRole);

    const orgObjectId = new Types.ObjectId(organizationId);

    const [
      branchesTotal,
      branchesActive,
      branchesInactive,
      coursesTotal,
      coursesActive,
      coursesInactive,
      coursesAssignedToBranch,
    ] = await Promise.all([
      InstituteBranch.countDocuments({ organizationId: orgObjectId }),
      InstituteBranch.countDocuments({ organizationId: orgObjectId, status: InstituteBranchStatus.ACTIVE }),
      InstituteBranch.countDocuments({ organizationId: orgObjectId, status: InstituteBranchStatus.INACTIVE }),
      InstituteCourse.countDocuments({ organizationId: orgObjectId }),
      InstituteCourse.countDocuments({ organizationId: orgObjectId, status: InstituteCourseStatus.ACTIVE }),
      InstituteCourse.countDocuments({ organizationId: orgObjectId, status: InstituteCourseStatus.INACTIVE }),
      // A course's branchId is $unset (never stored as null) when cleared —
      // $exists is the correct "has a branch" condition.
      InstituteCourse.countDocuments({ organizationId: orgObjectId, branchId: { $exists: true } }),
    ]);

    return {
      organization,
      profile,
      branches: {
        total: branchesTotal,
        active: branchesActive,
        inactive: branchesInactive,
      },
      courses: {
        total: coursesTotal,
        active: coursesActive,
        inactive: coursesInactive,
        assignedToBranch: coursesAssignedToBranch,
        // Reuses the already-computed total instead of a second, duplicate query.
        unassigned: Math.max(0, coursesTotal - coursesAssignedToBranch),
      },
    };
  }
}

export const instituteOverviewService = new InstituteOverviewService();
