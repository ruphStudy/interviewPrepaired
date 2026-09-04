import { Types } from 'mongoose';
import InstituteStudent from '../models/InstituteStudent.model';
import InstituteStudentInterviewAssignment from '../models/InstituteStudentInterviewAssignment.model';
import InstituteInterviewTemplate from '../models/InstituteInterviewTemplate.model';
import Interview from '../models/interview.model';
import Organization, { IOrganization } from '../models/Organization.model';
import { InstituteStudentStatus } from '../constants/instituteStudent';
import { InstituteStudentInterviewAssignmentStatus } from '../constants/instituteStudentInterviewAssignment';
import { instituteStudentInterviewAssignmentService } from './InstituteStudentInterviewAssignmentService';
import { InterviewService } from './InterviewService';
import { ApiError } from '../utils/ApiError';

// Matches InterviewController's/InstituteStudentInterviewAssignmentService's convention.
const interviewService = new InterviewService();
type InterviewSessionResult = Awaited<ReturnType<InterviewService['getInterviewSession']>>;
type InterviewReportResult = Awaited<ReturnType<InterviewService['getInterviewReport']>>;

const MAX_UPCOMING_PER_STUDENT = 5;
const UPCOMING_STATUSES = [
  InstituteStudentInterviewAssignmentStatus.ASSIGNED,
  InstituteStudentInterviewAssignmentStatus.IN_PROGRESS,
];

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

interface ListAssignmentsParams {
  status?: InstituteStudentInterviewAssignmentStatus;
  organizationId?: string;
  page?: number;
  limit?: number;
}

// Minimal shape actually used from a lean InstituteStudent doc — avoids
// fighting Mongoose's FlattenMaps<Document> lean typing for fields we don't need.
interface LinkedStudent {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  firstName: string;
  lastName?: string;
  enrollmentNumber?: string;
}

interface ListHistoryParams {
  organizationId?: string;
  page?: number;
  limit?: number;
}

interface HistoryRow {
  assignmentId: string;
  organization: { id: string; name: string };
  template: { id: string; name: string } | null;
  status: InstituteStudentInterviewAssignmentStatus;
  interviewId?: string;
  dueAt?: Date;
  completedAt?: Date;
  score?: number;
}

// History only ever lists finished attempts — a pending/active assignment
// belongs in the assignments list (13B) / dashboard (13A), not history.
const HISTORY_STATUSES = [InstituteStudentInterviewAssignmentStatus.COMPLETED];

