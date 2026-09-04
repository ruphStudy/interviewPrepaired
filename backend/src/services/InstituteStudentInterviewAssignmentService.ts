import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import InstituteStudent, { IInstituteStudent } from '../models/InstituteStudent.model';
import InstituteInterviewTemplate, { IInstituteInterviewTemplate } from '../models/InstituteInterviewTemplate.model';
import InstituteStudentInterviewAssignment from '../models/InstituteStudentInterviewAssignment.model';
import QuestionSet from '../models/QuestionSet.model';
import Interview from '../models/interview.model';
import { InstituteStudentInterviewAssignmentStatus } from '../constants/instituteStudentInterviewAssignment';
import { InstituteInterviewTemplateStatus } from '../constants/instituteInterviewTemplate';
import { InstituteStudentStatus } from '../constants/instituteStudent';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';
import { normalizeUploadedQuestions } from './QuestionFileParserService';
import { MAX_UPLOADED_QUESTIONS } from '../constants/interview';
import { InterviewService } from './InterviewService';
import { organizationInterviewCreditService } from './OrganizationInterviewCreditService';

// Matches InterviewController's convention: import the class, instantiate once here.
const interviewService = new InterviewService();

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
   * Admin start (12E) — RBAC-gated, then the shared core. `organizationId`
   * is the caller's trusted organization from `organizationContext`.
   */
  async startAssignment(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    assignmentId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    return this.startAssignmentCore(assignmentId, { organizationId: new Types.ObjectId(organizationId) });
  }

  /**
   * Student self-service start (13C) — no OrganizationMember/RBAC role is
   * faked or required; the caller authorizes strictly by owning an ACTIVE
   * InstituteStudent row. `authScope` becomes an `$or` of every
   * {organizationId, studentId} pair the caller actually owns, so the
   * shared core's `_id` + authScope match can never touch an assignment
   * outside those pairs — cross-user/cross-org/nonexistent are all
   * indistinguishable 404s.
   */
  async startAssignmentForStudent(userId: string, assignmentId: string): Promise<Record<string, unknown>> {
    const students = await InstituteStudent.find({
      userId: new Types.ObjectId(userId),
      status: InstituteStudentStatus.ACTIVE,
    })
      .select('organizationId')
      .lean();

    if (students.length === 0) {
      throw new ApiError(404, 'Assignment not found');
    }

    const authScope = { $or: students.map((s) => ({ organizationId: s.organizationId, studentId: s._id })) };
    return this.startAssignmentCore(assignmentId, authScope);
  }

  /**
   * Shared start core (12E/13C/15E) — one algorithm for both actors.
   * `authScope` is ANDed with `_id` on the initial read AND on the atomic
   * claim, so an unauthorized caller never even learns an assignment
   * exists (404) rather than being told it's in the wrong state. Order:
   * (A) atomic ASSIGNED -> IN_PROGRESS claim, so two concurrent start
   * requests can never both proceed; (B) validate student/template/
   * questionSet (all re-scoped to the assignment's own organization);
   * (C) consume exactly 1 ORGANIZATION interview credit (never a personal
   * B2C credit/subscription) via a deterministic idempotencyKey scoped to
   * this exact claim; (D) create a real uploaded-mode Interview via
   * InterviewService.createInstituteUploadedInterview; (E) link
   * `interviewId` onto the assignment. If anything from (B) onward fails,
   * the assignment is safely reverted to ASSIGNED (only if still owned by
   * this failed start), and — only if the credit was actually consumed in
   * this attempt — that exact credit is refunded first. A repeated call
   * after a successful start is idempotent: it returns the same
   * assignment/interviewId instead of creating a second Interview or
   * consuming a second credit.
   */
  private async startAssignmentCore(
    assignmentId: string,
    authScope: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    // Read-only authorization check first — an unauthorized assignmentId
    // never even reaches the claim attempt.
    const target = await InstituteStudentInterviewAssignment.findOne({ _id: assignmentId, ...authScope }).lean();
    if (!target) {
      throw new ApiError(404, 'Assignment not found');
    }

    const organization = await this.getOrganizationById(target.organizationId.toString());
    this.assertIsInstitute(organization);
    this.assertOrganizationMutable(organization);

    // Sole atomic claim mechanism — only one concurrent caller can win this
    // exact status transition.
    const claimed = await InstituteStudentInterviewAssignment.findOneAndUpdate(
      { _id: assignmentId, organizationId: organization._id, status: InstituteStudentInterviewAssignmentStatus.ASSIGNED },
      { $set: { status: InstituteStudentInterviewAssignmentStatus.IN_PROGRESS } },
      { new: true }
    );

    if (!claimed) {
      const current = await InstituteStudentInterviewAssignment.findOne({
        _id: assignmentId,
        organizationId: organization._id,
      }).lean();
      if (!current) {
        throw new ApiError(404, 'Assignment not found');
      }
      if (current.interviewId) {
        // Already started successfully — idempotent return, no new Interview.
        return this.toDetail(current);
      }
      if (current.status === InstituteStudentInterviewAssignmentStatus.IN_PROGRESS) {
        throw new ApiError(409, 'Assignment is already being started');
      }
      if (current.status === InstituteStudentInterviewAssignmentStatus.CANCELLED) {
        throw new ApiError(409, 'Assignment has been cancelled');
      }
      if (current.status === InstituteStudentInterviewAssignmentStatus.COMPLETED) {
        throw new ApiError(409, 'Assignment is already completed');
      }
      throw new ApiError(409, 'Assignment cannot be started');
    }

    // Unique per claim (not just per assignment): a fresh start attempt
    // after a prior failed-and-refunded attempt gets its own distinct
    // idempotencyKey, since `claimed.updatedAt` was just bumped by the
    // status transition above — so a stale consume/refund pair can never
    // suppress a genuinely new credit consumption.
    const startEpoch = claimed.updatedAt.getTime();
    const consumeIdempotencyKey = `institute-interview-start:${assignmentId}:${startEpoch}`;
    const refundIdempotencyKey = `institute-interview-start-refund:${assignmentId}:${startEpoch}`;
    let creditConsumed = false;

    try {
      const student = await InstituteStudent.findOne({ _id: claimed.studentId, organizationId: organization._id });
      if (!student) {
        throw new ApiError(404, 'Student not found');
      }
      if (student.status !== InstituteStudentStatus.ACTIVE) {
        throw new ApiError(400, 'Student is not active');
      }
      if (!student.userId) {
        throw new ApiError(400, 'Student is not linked to a user account');
      }

      const template = await InstituteInterviewTemplate.findOne({ _id: claimed.templateId, organizationId: organization._id });
      if (!template) {
        throw new ApiError(404, 'Template not found');
      }
      if (template.status !== InstituteInterviewTemplateStatus.ACTIVE) {
        throw new ApiError(400, 'Template is not active');
      }

      this.assertTemplateScopeMatchesStudent(template, student);

      const questionSet = await QuestionSet.findOne({ _id: template.questionSetId, organizationId: organization._id }).select(
        'questions'
      );
      if (!questionSet) {
        throw new ApiError(404, 'Question set not found');
      }

      const normalized = normalizeUploadedQuestions(questionSet.questions);
      if (normalized.length === 0) {
        throw new ApiError(400, 'Question set has no valid questions');
      }

      const questionLimit = template.interviewConfig?.questionLimit;
      const effectiveCount = Math.min(
        questionLimit && questionLimit > 0 ? questionLimit : normalized.length,
        normalized.length,
        MAX_UPLOADED_QUESTIONS
      );
      const selectedQuestions = normalized.slice(0, effectiveCount);

      // Institute billing: exactly 1 ORGANIZATION credit, never a personal
      // B2C credit/subscription. Propagates OrganizationInsufficientCreditsError
      // (402) untouched if the organization has no balance — no Interview is
      // created in that case, and the outer catch reverts the claim.
      await organizationInterviewCreditService.consumeCredit({
        organizationId: organization._id.toString(),
        referenceId: assignmentId,
        idempotencyKey: consumeIdempotencyKey,
        description: 'Interview start for institute assignment',
      });
      creditConsumed = true;

      const interview = await interviewService.createInstituteUploadedInterview({
        userId: student.userId.toString(),
        organizationId: organization._id.toString(),
        topic: template.name,
        difficulty: template.interviewConfig?.difficulty || 'intermediate',
        experienceYears: 0,
        interviewStyle: template.interviewConfig?.style,
        interviewLanguage: template.interviewConfig?.language,
        questions: selectedQuestions,
      });

      // Scoped by status: IN_PROGRESS too — this is the only write that
      // "seals" the new Interview onto the assignment.
      const finalAssignment = await InstituteStudentInterviewAssignment.findOneAndUpdate(
        {
          _id: claimed._id,
          organizationId: organization._id,
          status: InstituteStudentInterviewAssignmentStatus.IN_PROGRESS,
        },
        { $set: { interviewId: interview._id } },
        { new: true }
      ).lean();

      if (!finalAssignment) {
        // The Interview was created but never got linked (assignment no
        // longer matched the expected claimed state) — it would otherwise
        // be an orphan that a retry could duplicate. It was never linked
        // to any assignment, so it's always safe to delete here. Credit
        // refund + assignment revert both happen in the catch block below.
        await Interview.deleteOne({ _id: interview._id, organizationId: organization._id });
        throw new ApiError(409, 'Failed to start assignment — please retry');
      }

      return this.toDetail(finalAssignment);
    } catch (error) {
      // Refund ONLY if this exact attempt actually consumed a credit — a
      // failure before consumeCredit (or consumeCredit itself failing, e.g.
      // insufficient balance) never reaches here with creditConsumed=true,
      // so it's never refunded. Uses the same deterministic per-claim key
      // as the consume, so a retried failure can never double-refund.
      if (creditConsumed) {
        try {
          await organizationInterviewCreditService.refundCredit({
            organizationId: organization._id.toString(),
            referenceId: assignmentId,
            idempotencyKey: refundIdempotencyKey,
            description: 'Refund for failed institute interview start',
          });
        } catch (refundError) {
          // The refund itself failed — a credit is now consumed with
          // nothing to show for it. Restoring the assignment to ASSIGNED
          // here would let a retry consume a SECOND credit while the first
          // is still missing, so it's deliberately left IN_PROGRESS with no
          // interviewId (no other start can claim it in that state) until
          // an operator reconciles the ledger. Both errors are logged —
          // this is a distinct failure mode from the original start error.
          console.error(
            '[InstituteStudentInterviewAssignmentService] Institute interview start failed AND credit refund failed — assignment left IN_PROGRESS pending manual reconciliation:',
            { assignmentId, startError: error, refundError }
          );
          throw new ApiError(500, 'Interview start failed and credit refund requires reconciliation');
        }
      }

      // Only restore if still owned by this failed start (claimed but never
      // reached the interviewId write) — a safe no-op otherwise. Reached
      // only when there was nothing to refund, or the refund succeeded.
      await InstituteStudentInterviewAssignment.updateOne(
        {
          _id: assignmentId,
          organizationId: organization._id,
          status: InstituteStudentInterviewAssignmentStatus.IN_PROGRESS,
          interviewId: { $exists: false },
        },
        { $set: { status: InstituteStudentInterviewAssignmentStatus.ASSIGNED } }
      );
      throw error;
    }
  }

  /**
   * Cancels an assignment (12E) — only ever before completion. ASSIGNED ->
   * CANCELLED is the only real transition; already-CANCELLED is idempotent;
   * IN_PROGRESS/COMPLETED are rejected with 409 (an active or already-run
   * interview is never silently cancelled here).
   */
  async cancelAssignment(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    assignmentId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);
    this.assertOrganizationMutable(organization);

    const cancelled = await InstituteStudentInterviewAssignment.findOneAndUpdate(
      { _id: assignmentId, organizationId: organization._id, status: InstituteStudentInterviewAssignmentStatus.ASSIGNED },
      { $set: { status: InstituteStudentInterviewAssignmentStatus.CANCELLED } },
      { new: true }
    ).lean();
    if (cancelled) {
      return this.toDetail(cancelled);
    }

    const current = await InstituteStudentInterviewAssignment.findOne({
      _id: assignmentId,
      organizationId: organization._id,
    }).lean();
    if (!current) {
      throw new ApiError(404, 'Assignment not found');
    }
    if (current.status === InstituteStudentInterviewAssignmentStatus.CANCELLED) {
      return this.toDetail(current);
    }
    throw new ApiError(409, `Assignment cannot be cancelled while ${current.status}`);
  }

  /** GET detail (12E) — assignment fields plus interviewId/status only, no answer/evaluation leakage. */
  async getAssignmentById(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    assignmentId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);

    const assignment = await InstituteStudentInterviewAssignment.findOne({
      _id: assignmentId,
      organizationId: organization._id,
    }).lean();
    if (!assignment) {
      throw new ApiError(404, 'Assignment not found');
    }
    return this.toDetail(assignment);
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
