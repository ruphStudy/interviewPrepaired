import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import InstituteBranch from '../models/InstituteBranch.model';
import InstituteCourse from '../models/InstituteCourse.model';
import InstituteBatch from '../models/InstituteBatch.model';
import InstituteStudent from '../models/InstituteStudent.model';
import { User } from '../models/user.model';
import { InstituteStudentStatus } from '../constants/instituteStudent';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

interface BatchRef {
  _id: Types.ObjectId;
  courseId: Types.ObjectId;
  branchId?: Types.ObjectId;
}

interface ResolvedRelationships {
  batchId?: Types.ObjectId;
  courseId?: Types.ObjectId;
  branchId?: Types.ObjectId;
}

interface RelationshipInput {
  batchId?: string;
  courseId?: string;
  branchId?: string;
}

interface ListStudentsParams {
  page: number;
  limit: number;
  status?: InstituteStudentStatus;
  batchId?: string;
  courseId?: string;
  branchId?: string;
  search?: string;
}

interface StudentFields {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  enrollmentNumber?: string;
  graduationYear?: number;
  // undefined = leave unchanged, null = clear, a string = set/change
  // (revalidated for same-org membership and mutual consistency).
  batchId?: string | null;
  courseId?: string | null;
  branchId?: string | null;
}

/**
 * Institute student management (11B). Authorization mirrors
 * InstituteBatchService: the `requireOrganizationPermission` middleware
 * (8D) resolves the caller's trusted role onto the request, and these
 * methods take that already-trusted `organizationId`/`actingRole` — never an
 * `actingUserId` + re-deriving ownership. Every method re-asserts the
 * relevant permission via the centralized 8C matrix as defense in depth.
 * Institute-only: a COMPANY organization gets 400 from every method here.
 * Roster/profile data only — no registration/auth (11C), bulk import (11D),
 * or assignment logic (11E).
 */
