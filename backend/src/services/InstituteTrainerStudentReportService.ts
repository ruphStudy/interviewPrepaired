import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import InstituteStudent, { IInstituteStudent } from '../models/InstituteStudent.model';
import InstituteTrainerAssignment from '../models/InstituteTrainerAssignment.model';
import InstituteStudentInterviewAssignment from '../models/InstituteStudentInterviewAssignment.model';
import InstituteInterviewTemplate from '../models/InstituteInterviewTemplate.model';
import Interview from '../models/interview.model';
import { InstituteStudentStatus } from '../constants/instituteStudent';
import { InstituteStudentInterviewAssignmentStatus } from '../constants/instituteStudentInterviewAssignment';
import { OrganizationType } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';
import { InterviewService } from './InterviewService';

// Matches InterviewController's/other institute services' convention.
const interviewService = new InterviewService();
type InterviewReportResult = Awaited<ReturnType<InterviewService['getInterviewReport']>>;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

interface ListReportsParams {
  page?: number;
  limit?: number;
}

interface ReportRow {
  assignmentId: string;
  template: { id: string; name: string } | null;
  interviewId: string;
  completedAt?: Date;
  score?: number;
  createdAt: Date;
}

interface SafeStudentProfile {
  id: string;
  firstName: string;
  lastName?: string;
  enrollmentNumber?: string;
}

interface SafeAssignmentMetadata {
  assignmentId: string;
  template: { id: string; name: string } | null;
  status: InstituteStudentInterviewAssignmentStatus;
  dueAt?: Date;
  interviewId: string;
  createdAt: Date;
}

/**
 * Trainer access to a scoped student's interview reports (14B). A trainer
 * only ever sees COMPLETED assignments belonging to a student inside their
 * OWN InstituteTrainerAssignment scope (batch or course) — an out-of-scope
 * or nonexistent student is always 404 "Student not found", never a
 * distinguishable leak. No report/evaluation logic is reimplemented — the
 * detail endpoint reuses InterviewService.getInterviewReport as-is, exactly
 * like the student portal's own result endpoint (13D) does for the caller's
 * own interviews.
 */
export class InstituteTrainerStudentReportService {
  async getReports(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    trainerMembershipId: Types.ObjectId,
    studentId: string,
    params: ListReportsParams
  ): Promise<{ reports: ReportRow[]; pagination: { page: number; limit: number; total: number; pages: number } }> {
    this.assertHasPermission(actingRole, OrganizationPermission.REPORTS_VIEW);
    this.assertIsTrainer(actingRole);

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);

    const student = await this.getStudentInTrainerScope(organization._id, trainerMembershipId, studentId);

