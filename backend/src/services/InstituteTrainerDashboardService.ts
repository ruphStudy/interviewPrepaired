import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import InstituteStudent from '../models/InstituteStudent.model';
import InstituteTrainerAssignment from '../models/InstituteTrainerAssignment.model';
import InstituteStudentInterviewAssignment from '../models/InstituteStudentInterviewAssignment.model';
import InstituteInterviewTemplate from '../models/InstituteInterviewTemplate.model';
import { InstituteStudentStatus } from '../constants/instituteStudent';
import { InstituteStudentInterviewAssignmentStatus } from '../constants/instituteStudentInterviewAssignment';
import { OrganizationType } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const MAX_RECENT_ACTIVITY = 10;

interface RecentActivityRow {
  assignmentId: string;
  student: { id: string; firstName: string; lastName?: string; enrollmentNumber?: string };
  templateId: string;
  templateName: string | null;
  status: InstituteStudentInterviewAssignmentStatus;
  dueAt?: Date;
  interviewId?: string;
  createdAt: Date;
}

interface TrainerDashboard {
  summary: {
    assignedCourses: number;
    assignedBatches: number;
    totalStudents: number;
    totalInterviewAssignments: number;
    pending: number;
    inProgress: number;
    completed: number;
    overdue: number;
  };
  recentActivity: RecentActivityRow[];
}

/**
 * Institute trainer dashboard (14A) — read-only, scoped strictly to the
 * CALLING trainer's own InstituteTrainerAssignment rows (course/batch).
 * `trainerMembershipId` is always `organizationContext.member._id` — never
 * accepted from query/body, and never another member's id (an OWNER/ADMIN
 * cannot impersonate a trainer here; only an actual TRAINER role may call
 * this). No report/answer/evaluation content — summary counts and a safe
 * recent-activity list only. Student report detail (14B), batch analytics
 * (14C) and skill-gap analytics (14D) are explicitly out of scope here.
 */
export class InstituteTrainerDashboardService {
  async getDashboard(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    trainerMembershipId: Types.ObjectId
  ): Promise<TrainerDashboard> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_VIEW);
    // INTERVIEWS_VIEW is also granted to OWNER/ADMIN/RECRUITER — this
    // dashboard is trainer-scoped identity, not just permission-gated, so an
    // OWNER/ADMIN must never see it as if they were a trainer.
    if (actingRole !== OrganizationMemberRole.TRAINER) {
      throw new ApiError(403, 'Only trainers can access the trainer dashboard');
    }

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);

    const trainerAssignments = await InstituteTrainerAssignment.find({
      organizationId: organization._id,
      trainerMembershipId,
    })
      .select('courseId batchId')
      .lean();

    const courseIds = Array.from(
      new Set(trainerAssignments.filter((a) => a.courseId).map((a) => a.courseId!.toString()))
    );
    const batchIds = Array.from(new Set(trainerAssignments.filter((a) => a.batchId).map((a) => a.batchId!.toString())));

    const emptySummary = {
      assignedCourses: courseIds.length,
      assignedBatches: batchIds.length,
      totalStudents: 0,
      totalInterviewAssignments: 0,
      pending: 0,
      inProgress: 0,
      completed: 0,
      overdue: 0,
    };

    if (courseIds.length === 0 && batchIds.length === 0) {
      return { summary: emptySummary, recentActivity: [] };
    }

    // A student is in scope via an exact batchId OR courseId match to one of
    // THIS trainer's own assignments — never a bare organization-wide query.
    const scopeConditions: Record<string, unknown>[] = [];
    if (batchIds.length > 0) scopeConditions.push({ batchId: { $in: batchIds } });
    if (courseIds.length > 0) scopeConditions.push({ courseId: { $in: courseIds } });

    const students = await InstituteStudent.find({
      organizationId: organization._id,
      status: InstituteStudentStatus.ACTIVE,
      $or: scopeConditions,
    })
      .select('firstName lastName enrollmentNumber')
      .lean();

    if (students.length === 0) {
      return { summary: { ...emptySummary, totalStudents: 0 }, recentActivity: [] };
    }

    const studentIds = students.map((s) => s._id);
    const studentById = new Map(students.map((s) => [s._id.toString(), s]));

    // Exact organizationId + studentId scoping — every assignment here
    // belongs to a student already verified to be in this trainer's scope.
    const assignments = await InstituteStudentInterviewAssignment.find({
      organizationId: organization._id,
      studentId: { $in: studentIds },
    })
      .sort({ createdAt: -1 })
      .lean();

    const now = new Date();
    let pending = 0;
    let inProgress = 0;
    let completed = 0;
    let overdue = 0;

    for (const assignment of assignments) {
      if (assignment.status === InstituteStudentInterviewAssignmentStatus.ASSIGNED) {
        pending += 1;
        if (assignment.dueAt && assignment.dueAt < now) {
          overdue += 1;
        }
      } else if (assignment.status === InstituteStudentInterviewAssignmentStatus.IN_PROGRESS) {
        inProgress += 1;
      } else if (assignment.status === InstituteStudentInterviewAssignmentStatus.COMPLETED) {
        completed += 1;
      }
    }

    const recent = assignments.slice(0, MAX_RECENT_ACTIVITY);
    const recentTemplateIds = Array.from(new Set(recent.map((a) => a.templateId.toString())));
    const templates =
      recentTemplateIds.length > 0
        ? await InstituteInterviewTemplate.find({
            _id: { $in: recentTemplateIds },
            organizationId: organization._id,
          })
            .select('name')
            .lean()
        : [];
    const templateNameById = new Map(templates.map((t) => [t._id.toString(), t.name]));

    const recentActivity: RecentActivityRow[] = recent.map((a) => {
      const student = studentById.get(a.studentId.toString())!;
      return {
        assignmentId: a._id.toString(),
        student: {
          id: student._id.toString(),
          firstName: student.firstName,
          lastName: student.lastName,
          enrollmentNumber: student.enrollmentNumber,
        },
        templateId: a.templateId.toString(),
        templateName: templateNameById.get(a.templateId.toString()) ?? null,
        status: a.status,
        dueAt: a.dueAt,
        interviewId: a.interviewId ? a.interviewId.toString() : undefined,
        createdAt: a.createdAt,
      };
    });

    return {
      summary: {
        assignedCourses: courseIds.length,
        assignedBatches: batchIds.length,
        totalStudents: students.length,
        totalInterviewAssignments: assignments.length,
        pending,
        inProgress,
        completed,
        overdue,
      },
      recentActivity,
    };
  }

  /** Access is already verified by the RBAC middleware — this just loads by ID (trusted organizationId). */
  private async getOrganizationById(organizationId: string): Promise<IOrganization> {
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      throw new ApiError(404, 'Organization not found');
    }
    return organization;
  }

  /** Defense in depth — the middleware already checked this; never duplicates the 8C matrix, just reuses it. */
  private assertHasPermission(role: OrganizationMemberRole, permission: OrganizationPermission): void {
    if (!hasOrganizationPermission(role, permission)) {
      throw new ApiError(403, 'You do not have permission to perform this action');
    }
  }

  /** Type guard — never a silent empty dashboard for a company org. */
  private assertIsInstitute(organization: IOrganization): void {
    if (organization.type !== OrganizationType.INSTITUTE) {
      throw new ApiError(400, 'This organization is not an institute');
    }
  }
}

export const instituteTrainerDashboardService = new InstituteTrainerDashboardService();
