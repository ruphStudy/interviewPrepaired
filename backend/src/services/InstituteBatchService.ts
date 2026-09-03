import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import InstituteBranch from '../models/InstituteBranch.model';
import InstituteCourse from '../models/InstituteCourse.model';
import InstituteBatch from '../models/InstituteBatch.model';
import { InstituteBatchStatus } from '../constants/instituteBatch';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

interface CourseRef {
  _id: Types.ObjectId;
  branchId?: Types.ObjectId;
}

interface ListBatchesParams {
  page: number;
  limit: number;
  status?: InstituteBatchStatus;
  courseId?: string;
  branchId?: string;
}

interface BatchFields {
  name?: string;
  courseId?: string;
  // undefined = leave unchanged, null = clear the branch association,
  // a string = set/change it (revalidated against the same organization
  // and against the batch's course, if that course itself is branch-scoped).
  branchId?: string | null;
  code?: string;
  academicYear?: string;
  startDate?: Date;
  endDate?: Date;
  capacity?: number;
}

/**
 * Institute batch management (11A). Authorization mirrors
 * InstituteCourseService/InstituteBranchService: the
 * `requireOrganizationPermission` middleware (8D) resolves the caller's
 * trusted role onto the request, and these methods take that already-trusted
 * `organizationId`/`actingRole` — never an `actingUserId` + re-deriving
 * ownership. Every method re-asserts the relevant permission via the
 * centralized 8C matrix as defense in depth. Institute-only: a COMPANY
 * organization gets 400 from every method here.
 */