    const page = params.page && params.page > 0 ? params.page : DEFAULT_PAGE;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, MAX_LIMIT) : DEFAULT_LIMIT;

    const filter = {
      organizationId: organization._id,
      studentId: student._id,
      status: InstituteStudentInterviewAssignmentStatus.COMPLETED,
    };

    const skip = (page - 1) * limit;
    const [assignments, total] = await Promise.all([
      InstituteStudentInterviewAssignment.find(filter).sort({ updatedAt: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      InstituteStudentInterviewAssignment.countDocuments(filter),
    ]);

    const templateIds = Array.from(new Set(assignments.map((a) => a.templateId.toString())));
    const templates =
      templateIds.length > 0
        ? await InstituteInterviewTemplate.find({ _id: { $in: templateIds }, organizationId: organization._id })
            .select('name')
            .lean()
        : [];
    const templateNameById = new Map(templates.map((t) => [t._id.toString(), t.name]));

    const interviewIds = assignments.filter((a) => a.interviewId).map((a) => a.interviewId as Types.ObjectId);
    const interviews =
      interviewIds.length > 0 && student.userId
        ? await Interview.find({
            _id: { $in: interviewIds },
            organizationId: organization._id,
            userId: student.userId,
          })
            .select('completedAt finalReport.overallScore')
            .lean()
        : [];
    const interviewById = new Map(interviews.map((i) => [i._id.toString(), i]));

    const reports: ReportRow[] = assignments
      .filter((a) => !!a.interviewId)
      .map((a) => {
        const template = templateNameById.get(a.templateId.toString());
        const interview = interviewById.get(a.interviewId!.toString());
        return {
          assignmentId: a._id.toString(),
          template: template ? { id: a.templateId.toString(), name: template } : null,
          interviewId: a.interviewId!.toString(),
          completedAt: interview?.completedAt,
          score: interview?.finalReport?.overallScore,
          createdAt: a.createdAt,
        };
      });

    return { reports, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async getReportDetail(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    trainerMembershipId: Types.ObjectId,
    studentId: string,
    assignmentId: string
  ): Promise<{ student: SafeStudentProfile; assignment: SafeAssignmentMetadata; report: InterviewReportResult }> {
    this.assertHasPermission(actingRole, OrganizationPermission.REPORTS_VIEW);
    this.assertIsTrainer(actingRole);

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);

    const student = await this.getStudentInTrainerScope(organization._id, trainerMembershipId, studentId);

    const assignment = await InstituteStudentInterviewAssignment.findOne({
      _id: assignmentId,
      organizationId: organization._id,
      studentId: student._id,
    }).lean();
    if (!assignment) {
      throw new ApiError(404, 'Assignment not found');
    }
    if (!assignment.interviewId) {
      throw new ApiError(409, 'Interview has not been started yet');
    }
    if (assignment.status !== InstituteStudentInterviewAssignmentStatus.COMPLETED) {
      throw new ApiError(409, 'Interview is not completed yet');
    }
    if (!student.userId) {
      throw new ApiError(404, 'Student not found');
    }

    const interview = await Interview.findOne({
      _id: assignment.interviewId,
      organizationId: organization._id,
      userId: student.userId,
    })
      .select('_id')
      .lean();
    if (!interview) {
      throw new ApiError(404, 'Assignment not found');
    }

    const template = await InstituteInterviewTemplate.findOne({
      _id: assignment.templateId,
      organizationId: organization._id,
    })
      .select('name')
      .lean();

    const report = await interviewService.getInterviewReport(assignment.interviewId.toString(), student.userId.toString());

    return {
      student: {
        id: student._id.toString(),
        firstName: student.firstName,
        lastName: student.lastName,
        enrollmentNumber: student.enrollmentNumber,
      },
      assignment: {
        assignmentId: assignment._id.toString(),
        template: template ? { id: template._id.toString(), name: template.name } : null,
        status: assignment.status,
        dueAt: assignment.dueAt,
        interviewId: assignment.interviewId.toString(),
        createdAt: assignment.createdAt,
      },
      report,
    };
  }

  /**
   * The sole authorization gate for every method here: an ACTIVE,
   * same-organization student whose batchId/courseId matches one of this
   * trainer's OWN InstituteTrainerAssignment rows. Anything else (wrong
   * org, inactive, out of scope, nonexistent) is the same 404 — never a
   * distinguishable leak of another trainer's or another org's student.
   */
  private async getStudentInTrainerScope(
    organizationId: Types.ObjectId,
    trainerMembershipId: Types.ObjectId,
    studentId: string
  ): Promise<IInstituteStudent> {
    const trainerAssignments = await InstituteTrainerAssignment.find({
      organizationId,
      trainerMembershipId,
    })
      .select('courseId batchId')
      .lean();

    const courseIds = Array.from(
      new Set(trainerAssignments.filter((a) => a.courseId).map((a) => a.courseId!.toString()))
    );
    const batchIds = Array.from(new Set(trainerAssignments.filter((a) => a.batchId).map((a) => a.batchId!.toString())));

    if (courseIds.length === 0 && batchIds.length === 0) {
      throw new ApiError(404, 'Student not found');
    }

    const scopeConditions: Record<string, unknown>[] = [];
    if (batchIds.length > 0) scopeConditions.push({ batchId: { $in: batchIds } });
    if (courseIds.length > 0) scopeConditions.push({ courseId: { $in: courseIds } });

    const student = await InstituteStudent.findOne({
      _id: studentId,
      organizationId,
      status: InstituteStudentStatus.ACTIVE,
      $or: scopeConditions,
    });
    if (!student) {
      throw new ApiError(404, 'Student not found');
    }
    return student;
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

  /** REPORTS_VIEW is also granted to OWNER/ADMIN/RECRUITER — this is trainer-scoped identity, not just permission-gated. */
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

export const instituteTrainerStudentReportService = new InstituteTrainerStudentReportService();
