import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import InstituteBatch, { IInstituteBatch } from '../models/InstituteBatch.model';
import InstituteStudent from '../models/InstituteStudent.model';
import InstituteTrainerAssignment from '../models/InstituteTrainerAssignment.model';
import InstituteStudentInterviewAssignment from '../models/InstituteStudentInterviewAssignment.model';
import Interview from '../models/interview.model';
import { InstituteStudentStatus } from '../constants/instituteStudent';
import { InstituteStudentInterviewAssignmentStatus } from '../constants/instituteStudentInterviewAssignment';
import { OrganizationType } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

interface StudentBreakdownRow {
  student: { id: string; firstName: string; lastName?: string; enrollmentNumber?: string };
  totalAssignments: number;
  completed: number;
  pending: number;
  inProgress: number;
  averageScore: number | null;
}

interface BatchAnalytics {
  summary: {
    totalStudents: number;
    studentsWithAssignments: number;
    totalAssignments: number;
    pending: number;
    inProgress: number;
    completed: number;
    overdue: number;
    completionRate: number;
    averageScore: number | null;
  };
  students: StudentBreakdownRow[];
}

/**
 * Trainer batch analytics (14C) — read-only, scoped to a single batch the
 * calling TRAINER can access (direct batch assignment, or a course
 * assignment matching the batch's own course). No skill-gap analytics here
 * (14D) — this is assignment-status/score aggregation only, and never
 * exposes answer/question/evaluation content.
 */
export class InstituteTrainerBatchAnalyticsService {
  async getBatchAnalytics(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    trainerMembershipId: Types.ObjectId,
    batchId: string
  ): Promise<BatchAnalytics> {
    this.assertHasPermission(actingRole, OrganizationPermission.ANALYTICS_VIEW);
    this.assertIsTrainer(actingRole);

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);

    const batch = await this.getBatchInTrainerScope(organization._id, trainerMembershipId, batchId);

    const students = await InstituteStudent.find({
      organizationId: organization._id,
      batchId: batch._id,
      status: InstituteStudentStatus.ACTIVE,
    })
      .select('firstName lastName enrollmentNumber userId')
      .lean();

    const emptySummary = {
      totalStudents: 0,
      studentsWithAssignments: 0,
      totalAssignments: 0,
      pending: 0,
      inProgress: 0,
      completed: 0,
      overdue: 0,
      completionRate: 0,
      averageScore: null as number | null,
    };

    if (students.length === 0) {
      return { summary: emptySummary, students: [] };
    }

    const studentIds = students.map((s) => s._id);
    const studentUserIdById = new Map(
      students.filter((s) => s.userId).map((s) => [s._id.toString(), s.userId!.toString()])
    );

    const assignments = await InstituteStudentInterviewAssignment.find({
      organizationId: organization._id,
      studentId: { $in: studentIds },
    })
      .select('studentId status dueAt interviewId')
      .lean();

    const now = new Date();
    let pending = 0;
    let inProgress = 0;
    let completed = 0;
    let overdue = 0;