export class InstituteStudentService {
  async getStudents(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    params: ListStudentsParams
  ): Promise<{
    students: Array<Record<string, unknown>>;
    pagination: { page: number; limit: number; total: number; pages: number };
  }> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);

    const filter: Record<string, unknown> = { organizationId: organization._id };
    if (params.status) filter.status = params.status;
    if (params.batchId) filter.batchId = new Types.ObjectId(params.batchId);
    if (params.courseId) filter.courseId = new Types.ObjectId(params.courseId);
    if (params.branchId) filter.branchId = new Types.ObjectId(params.branchId);

    const search = params.search?.trim();
    if (search) {
      // Escape regex metacharacters — this is a plain substring search, not a pattern language exposed to the caller.
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(escaped, 'i');
      filter.$or = [{ firstName: pattern }, { lastName: pattern }, { email: pattern }, { enrollmentNumber: pattern }];
    }

    const skip = (params.page - 1) * params.limit;

    const [students, total] = await Promise.all([
      InstituteStudent.find(filter).sort({ createdAt: -1 }).skip(skip).limit(params.limit).lean(),
      InstituteStudent.countDocuments(filter),
    ]);

    return {
      students: students.map((s) => this.toDetail(s)),
      pagination: { page: params.page, limit: params.limit, total, pages: Math.ceil(total / params.limit) },
    };
  }

  async getStudentById(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    studentId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);

    // Tenant-scoped: never findById(studentId) alone.
    const student = await InstituteStudent.findOne({ _id: studentId, organizationId: organization._id }).lean();
    if (!student) {
      throw new ApiError(404, 'Student not found');
    }
    return this.toDetail(student);
  }

  async createStudent(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    fields: StudentFields
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_UPDATE);

    const firstName = fields.firstName?.trim();
    if (!firstName) {
      throw new ApiError(400, 'firstName is required');
    }

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);
    this.assertOrganizationMutable(organization);

    const resolved = await this.resolveRelationships(organization._id, {
      batchId: fields.batchId ?? undefined,
      courseId: fields.courseId ?? undefined,
      branchId: fields.branchId ?? undefined,
    });

    try {
      const student = await InstituteStudent.create({
        organizationId: organization._id,
        batchId: resolved.batchId,
        courseId: resolved.courseId,
        branchId: resolved.branchId,
        firstName,
        lastName: fields.lastName?.trim() || undefined,
        email: fields.email?.trim().toLowerCase() || undefined,
        phone: fields.phone?.trim() || undefined,
        enrollmentNumber: fields.enrollmentNumber?.trim() || undefined,
        graduationYear: fields.graduationYear,
        status: InstituteStudentStatus.ACTIVE,
      });
      return this.toDetail(student.toObject());
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ApiError(409, 'A student with this enrollment number already exists in this organization');
      }
      throw error;
    }
  }

  /** PATCH-like merge despite the PUT route — status is never accepted here; DELETE is the only status transition. */
  async updateStudent(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    studentId: string,
    fields: StudentFields
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_UPDATE);
    if (Object.values(fields).every((value) => value === undefined)) {
      throw new ApiError(400, 'At least one field is required');
    }

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);
    this.assertOrganizationMutable(organization);

    const student = await InstituteStudent.findOne({ _id: studentId, organizationId: organization._id });
    if (!student) {
      throw new ApiError(404, 'Student not found');
    }

    if (fields.firstName !== undefined) {
      const trimmed = fields.firstName.trim();
      if (!trimmed) {
        throw new ApiError(400, 'firstName cannot be empty');
      }
      student.firstName = trimmed;
    }
    if (fields.lastName !== undefined) student.lastName = fields.lastName.trim() || undefined;
    if (fields.email !== undefined) student.email = fields.email.trim().toLowerCase() || undefined;
    if (fields.phone !== undefined) student.phone = fields.phone.trim() || undefined;
    if (fields.enrollmentNumber !== undefined) student.enrollmentNumber = fields.enrollmentNumber.trim() || undefined;
    if (fields.graduationYear !== undefined) student.graduationYear = fields.graduationYear;

    const relationshipChanged = fields.batchId !== undefined || fields.courseId !== undefined || fields.branchId !== undefined;
    if (relationshipChanged) {
      // Re-resolve using the FINAL effective batch/course/branch — an
      // explicitly supplied field wins, otherwise fall back to whatever the
      // student currently has, so e.g. changing only branchId still
      // re-validates against the existing batch/course.
      const effectiveBatchId =
        fields.batchId !== undefined ? fields.batchId ?? undefined : student.batchId?.toString();
      const effectiveCourseId =
        fields.courseId !== undefined ? fields.courseId ?? undefined : student.courseId?.toString();
      const effectiveBranchId =
        fields.branchId !== undefined ? fields.branchId ?? undefined : student.branchId?.toString();

      const resolved = await this.resolveRelationships(organization._id, {
        batchId: effectiveBatchId,
        courseId: effectiveCourseId,
        branchId: effectiveBranchId,
      });

      student.batchId = resolved.batchId;
      student.courseId = resolved.courseId;
      student.branchId = resolved.branchId;
    }

    try {
      await student.save();
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ApiError(409, 'A student with this enrollment number already exists in this organization');
      }
      throw error;
    }

    return this.toDetail(student.toObject());
  }

  /** Soft deactivate only — never a physical delete. Idempotent if already inactive. */
  async removeStudent(organizationId: string, actingRole: OrganizationMemberRole, studentId: string): Promise<void> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_UPDATE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);
    this.assertOrganizationMutable(organization);

    const student = await InstituteStudent.findOne({ _id: studentId, organizationId: organization._id });
    if (!student) {
      throw new ApiError(404, 'Student not found');
    }

    if (student.status !== InstituteStudentStatus.INACTIVE) {
      student.status = InstituteStudentStatus.INACTIVE;
      await student.save();
    }
  }

  /**
   * Links this student record to an EXISTING, active User account (11C) —
   * never creates a User, never touches User.role, never creates an
   * OrganizationMember row. Resolution: an explicit `userId` is looked up
   * directly; otherwise the student's own email is matched against
   * User.email (normalized lowercase). Idempotent if already linked to the
   * same user; a mismatch with an existing different link, an email
   * mismatch, or a user already linked to another student in this
   * organization all fail with 409 rather than silently reassigning.
   */
  async linkUser(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    studentId: string,
    userId?: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_UPDATE);

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);
    this.assertOrganizationMutable(organization);

    const student = await InstituteStudent.findOne({ _id: studentId, organizationId: organization._id });
    if (!student) {
      throw new ApiError(404, 'Student not found');
    }

    const targetUser = userId
      ? await this.loadActiveUserById(userId)
      : await this.loadActiveUserByEmail(student.email);

    // Email safety: if the student has an email on file, the linked user's
    // email must match it exactly (normalized) — never a silent mismatch.
    if (student.email && student.email.trim().toLowerCase() !== targetUser.email.trim().toLowerCase()) {
      throw new ApiError(409, "Linked user's email does not match the student's email");
    }

    // Idempotent: already linked to this exact user.
    if (student.userId && student.userId.toString() === targetUser._id.toString()) {
      return this.toDetail(student.toObject());
    }

    // Already linked to a DIFFERENT user — no silent reassignment.
    if (student.userId) {
      throw new ApiError(409, 'This student is already linked to a different user account');
    }

    // Same org + user cannot be linked to two student records.
    const existingLinkForUser = await InstituteStudent.findOne({
      organizationId: organization._id,
      userId: targetUser._id,
      _id: { $ne: student._id },
    }).select('_id');
    if (existingLinkForUser) {
      throw new ApiError(409, 'This user account is already linked to a different student in this organization');
    }

    student.userId = targetUser._id;
    await student.save();

    return this.toDetail(student.toObject());
  }

  /** Unlinks only — never deletes/deactivates the User account. Idempotent if already unlinked. */
  async unlinkUser(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    studentId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_UPDATE);

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);
    this.assertOrganizationMutable(organization);

    const student = await InstituteStudent.findOne({ _id: studentId, organizationId: organization._id });
    if (!student) {
      throw new ApiError(404, 'Student not found');
    }

    if (student.userId !== undefined) {
      student.userId = undefined;
      await student.save();
    }

    return this.toDetail(student.toObject());
  }

  private async loadActiveUserById(userId: string): Promise<{ _id: Types.ObjectId; email: string }> {
    const user = await User.findOne({ _id: userId, isActive: true }).select('_id email');
    if (!user) {
      throw new ApiError(404, 'User not found');
    }
    return { _id: user._id as Types.ObjectId, email: user.email };
  }

  private async loadActiveUserByEmail(email?: string): Promise<{ _id: Types.ObjectId; email: string }> {
    if (!email) {
      throw new ApiError(400, 'Provide userId — this student has no email to match against');
    }
    const user = await User.findOne({ email: email.trim().toLowerCase(), isActive: true }).select('_id email');
    if (!user) {
      throw new ApiError(404, 'User not found');
    }
    return { _id: user._id as Types.ObjectId, email: user.email };
  }

  /**
   * Single source of truth for batch/course/branch consistency. When a
   * batchId is supplied, its own courseId/branchId are authoritative —
   * derived onto the result — and an independently supplied courseId/
   * branchId is only accepted if it matches the batch's values (400
   * otherwise). Without a batchId, courseId/branchId are independent,
   * individually organization-scoped references.
   */
  private async resolveRelationships(organizationId: unknown, input: RelationshipInput): Promise<ResolvedRelationships> {
    if (!input.batchId) {
      const [course, branch] = await Promise.all([
        input.courseId ? this.loadCourseInOrganization(organizationId, input.courseId) : undefined,
        input.branchId ? this.loadBranchInOrganization(organizationId, input.branchId) : undefined,
      ]);
      return {
        courseId: course?._id as Types.ObjectId | undefined,
        branchId: branch?._id as Types.ObjectId | undefined,
      };
    }

    const batch = await this.loadBatchInOrganization(organizationId, input.batchId);

    if (input.courseId && input.courseId !== batch.courseId.toString()) {
      throw new ApiError(400, "courseId does not match the selected batch's course");
    }
    if (batch.branchId && input.branchId && input.branchId !== batch.branchId.toString()) {
      throw new ApiError(400, "branchId does not match the selected batch's branch");
    }

    let branchId = batch.branchId;
    if (!batch.branchId && input.branchId) {
      // The batch itself isn't branch-scoped — an independently supplied
      // branch is allowed, still validated against the same organization.
      const branch = await this.loadBranchInOrganization(organizationId, input.branchId);
      branchId = branch._id as Types.ObjectId;
    }

    return { batchId: batch._id, courseId: batch.courseId, branchId };
  }

  /** A supplied batchId must belong to the SAME organization — a cross-org or nonexistent batch both return 404, never a distinguishable leak. */
  private async loadBatchInOrganization(organizationId: unknown, batchId: string): Promise<BatchRef> {
    const batch = await InstituteBatch.findOne({ _id: batchId, organizationId }).select('_id courseId branchId');
    if (!batch) {
      throw new ApiError(404, 'Batch not found');
    }
    return {
      _id: batch._id as Types.ObjectId,
      courseId: batch.courseId as Types.ObjectId,
      branchId: batch.branchId as Types.ObjectId | undefined,
    };
  }

  /** A supplied courseId must belong to the SAME organization — a cross-org or nonexistent course both return 404, never a distinguishable leak. */
  private async loadCourseInOrganization(organizationId: unknown, courseId: string) {
    const course = await InstituteCourse.findOne({ _id: courseId, organizationId }).select('_id');
    if (!course) {
      throw new ApiError(404, 'Course not found');
    }
    return course;
  }

  /** A supplied branchId must belong to the SAME organization — a cross-org or nonexistent branch both return 404, never a distinguishable leak. */
  private async loadBranchInOrganization(organizationId: unknown, branchId: string) {
    const branch = await InstituteBranch.findOne({ _id: branchId, organizationId }).select('_id');
    if (!branch) {
      throw new ApiError(404, 'Branch not found');
    }
    return branch;
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

  /** Type guard — never a silent empty student list/detail for a company org. */
  private assertIsInstitute(organization: IOrganization): void {
    if (organization.type !== OrganizationType.INSTITUTE) {
      throw new ApiError(400, 'This organization is not an institute');
    }
  }

  private toDetail(student: any): Record<string, unknown> {
    return {
      id: student._id.toString(),
      organizationId: student.organizationId.toString(),
      batchId: student.batchId ? student.batchId.toString() : undefined,
      courseId: student.courseId ? student.courseId.toString() : undefined,
      branchId: student.branchId ? student.branchId.toString() : undefined,
      userId: student.userId ? student.userId.toString() : undefined,
      accountLinked: !!student.userId,
      firstName: student.firstName,
      lastName: student.lastName,
      email: student.email,
      phone: student.phone,
      enrollmentNumber: student.enrollmentNumber,
      graduationYear: student.graduationYear,
      status: student.status,
      createdAt: student.createdAt,
      updatedAt: student.updatedAt,
    };
  }
}

export const instituteStudentService = new InstituteStudentService();