interface AssignmentRow {
  assignmentId: string;
  organization: { id: string; name: string };
  student: { id: string; firstName: string; lastName?: string; enrollmentNumber?: string };
  template: { id: string; name: string } | null;
  dueAt?: Date;
  instructions?: string;
  status: InstituteStudentInterviewAssignmentStatus;
  interviewId?: string;
  createdAt: Date;
}

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

  /**
   * List assignments (13B) across every ACTIVE InstituteStudent record
   * linked to the caller. `organizationId` is only ever used to narrow an
   * already-authorized set of {organizationId, studentId} pairs — it can
   * never widen access to an organization the caller has no active linked
   * student in.
   */
  async getAssignments(
    userId: string,
    params: ListAssignmentsParams
  ): Promise<{
    assignments: AssignmentRow[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }> {
    const page = params.page && params.page > 0 ? params.page : DEFAULT_PAGE;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, MAX_LIMIT) : DEFAULT_LIMIT;

    const students = await this.getActiveLinkedStudents(userId);

    let authorizedStudents = students;
    if (params.organizationId) {
      // Narrowing only — an organizationId the caller has no active linked
      // student in yields zero authorized pairs, never a wider/bare filter.
      authorizedStudents = students.filter((s) => s.organizationId.toString() === params.organizationId);
    }

    if (authorizedStudents.length === 0) {
      return { assignments: [], pagination: { page, limit, total: 0, pages: 0 } };
    }

    const pairFilter = authorizedStudents.map((s) => ({ organizationId: s.organizationId, studentId: s._id }));
    const filter: Record<string, unknown> = { $or: pairFilter };
    if (params.status) {
      filter.status = params.status;
    }

    const skip = (page - 1) * limit;
    const [assignments, total] = await Promise.all([
      InstituteStudentInterviewAssignment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      InstituteStudentInterviewAssignment.countDocuments(filter),
    ]);

    const { studentById, organizationById, templateByKey } = await this.buildEnrichmentMaps(
      authorizedStudents,
      assignments.map((a) => ({ organizationId: a.organizationId, templateId: a.templateId }))
    );

    const rows = assignments.map((a) =>
      this.toRow(a, studentById.get(a.studentId.toString())!, organizationById, templateByKey)
    );

    return { assignments: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  /**
   * Detail (13B) — resolves the caller's authorized {organizationId,
   * studentId} pairs first, then matches the assignment by _id AND one of
   * those exact pairs in a single query. Any mismatch (wrong owner, wrong
   * org, or nonexistent id) is indistinguishable and always 404s.
   */
  async getAssignmentDetail(userId: string, assignmentId: string): Promise<AssignmentRow> {
    if (!Types.ObjectId.isValid(assignmentId)) {
      throw new ApiError(404, 'Assignment not found');
    }

    const students = await this.getActiveLinkedStudents(userId);
    if (students.length === 0) {
      throw new ApiError(404, 'Assignment not found');
    }

    const pairFilter = students.map((s) => ({ organizationId: s.organizationId, studentId: s._id }));
    const assignment = await InstituteStudentInterviewAssignment.findOne({
      _id: assignmentId,
      $or: pairFilter,
    }).lean();

    if (!assignment) {
      throw new ApiError(404, 'Assignment not found');
    }

    const { studentById, organizationById, templateByKey } = await this.buildEnrichmentMaps(students, [
      { organizationId: assignment.organizationId, templateId: assignment.templateId },
    ]);

    return this.toRow(assignment, studentById.get(assignment.studentId.toString())!, organizationById, templateByKey);
  }

  /**
   * Start (13C) — delegates the actual claim/create/link algorithm entirely
   * to InstituteStudentInterviewAssignmentService.startAssignmentForStudent
   * (the same shared core the admin 12E route uses), so there is exactly
   * one start algorithm. No OrganizationMember/RBAC role is faked here —
   * ownership of an ACTIVE linked InstituteStudent row is the only
   * authorization. Once started (or idempotently already-started), reloads
   * the safe portal row and attaches the live session via the existing,
   * ownership-scoped InterviewService.getInterviewSession — never a second
   * Interview, never a credit call.
   */
  async startAssignment(userId: string, assignmentId: string): Promise<AssignmentRow & { session: InterviewSessionResult }> {
    await instituteStudentInterviewAssignmentService.startAssignmentForStudent(userId, assignmentId);

    const assignment = await this.getAssignmentDetail(userId, assignmentId);
    if (!assignment.interviewId) {
      // Unreachable in practice — startAssignmentForStudent only returns
      // once interviewId is set — but never fabricate a session otherwise.
      throw new ApiError(409, 'Interview is not available yet');
    }

    const session = await interviewService.getInterviewSession({ interviewId: assignment.interviewId, userId });
    return { ...assignment, session };
  }

  /**
   * Resume/refresh (13C) — authorizes through the same ownership-scoped
   * detail lookup as GET /assignments/:id (404 for anything not owned),
   * then requires the assignment to have actually been started (409
   * otherwise) before handing back the live session.
   */
  async getAssignmentSession(userId: string, assignmentId: string): Promise<AssignmentRow & { session: InterviewSessionResult }> {
    const assignment = await this.getAssignmentDetail(userId, assignmentId);
    if (!assignment.interviewId) {
      throw new ApiError(409, 'Interview has not been started yet');
    }

    const session = await interviewService.getInterviewSession({ interviewId: assignment.interviewId, userId });
    return { ...assignment, session };
  }

  /**
   * History (13D) — completed assignments only, across every ACTIVE
   * InstituteStudent record linked to the caller. `organizationId` narrows
   * an already-authorized set exactly like getAssignments (13B); it can
   * never widen access. Score/completedAt come from a batched Interview
   * lookup, each scoped to the exact {_id, organizationId, userId} triple —
   * never a bare interviewId — so a cross-tenant/cross-user Interview can
   * never leak a score into someone else's history row.
   */
  async getHistory(
    userId: string,
    params: ListHistoryParams
  ): Promise<{
    history: HistoryRow[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }> {
    const page = params.page && params.page > 0 ? params.page : DEFAULT_PAGE;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, MAX_LIMIT) : DEFAULT_LIMIT;

    const students = await this.getActiveLinkedStudents(userId);

    let authorizedStudents = students;
    if (params.organizationId) {
      authorizedStudents = students.filter((s) => s.organizationId.toString() === params.organizationId);
    }

    if (authorizedStudents.length === 0) {
      return { history: [], pagination: { page, limit, total: 0, pages: 0 } };
    }

    const pairFilter = authorizedStudents.map((s) => ({ organizationId: s.organizationId, studentId: s._id }));
    const filter: Record<string, unknown> = { $or: pairFilter, status: { $in: HISTORY_STATUSES } };

    const skip = (page - 1) * limit;
    const [assignments, total] = await Promise.all([
      InstituteStudentInterviewAssignment.find(filter).sort({ updatedAt: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      InstituteStudentInterviewAssignment.countDocuments(filter),
    ]);

    const { organizationById, templateByKey } = await this.buildEnrichmentMaps(
      authorizedStudents,
      assignments.map((a) => ({ organizationId: a.organizationId, templateId: a.templateId }))
    );

    const interviewIds = assignments.filter((a) => a.interviewId).map((a) => a.interviewId as Types.ObjectId);
    const organizationIds = Array.from(new Set(authorizedStudents.map((s) => s.organizationId.toString())));
    const interviews =
      interviewIds.length > 0
        ? await Interview.find({
            _id: { $in: interviewIds },
            organizationId: { $in: organizationIds },
            userId: new Types.ObjectId(userId),
          })
            .select('organizationId completedAt finalReport.overallScore')
            .lean()
        : [];
    // Keyed by organizationId+interviewId — a score is only ever trusted
    // when the Interview belongs to both the same organization AND the
    // authenticated user (the query above already enforced userId too).
    const interviewByKey = new Map(interviews.map((i) => [`${i.organizationId!.toString()}:${i._id.toString()}`, i]));

    const history: HistoryRow[] = assignments.map((a) => {
      const organization = organizationById.get(a.organizationId.toString());
      const template = templateByKey.get(`${a.organizationId.toString()}:${a.templateId.toString()}`);
      const interview = a.interviewId
        ? interviewByKey.get(`${a.organizationId.toString()}:${a.interviewId.toString()}`)
        : undefined;

      return {
        assignmentId: a._id.toString(),
        organization: { id: a.organizationId.toString(), name: organization ? organization.name : '' },
        template: template ? { id: a.templateId.toString(), name: template.name } : null,
        status: a.status,
        interviewId: a.interviewId ? a.interviewId.toString() : undefined,
        dueAt: a.dueAt,
        completedAt: interview?.completedAt,
        score: interview?.finalReport?.overallScore,
      };
    });

    return { history, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  /**
   * Result (13D) — authorizes via the same ownership-scoped detail lookup
   * as GET /assignments/:id, requires the assignment to actually be
   * COMPLETED with an interviewId, re-verifies the Interview with an exact
   * {_id, organizationId, userId} match (never trusting interviewId alone),
   * then reuses InterviewService.getInterviewReport as-is — no report
   * logic is duplicated or reimplemented here.
   */
  async getAssignmentResult(
    userId: string,
    assignmentId: string
  ): Promise<{ assignment: AssignmentRow; report: InterviewReportResult }> {
    const assignment = await this.getAssignmentDetail(userId, assignmentId);

    if (!assignment.interviewId) {
      throw new ApiError(409, 'Interview has not been started yet');
    }
    if (assignment.status !== InstituteStudentInterviewAssignmentStatus.COMPLETED) {
      throw new ApiError(409, 'Interview is not completed yet');
    }

    const interview = await Interview.findOne({
      _id: assignment.interviewId,
      organizationId: assignment.organization.id,
      userId: new Types.ObjectId(userId),
    })
      .select('_id')
      .lean();
    if (!interview) {
      throw new ApiError(404, 'Assignment not found');
    }

    const report = await interviewService.getInterviewReport(assignment.interviewId, userId);
    return { assignment, report };
  }

  /** The sole source of authorized {organizationId, studentId} pairs for a caller. */
  private async getActiveLinkedStudents(userId: string): Promise<LinkedStudent[]> {
    return InstituteStudent.find({
      userId: new Types.ObjectId(userId),
      status: InstituteStudentStatus.ACTIVE,
    }).lean();
  }

  /** Batched, organization-scoped enrichment lookups shared by list and detail. */
  private async buildEnrichmentMaps(
    students: LinkedStudent[],
    templateRefs: Array<{ organizationId: Types.ObjectId; templateId: Types.ObjectId }>
  ): Promise<{
    studentById: Map<string, LinkedStudent>;
    organizationById: Map<string, Pick<IOrganization, 'name'> & { _id: Types.ObjectId }>;
    templateByKey: Map<string, { name: string }>;
  }> {
    const organizationIds = Array.from(new Set(students.map((s) => s.organizationId.toString())));
    const studentById = new Map(students.map((s) => [s._id.toString(), s]));

    const organizations = await Organization.find({ _id: { $in: organizationIds } })
      .select('name')
      .lean();
    const organizationById = new Map(organizations.map((o) => [o._id.toString(), o]));

    const templateKeys = Array.from(
      new Set(templateRefs.map((t) => `${t.organizationId.toString()}:${t.templateId.toString()}`))
    );
    const templateIds = Array.from(new Set(templateRefs.map((t) => t.templateId.toString())));

    const templates =
      templateIds.length > 0
        ? await InstituteInterviewTemplate.find({
            _id: { $in: templateIds },
            organizationId: { $in: organizationIds },
          })
            .select('name organizationId')
            .lean()
        : [];
    const templateByKey = new Map(
      templates
        .map((t) => [`${t.organizationId.toString()}:${t._id.toString()}`, { name: t.name }] as const)
        .filter(([key]) => templateKeys.includes(key))
    );

    return { studentById, organizationById, templateByKey };
  }

  /** Safe row shape shared by list and detail — never leaks question/answer/evaluation content. */
  private toRow(
    assignment: {
      _id: Types.ObjectId;
      organizationId: Types.ObjectId;
      studentId: Types.ObjectId;
      templateId: Types.ObjectId;
      dueAt?: Date;
      instructions?: string;
      status: InstituteStudentInterviewAssignmentStatus;
      interviewId?: Types.ObjectId;
      createdAt: Date;
    },
    student: LinkedStudent,
    organizationById: Map<string, Pick<IOrganization, 'name'> & { _id: Types.ObjectId }>,
    templateByKey: Map<string, { name: string }>
  ): AssignmentRow {
    const organization = organizationById.get(assignment.organizationId.toString());
    const template = templateByKey.get(`${assignment.organizationId.toString()}:${assignment.templateId.toString()}`);

    return {
      assignmentId: assignment._id.toString(),
      organization: {
        id: assignment.organizationId.toString(),
        name: organization ? organization.name : '',
      },
      student: {
        id: student._id.toString(),
        firstName: student.firstName,
        lastName: student.lastName,
        enrollmentNumber: student.enrollmentNumber,
      },
      template: template ? { id: assignment.templateId.toString(), name: template.name } : null,
      dueAt: assignment.dueAt,
      instructions: assignment.instructions,
      status: assignment.status,
      interviewId: assignment.interviewId ? assignment.interviewId.toString() : undefined,
      createdAt: assignment.createdAt,
    };
  }
}

export const studentPortalService = new StudentPortalService();
