import { Types } from 'mongoose';
import InstituteStudent from '../models/InstituteStudent.model';
import InstituteStudentInterviewAssignment from '../models/InstituteStudentInterviewAssignment.model';
import InstituteInterviewTemplate from '../models/InstituteInterviewTemplate.model';
import Organization from '../models/Organization.model';
import { InstituteStudentStatus } from '../constants/instituteStudent';
import { InstituteStudentInterviewAssignmentStatus } from '../constants/instituteStudentInterviewAssignment';

const MAX_UPCOMING_PER_STUDENT = 5;
const UPCOMING_STATUSES = [
  InstituteStudentInterviewAssignmentStatus.ASSIGNED,
  InstituteStudentInterviewAssignmentStatus.IN_PROGRESS,
];

interface UpcomingAssignment {
  assignmentId: string;
  templateId: string;
  templateName: string | null;
  dueAt?: Date;
  status: InstituteStudentInterviewAssignmentStatus;
  interviewId?: string;
  instructions?: string;
}

interface StudentDashboardBlock {
  organization: { id: string; name: string };
  student: {
    id: string;
    firstName: string;
    lastName?: string;
    enrollmentNumber?: string;
    courseId?: string;
    batchId?: string;
    branchId?: string;
  };
  summary: {
    totalAssignments: number;
    pending: number;
    inProgress: number;
    completed: number;
    overdue: number;
  };
  upcomingAssignments: UpcomingAssignment[];
}

/**
 * Student self-service dashboard (13A) — read-only aggregation across every
 * ACTIVE InstituteStudent record linked to the authenticated user. Never
 * accepts userId/studentId/organizationId from the caller: the only trusted
 * identity is `req.user._id`, resolved via the `protect` auth middleware.
 * No OrganizationMember/RBAC involved — a student is not an organization
 * member, so admin permission plumbing does not apply here.
 */
export class StudentPortalService {
  async getDashboard(userId: string): Promise<{ dashboards: StudentDashboardBlock[] }> {
    const students = await InstituteStudent.find({
      userId: new Types.ObjectId(userId),
      status: InstituteStudentStatus.ACTIVE,
    }).lean();

    if (students.length === 0) {
      return { dashboards: [] };
    }

    const organizationIds = Array.from(new Set(students.map((s) => s.organizationId.toString())));
    const organizations = await Organization.find({ _id: { $in: organizationIds } })
      .select('name')
      .lean();
    const organizationById = new Map(organizations.map((o) => [o._id.toString(), o]));

    // Exact {organizationId, studentId} pairs only — never a bare studentId
    // or bare organizationId filter, per the tenant-safety requirement.
    const pairFilter = students.map((s) => ({ organizationId: s.organizationId, studentId: s._id }));
    const assignments = await InstituteStudentInterviewAssignment.find({ $or: pairFilter }).lean();

    const templateIds = Array.from(new Set(assignments.map((a) => a.templateId.toString())));
    const templates =
      templateIds.length > 0
        ? await InstituteInterviewTemplate.find({
            _id: { $in: templateIds },
            organizationId: { $in: organizationIds },
          })
            .select('name organizationId')
            .lean()
        : [];
    // Keyed by templateId+organizationId — a template lookup is only ever
    // trusted when it belongs to the same organization as the assignment
    // referencing it.
    const templateByKey = new Map(templates.map((t) => [`${t.organizationId.toString()}:${t._id.toString()}`, t]));

    const assignmentsByStudent = new Map<string, typeof assignments>();
    for (const assignment of assignments) {
      const key = assignment.studentId.toString();
      const list = assignmentsByStudent.get(key) || [];
      list.push(assignment);
      assignmentsByStudent.set(key, list);
    }

    const now = new Date();

    const dashboards: StudentDashboardBlock[] = students.map((student) => {
      const organization = organizationById.get(student.organizationId.toString());
      const studentAssignments = assignmentsByStudent.get(student._id.toString()) || [];

      let pending = 0;
      let inProgress = 0;
      let completed = 0;
      let overdue = 0;

      for (const assignment of studentAssignments) {
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

      const upcomingAssignments = studentAssignments
        .filter((a) => UPCOMING_STATUSES.includes(a.status))
        .sort((a, b) => {
          const aDue = a.dueAt ? a.dueAt.getTime() : Infinity;
          const bDue = b.dueAt ? b.dueAt.getTime() : Infinity;
          if (aDue !== bDue) return aDue - bDue;
          return b.createdAt.getTime() - a.createdAt.getTime();
        })
        .slice(0, MAX_UPCOMING_PER_STUDENT)
        .map((a) => {
          const template = templateByKey.get(`${student.organizationId.toString()}:${a.templateId.toString()}`);
          return {
            assignmentId: a._id.toString(),
            templateId: a.templateId.toString(),
            templateName: template ? template.name : null,
            dueAt: a.dueAt,
            status: a.status,
            interviewId: a.interviewId ? a.interviewId.toString() : undefined,
            instructions: a.instructions,
          };
        });

      return {
        organization: {
          id: student.organizationId.toString(),
          name: organization ? organization.name : '',
        },
        student: {
          id: student._id.toString(),
          firstName: student.firstName,
          lastName: student.lastName,
          enrollmentNumber: student.enrollmentNumber,
          courseId: student.courseId ? student.courseId.toString() : undefined,
          batchId: student.batchId ? student.batchId.toString() : undefined,
          branchId: student.branchId ? student.branchId.toString() : undefined,
        },
        summary: {
          totalAssignments: studentAssignments.length,
          pending,
          inProgress,
          completed,
          overdue,
        },
        upcomingAssignments,
      };
    });

    return { dashboards };
  }
}

export const studentPortalService = new StudentPortalService();
