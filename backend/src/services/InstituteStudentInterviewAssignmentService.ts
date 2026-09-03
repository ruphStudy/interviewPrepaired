import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import InstituteStudent, { IInstituteStudent } from '../models/InstituteStudent.model';
import InstituteInterviewTemplate, { IInstituteInterviewTemplate } from '../models/InstituteInterviewTemplate.model';
import InstituteStudentInterviewAssignment from '../models/InstituteStudentInterviewAssignment.model';
import { InstituteStudentInterviewAssignmentStatus } from '../constants/instituteStudentInterviewAssignment';
import { InstituteInterviewTemplateStatus } from '../constants/instituteInterviewTemplate';
import { InstituteStudentStatus } from '../constants/instituteStudent';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const MAX_ASSIGN_STUDENTS = 200;

interface AssignInterviewFields {
  templateId: string;
  studentIds: string[];
  dueAt?: Date;
  instructions?: string;
}

interface AssignResultRow {
  studentId: string;
  status: 'assigned' | 'failed';
  assignmentId?: string;
  error?: string;
}

interface AssignInterviewResult {
  total: number;
  assigned: number;
  failed: number;
  results: AssignResultRow[];
}

interface ListAssignmentsParams {
  page: number;
  limit: number;
  studentId?: string;
  templateId?: string;
  status?: InstituteStudentInterviewAssignmentStatus;
}

/**
 * Assigns an EXISTING active InstituteInterviewTemplate to EXISTING active
 * InstituteStudents (12D) — a pure task/relationship record. Does NOT
 * create or start an actual Interview, generate questions, or consume
 * credits — that's 12E. Authorization mirrors the other institute services:
 * the `requireOrganizationPermission` middleware (8D) resolves the caller's
 * trusted role onto the request, and these methods take that
 * already-trusted `organizationId`/`actingRole`. Institute-only: a COMPANY
 * organization gets 400 from every method here.
 */