    const assignmentsByStudent = new Map<string, typeof assignments>();
    for (const assignment of assignments) {
      const key = assignment.studentId.toString();
      const list = assignmentsByStudent.get(key) || [];
      list.push(assignment);
      assignmentsByStudent.set(key, list);

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

    // Score source: only COMPLETED assignments that have an interviewId.
    // The batched Interview lookup is scoped by organizationId AND
    // userId-in-batch, but a score is only ever trusted for a given
    // assignment after confirming the Interview's own userId matches that
    // EXACT student's userId — never interviewId alone.
    const scoredCandidates = assignments.filter(
      (a) => a.status === InstituteStudentInterviewAssignmentStatus.COMPLETED && a.interviewId
    );
    const interviewIds = Array.from(new Set(scoredCandidates.map((a) => a.interviewId!.toString())));
    const studentUserIds = Array.from(new Set(Array.from(studentUserIdById.values())));

    const interviews =
      interviewIds.length > 0 && studentUserIds.length > 0
        ? await Interview.find({
            _id: { $in: interviewIds },
            organizationId: organization._id,
            userId: { $in: studentUserIds },
          })
            .select('userId finalReport.overallScore')
            .lean()
        : [];
    const interviewById = new Map(interviews.map((i) => [i._id.toString(), i]));

    let scoreSum = 0;
    let scoreCount = 0;
    const studentScoreAccumulator = new Map<string, { sum: number; count: number }>();

    for (const assignment of scoredCandidates) {
      const studentKey = assignment.studentId.toString();
      const expectedUserId = studentUserIdById.get(studentKey);
      const interview = interviewById.get(assignment.interviewId!.toString());
      if (!expectedUserId || !interview || interview.userId?.toString() !== expectedUserId) {
        continue;
      }
      const score = interview.finalReport?.overallScore;
      if (typeof score !== 'number') {
        continue;
      }
      scoreSum += score;
      scoreCount += 1;
      const acc = studentScoreAccumulator.get(studentKey) || { sum: 0, count: 0 };
      acc.sum += score;
      acc.count += 1;
      studentScoreAccumulator.set(studentKey, acc);
    }

    const totalAssignments = assignments.length;
    const completionRate = totalAssignments > 0 ? Math.round((completed / totalAssignments) * 10000) / 100 : 0;
    const averageScore = scoreCount > 0 ? Math.round((scoreSum / scoreCount) * 100) / 100 : null;

    const studentsWithAssignments = students.filter((s) => (assignmentsByStudent.get(s._id.toString())?.length ?? 0) > 0)
      .length;

    const breakdown: StudentBreakdownRow[] = students.map((student) => {
      const studentAssignments = assignmentsByStudent.get(student._id.toString()) || [];
      let sPending = 0;
      let sInProgress = 0;
      let sCompleted = 0;
      for (const a of studentAssignments) {
        if (a.status === InstituteStudentInterviewAssignmentStatus.ASSIGNED) sPending += 1;
        else if (a.status === InstituteStudentInterviewAssignmentStatus.IN_PROGRESS) sInProgress += 1;
        else if (a.status === InstituteStudentInterviewAssignmentStatus.COMPLETED) sCompleted += 1;
      }
      const scoreAcc = studentScoreAccumulator.get(student._id.toString());

      return {
        student: {
          id: student._id.toString(),
          firstName: student.firstName,
          lastName: student.lastName,
          enrollmentNumber: student.enrollmentNumber,
        },
        totalAssignments: studentAssignments.length,
        completed: sCompleted,
        pending: sPending,
        inProgress: sInProgress,
        averageScore: scoreAcc ? Math.round((scoreAcc.sum / scoreAcc.count) * 100) / 100 : null,
      };
    });

    breakdown.sort((a, b) => {
      if (b.completed !== a.completed) return b.completed - a.completed;
      const nameA = `${a.student.firstName} ${a.student.lastName ?? ''}`.trim().toLowerCase();
      const nameB = `${b.student.firstName} ${b.student.lastName ?? ''}`.trim().toLowerCase();
      return nameA.localeCompare(nameB);
    });

    return {
      summary: {
        totalStudents: students.length,
        studentsWithAssignments,
        totalAssignments,
        pending,
        inProgress,
        completed,
        overdue,
        completionRate,
        averageScore,
      },
      students: breakdown,
    };
  }

  /**
   * The sole authorization gate: an EXACT {_id, organizationId} batch, and
   * either a direct trainer->batch assignment or a trainer->course
   * assignment matching the batch's own courseId. Anything else (wrong org,
   * out of scope, nonexistent) is the same 404 "Batch not found".
   */
  private async getBatchInTrainerScope(
    organizationId: Types.ObjectId,
    trainerMembershipId: Types.ObjectId,
    batchId: string
  ): Promise<IInstituteBatch> {
    const batch = await InstituteBatch.findOne({ _id: batchId, organizationId });
    if (!batch) {
      throw new ApiError(404, 'Batch not found');
    }

    const trainerAssignments = await InstituteTrainerAssignment.find({
      organizationId,
      trainerMembershipId,
    })
      .select('courseId batchId')
      .lean();

    const hasDirectBatch = trainerAssignments.some((a) => a.batchId && a.batchId.toString() === batch._id.toString());
    const hasCourseMatch = trainerAssignments.some(
      (a) => a.courseId && a.courseId.toString() === batch.courseId.toString()
    );

    if (!hasDirectBatch && !hasCourseMatch) {
      throw new ApiError(404, 'Batch not found');
    }

    return batch;
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

  /** ANALYTICS_VIEW is also granted to OWNER/ADMIN/RECRUITER — this is trainer-scoped identity, not just permission-gated. */
  private assertIsTrainer(role: OrganizationMemberRole): void {
    if (role !== OrganizationMemberRole.TRAINER) {
      throw new ApiError(403, 'Only trainers can access this resource');
    }
  }

  /** Type guard — never a silent empty result for a company org. */
  private assertIsInstitute(organization: IOrganization): void {
    if (organization.type !== OrganizationType.INSTITUTE) {
      throw new ApiError(400, 'This organization is not an institute');
    }
  }
}

export const instituteTrainerBatchAnalyticsService = new InstituteTrainerBatchAnalyticsService();
