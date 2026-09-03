import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import InstituteBranch from '../models/InstituteBranch.model';
import InstituteCourse from '../models/InstituteCourse.model';
import { InstituteCourseStatus } from '../constants/instituteCourse';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

interface ListCoursesParams {
  page: number;
  limit: number;
  status?: InstituteCourseStatus;
  branchId?: string;
}

interface CourseFields {
  name?: string;
  // undefined = leave unchanged, null = clear the branch association,
  // a string = set/change it (revalidated against the same organization).
  branchId?: string | null;
  code?: string;
  description?: string;
  durationMonths?: number;
}

/**
 * Institute course management (10C). Authorization mirrors
 * InstituteBranchService: the `requireOrganizationPermission` middleware
 * (8D) resolves the caller's trusted role onto the request, and these
 * methods take that already-trusted `organizationId`/`actingRole` — never an
 * `actingUserId` + re-deriving ownership. Every method re-asserts the
 * relevant permission via the centralized 8C matrix as defense in depth.
 * Institute-only: a COMPANY organization gets 400 from every method here.
 */
export class InstituteCourseService {
  async getCourses(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    params: ListCoursesParams
  ): Promise<{
    courses: Array<Record<string, unknown>>;
    pagination: { page: number; limit: number; total: number; pages: number };
  }> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);

    const filter: Record<string, unknown> = { organizationId: organization._id };
    if (params.status) filter.status = params.status;
    if (params.branchId) filter.branchId = new Types.ObjectId(params.branchId);
    const skip = (params.page - 1) * params.limit;

    const [courses, total] = await Promise.all([
      InstituteCourse.find(filter).sort({ createdAt: -1 }).skip(skip).limit(params.limit).lean(),
      InstituteCourse.countDocuments(filter),
    ]);

    return {
      courses: courses.map((c) => this.toDetail(c)),
      pagination: { page: params.page, limit: params.limit, total, pages: Math.ceil(total / params.limit) },
    };
  }

  async getCourseById(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    courseId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);

    // Tenant-scoped: never findById(courseId) alone.
    const course = await InstituteCourse.findOne({ _id: courseId, organizationId: organization._id }).lean();
    if (!course) {
      throw new ApiError(404, 'Course not found');
    }
    return this.toDetail(course);
  }

  async createCourse(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    fields: CourseFields
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_UPDATE);

    const name = fields.name?.trim();
    if (!name) {
      throw new ApiError(400, 'name is required');
    }

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);
    this.assertOrganizationMutable(organization);

    const branchObjectId = fields.branchId
      ? await this.assertBranchInOrganization(organization._id, fields.branchId)
      : undefined;

    try {
      const course = await InstituteCourse.create({
        organizationId: organization._id,
        branchId: branchObjectId,
        name,
        code: this.normalizeCode(fields.code),
        description: fields.description?.trim() || undefined,
        durationMonths: fields.durationMonths,
        status: InstituteCourseStatus.ACTIVE,
      });
      return this.toDetail(course.toObject());
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ApiError(409, 'A course with this code already exists in this organization');
      }
      throw error;
    }
  }

  /** PATCH-like merge despite the PUT route — status is never accepted here; DELETE is the only status transition. */
  async updateCourse(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    courseId: string,
    fields: CourseFields
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_UPDATE);
    if (Object.values(fields).every((value) => value === undefined)) {
      throw new ApiError(400, 'At least one field is required');
    }

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);
    this.assertOrganizationMutable(organization);

    const course = await InstituteCourse.findOne({ _id: courseId, organizationId: organization._id });
    if (!course) {
      throw new ApiError(404, 'Course not found');
    }

    if (fields.name !== undefined) {
      const trimmedName = fields.name.trim();
      if (!trimmedName) {
        throw new ApiError(400, 'name cannot be empty');
      }
      course.name = trimmedName;
    }
    if (fields.branchId !== undefined) {
      course.branchId =
        fields.branchId === null ? undefined : await this.assertBranchInOrganization(organization._id, fields.branchId);
    }
    if (fields.code !== undefined) course.code = this.normalizeCode(fields.code);
    if (fields.description !== undefined) course.description = fields.description.trim() || undefined;
    if (fields.durationMonths !== undefined) course.durationMonths = fields.durationMonths;

    try {
      await course.save();
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ApiError(409, 'A course with this code already exists in this organization');
      }
      throw error;
    }

    return this.toDetail(course.toObject());
  }

  /** Soft deactivate only — never a physical delete. Idempotent if already inactive. */
  async removeCourse(organizationId: string, actingRole: OrganizationMemberRole, courseId: string): Promise<void> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_UPDATE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);
    this.assertOrganizationMutable(organization);

    const course = await InstituteCourse.findOne({ _id: courseId, organizationId: organization._id });
    if (!course) {
      throw new ApiError(404, 'Course not found');
    }

    if (course.status !== InstituteCourseStatus.INACTIVE) {
      course.status = InstituteCourseStatus.INACTIVE;
      await course.save();
    }
  }

  /** A supplied branchId must belong to the SAME organization — a cross-org branch id is treated identically to a nonexistent one (404), never leaked as a distinguishable error. */
  private async assertBranchInOrganization(organizationId: unknown, branchId: string): Promise<Types.ObjectId> {
    const branch = await InstituteBranch.findOne({ _id: branchId, organizationId }).select('_id');
    if (!branch) {
      throw new ApiError(404, 'Branch not found');
    }
    return branch._id as Types.ObjectId;
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

  /** Type guard — never a silent empty course list/detail for a company org. */
  private assertIsInstitute(organization: IOrganization): void {
    if (organization.type !== OrganizationType.INSTITUTE) {
      throw new ApiError(400, 'This organization is not an institute');
    }
  }

  private toDetail(course: any): Record<string, unknown> {
    return {
      id: course._id.toString(),
      organizationId: course.organizationId.toString(),
      branchId: course.branchId ? course.branchId.toString() : undefined,
      name: course.name,
      code: course.code,
      description: course.description,
      durationMonths: course.durationMonths,
      status: course.status,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
    };
  }
}

export const instituteCourseService = new InstituteCourseService();