export class InstituteStudentInterviewAssignmentService {
  /**
   * The template is validated ONCE for the whole request (org-scoped,
   * must be active) — an invalid template fails the entire request rather
   * than being a per-row concern. Each studentId is then processed
   * independently: one invalid/mismatched/duplicate student never aborts
   * the others. `assignedByMembershipId` is trusted input (the caller's own
   * membership id from organizationContext), never re-derived here.
   */
  async assignInterview(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    assignedByMembershipId: Types.ObjectId,
    fields: AssignInterviewFields
  ): Promise<AssignInterviewResult> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);

    if (!fields.templateId) {
      throw new ApiError(400, 'templateId is required');
    }
    if (!Array.isArray(fields.studentIds) || fields.studentIds.length === 0) {
      throw new ApiError(400, 'studentIds must be a non-empty array');
    }
    if (fields.studentIds.length > MAX_ASSIGN_STUDENTS) {
      throw new ApiError(400, `studentIds cannot exceed ${MAX_ASSIGN_STUDENTS} items per request`);
    }

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);
    this.assertOrganizationMutable(organization);

    const template = await InstituteInterviewTemplate.findOne({ _id: fields.templateId, organizationId: organization._id });
    if (!template) {
      throw new ApiError(404, 'Template not found');
    }
    if (template.status !== InstituteInterviewTemplateStatus.ACTIVE) {
      throw new ApiError(400, 'Template is not active');
    }

    const instructions = fields.instructions?.trim() || undefined;
    // Dedupe — the same studentId listed twice is processed (and reported) once.
    const uniqueStudentIds = Array.from(new Set(fields.studentIds));

    const results: AssignResultRow[] = [];
    let assigned = 0;
    let failed = 0;

    for (const studentId of uniqueStudentIds) {
      try {
        // Tenant-scoped: never findById(studentId) alone. A cross-org or
        // nonexistent student is never modified — it just fails this row.
        const student = await InstituteStudent.findOne({ _id: studentId, organizationId: organization._id });
        if (!student) {
          throw new ApiError(404, 'Student not found');
        }
        if (student.status !== InstituteStudentStatus.ACTIVE) {
          throw new ApiError(400, 'Student is not active');
        }

        this.assertTemplateScopeMatchesStudent(template, student);

        try {
          const assignment = await InstituteStudentInterviewAssignment.create({
            organizationId: organization._id,
            studentId: student._id,
            templateId: template._id,
            assignedByMembershipId,
            dueAt: fields.dueAt,
            instructions,
            status: InstituteStudentInterviewAssignmentStatus.ASSIGNED,
          });
          results.push({ studentId, status: 'assigned', assignmentId: assignment._id.toString() });
          assigned += 1;
        } catch (error: any) {
          if (error?.code === 11000) {
            // The pre-check below is intentionally absent — this unique
            // index (partial, status=ASSIGNED) is the actual race-condition
            // authority; a duplicate-key error here means this student
            // already has an active assignment for this template.
            throw new ApiError(409, 'This student already has an active assignment for this template');
          }
          throw error;
        }
      } catch (error: any) {
        const message = error instanceof ApiError ? error.message : 'Failed to assign this student';
        results.push({ studentId, status: 'failed', error: message });
        failed += 1;
      }
    }

    return { total: uniqueStudentIds.length, assigned, failed, results };
  }

  async getAssignments(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    params: ListAssignmentsParams
  ): Promise<{
    assignments: Array<Record<string, unknown>>;
    pagination: { page: number; limit: number; total: number; pages: number };
  }> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);

    const filter: Record<string, unknown> = { organizationId: organization._id };
    if (params.studentId) filter.studentId = new Types.ObjectId(params.studentId);
    if (params.templateId) filter.templateId = new Types.ObjectId(params.templateId);
    if (params.status) filter.status = params.status;

    const skip = (params.page - 1) * params.limit;

    const [assignments, total] = await Promise.all([
      InstituteStudentInterviewAssignment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(params.limit).lean(),
      InstituteStudentInterviewAssignment.countDocuments(filter),
    ]);

    return {
      assignments: assignments.map((a) => this.toDetail(a)),
      pagination: { page: params.page, limit: params.limit, total, pages: Math.ceil(total / params.limit) },
    };
  }

  /**
   * Batch-scoped template requires an exact student.batchId match; a
   * course-scoped (non-batch-scoped) template requires an exact
   * student.courseId match; an organization-wide template (neither set) has
   * no scope constraint.
   */
  private assertTemplateScopeMatchesStudent(template: IInstituteInterviewTemplate, student: IInstituteStudent): void {
    if (template.batchId) {
      if (!student.batchId || student.batchId.toString() !== template.batchId.toString()) {
        throw new ApiError(400, "Student's batch does not match the template's batch");
      }
      return;
    }
    if (template.courseId) {
      if (!student.courseId || student.courseId.toString() !== template.courseId.toString()) {
        throw new ApiError(400, "Student's course does not match the template's course");
      }
    }
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

  private assertOrganizationMutable(organization: IOrganization): void {
    if (organization.status === OrganizationStatus.ARCHIVED) {
      throw new ApiError(409, 'Organization is archived');
    }
  }

  /** Type guard — never a silent empty assignment list/create for a company org. */
  private assertIsInstitute(organization: IOrganization): void {
    if (organization.type !== OrganizationType.INSTITUTE) {
      throw new ApiError(400, 'This organization is not an institute');
    }
  }

  private toDetail(assignment: any): Record<string, unknown> {
    return {
      assignmentId: assignment._id.toString(),
      organizationId: assignment.organizationId.toString(),
      studentId: assignment.studentId.toString(),
      templateId: assignment.templateId.toString(),
      assignedByMembershipId: assignment.assignedByMembershipId.toString(),
      dueAt: assignment.dueAt,
      instructions: assignment.instructions,
      status: assignment.status,
      interviewId: assignment.interviewId ? assignment.interviewId.toString() : undefined,
      createdAt: assignment.createdAt,
      updatedAt: assignment.updatedAt,
    };
  }
}

export const instituteStudentInterviewAssignmentService = new InstituteStudentInterviewAssignmentService();