export class InstituteBatchService {
  async getBatches(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    params: ListBatchesParams
  ): Promise<{
    batches: Array<Record<string, unknown>>;
    pagination: { page: number; limit: number; total: number; pages: number };
  }> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);

    const filter: Record<string, unknown> = { organizationId: organization._id };
    if (params.status) filter.status = params.status;
    if (params.courseId) filter.courseId = new Types.ObjectId(params.courseId);
    if (params.branchId) filter.branchId = new Types.ObjectId(params.branchId);
    const skip = (params.page - 1) * params.limit;

    const [batches, total] = await Promise.all([
      InstituteBatch.find(filter).sort({ createdAt: -1 }).skip(skip).limit(params.limit).lean(),
      InstituteBatch.countDocuments(filter),
    ]);

    return {
      batches: batches.map((b) => this.toDetail(b)),
      pagination: { page: params.page, limit: params.limit, total, pages: Math.ceil(total / params.limit) },
    };
  }

  async getBatchById(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    batchId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);

    // Tenant-scoped: never findById(batchId) alone.
    const batch = await InstituteBatch.findOne({ _id: batchId, organizationId: organization._id }).lean();
    if (!batch) {
      throw new ApiError(404, 'Batch not found');
    }
    return this.toDetail(batch);
  }

  async createBatch(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    fields: BatchFields
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_UPDATE);

    const name = fields.name?.trim();
    if (!name) {
      throw new ApiError(400, 'name is required');
    }
    if (!fields.courseId) {
      throw new ApiError(400, 'courseId is required');
    }

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);
    this.assertOrganizationMutable(organization);

    const course = await this.loadCourseInOrganization(organization._id, fields.courseId);

    let branchObjectId: Types.ObjectId | undefined;
    if (fields.branchId) {
      const branch = await this.loadBranchInOrganization(organization._id, fields.branchId);
      branchObjectId = branch._id as Types.ObjectId;
    }
    this.assertBranchMatchesCourse(course, branchObjectId);
    this.assertValidDateRange(fields.startDate, fields.endDate);

    try {
      const batch = await InstituteBatch.create({
        organizationId: organization._id,
        courseId: course._id,
        branchId: branchObjectId,
        name,
        code: this.normalizeCode(fields.code),
        academicYear: fields.academicYear?.trim() || undefined,
        startDate: fields.startDate,
        endDate: fields.endDate,
        capacity: fields.capacity,
        status: InstituteBatchStatus.ACTIVE,
      });
      return this.toDetail(batch.toObject());
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ApiError(409, 'A batch with this code already exists in this organization');
      }
      throw error;
    }
  }

  /** PATCH-like merge despite the PUT route — status is never accepted here; DELETE is the only status transition. */
  async updateBatch(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    batchId: string,
    fields: BatchFields
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_UPDATE);
    if (Object.values(fields).every((value) => value === undefined)) {
      throw new ApiError(400, 'At least one field is required');
    }

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);
    this.assertOrganizationMutable(organization);

    const batch = await InstituteBatch.findOne({ _id: batchId, organizationId: organization._id });
    if (!batch) {
      throw new ApiError(404, 'Batch not found');
    }

    if (fields.name !== undefined) {
      const trimmedName = fields.name.trim();
      if (!trimmedName) {
        throw new ApiError(400, 'name cannot be empty');
      }
      batch.name = trimmedName;
    }

    let course: CourseRef | null = null;
    if (fields.courseId !== undefined) {
      course = await this.loadCourseInOrganization(organization._id, fields.courseId);
      batch.courseId = course._id;
    }

    if (fields.branchId !== undefined) {
      if (fields.branchId === null) {
        batch.branchId = undefined;
      } else {
        const branch = await this.loadBranchInOrganization(organization._id, fields.branchId);
        batch.branchId = branch._id as Types.ObjectId;
      }
    }

    // Re-validate course/branch consistency whenever either side of the
    // relationship changed — using the FINAL effective courseId/branchId.
    if (fields.courseId !== undefined || fields.branchId !== undefined) {
      if (!course) {
        course = await this.loadCourseInOrganization(organization._id, batch.courseId.toString());
      }
      this.assertBranchMatchesCourse(course, batch.branchId);
    }

    if (fields.code !== undefined) batch.code = this.normalizeCode(fields.code);
    if (fields.academicYear !== undefined) batch.academicYear = fields.academicYear.trim() || undefined;
    if (fields.startDate !== undefined) batch.startDate = fields.startDate;
    if (fields.endDate !== undefined) batch.endDate = fields.endDate;
    if (fields.capacity !== undefined) batch.capacity = fields.capacity;

    // Validate the FINAL merged start/end, not just the just-supplied fields.
    this.assertValidDateRange(batch.startDate, batch.endDate);

    try {
      await batch.save();
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ApiError(409, 'A batch with this code already exists in this organization');
      }
      throw error;
    }

    return this.toDetail(batch.toObject());
  }

  /** Soft deactivate only — never a physical delete. Idempotent if already inactive. */
  async removeBatch(organizationId: string, actingRole: OrganizationMemberRole, batchId: string): Promise<void> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_UPDATE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);
    this.assertOrganizationMutable(organization);

    const batch = await InstituteBatch.findOne({ _id: batchId, organizationId: organization._id });
    if (!batch) {
      throw new ApiError(404, 'Batch not found');
    }

    if (batch.status !== InstituteBatchStatus.INACTIVE) {
      batch.status = InstituteBatchStatus.INACTIVE;
      await batch.save();
    }
  }

  /** A supplied courseId must belong to the SAME organization — a cross-org or nonexistent course both return 404, never a distinguishable leak. */
  private async loadCourseInOrganization(organizationId: unknown, courseId: string): Promise<CourseRef> {
    const course = await InstituteCourse.findOne({ _id: courseId, organizationId }).select('_id branchId');
    if (!course) {
      throw new ApiError(404, 'Course not found');
    }
    return { _id: course._id as Types.ObjectId, branchId: course.branchId as Types.ObjectId | undefined };
  }

  /** A supplied branchId must belong to the SAME organization — a cross-org or nonexistent branch both return 404, never a distinguishable leak. */
  private async loadBranchInOrganization(organizationId: unknown, branchId: string) {
    const branch = await InstituteBranch.findOne({ _id: branchId, organizationId }).select('_id');
    if (!branch) {
      throw new ApiError(404, 'Branch not found');
    }
    return branch;
  }

  /** If the course is itself branch-scoped, a supplied batch branchId must match it exactly. */
  private assertBranchMatchesCourse(course: CourseRef, branchId?: Types.ObjectId): void {
    if (course.branchId && branchId && course.branchId.toString() !== branchId.toString()) {
      throw new ApiError(400, "branchId does not match the selected course's branch");
    }
  }

  private assertValidDateRange(startDate?: Date, endDate?: Date): void {
    if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
      throw new ApiError(400, 'endDate must be on or after startDate');
    }
  }

  private normalizeCode(code?: string): string | undefined {
    if (code === undefined) return undefined;
    return code.trim().toUpperCase() || undefined;
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

  /** Type guard — never a silent empty batch list/detail for a company org. */
  private assertIsInstitute(organization: IOrganization): void {
    if (organization.type !== OrganizationType.INSTITUTE) {
      throw new ApiError(400, 'This organization is not an institute');
    }
  }

  private toDetail(batch: any): Record<string, unknown> {
    return {
      id: batch._id.toString(),
      organizationId: batch.organizationId.toString(),
      courseId: batch.courseId.toString(),
      branchId: batch.branchId ? batch.branchId.toString() : undefined,
      name: batch.name,
      code: batch.code,
      academicYear: batch.academicYear,
      startDate: batch.startDate,
      endDate: batch.endDate,
      capacity: batch.capacity,
      status: batch.status,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
    };
  }
}

export const instituteBatchService = new InstituteBatchService();
