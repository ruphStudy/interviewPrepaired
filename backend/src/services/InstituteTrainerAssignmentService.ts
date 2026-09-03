import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import OrganizationMember, { IOrganizationMember } from '../models/OrganizationMember.model';
import InstituteCourse from '../models/InstituteCourse.model';
import InstituteBatch from '../models/InstituteBatch.model';
import InstituteTrainerAssignment from '../models/InstituteTrainerAssignment.model';
import { OrganizationMemberRole, OrganizationMemberStatus } from '../constants/organizationMember';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

interface ListAssignmentsParams {
  page: number;
  limit: number;
}

interface CreateAssignmentFields {
  courseId?: string;
  batchId?: string;
}

/**
 * Trainer -> course/batch assignment management (12B). Trainer identity is
 * the EXISTING OrganizationMember (role TRAINER) — same lookup pattern as
 * InstituteTrainerService (12A), duplicated here (not imported, since it's
 * private there) rather than sharing a base class, consistent with how each
 * institute service already keeps its own small org/permission helpers.
 * Authorization mirrors the other institute services: the
 * `requireOrganizationPermission` middleware (8D) resolves the caller's
 * trusted role onto the request, and these methods take that
 * already-trusted `organizationId`/`actingRole`. Institute-only: a COMPANY
 * organization gets 400 from every method here. No student assignment or
 * interview-template logic here — that's 12C+.
 */
export class InstituteTrainerAssignmentService {
  async getAssignments(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    membershipId: string,
    params: ListAssignmentsParams
  ): Promise<{
    assignments: Array<Record<string, unknown>>;
    pagination: { page: number; limit: number; total: number; pages: number };
  }> {
    this.assertHasPermission(actingRole, OrganizationPermission.MEMBERS_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);

    const trainer = await this.loadTrainerMembership(organization._id, membershipId);

    const filter = { organizationId: organization._id, trainerMembershipId: trainer._id };
    const skip = (params.page - 1) * params.limit;

    const [assignments, total] = await Promise.all([
      InstituteTrainerAssignment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(params.limit).lean(),
      InstituteTrainerAssignment.countDocuments(filter),
    ]);

    return {
      assignments: assignments.map((a) => this.toDetail(a)),
      pagination: { page: params.page, limit: params.limit, total, pages: Math.ceil(total / params.limit) },
    };
  }

  /** Requires an ACTIVE same-org TRAINER membership — an inactive trainer cannot receive a new assignment. */
  async createAssignment(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    membershipId: string,
    fields: CreateAssignmentFields
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.MEMBERS_MANAGE);

    const hasCourse = !!fields.courseId;
    const hasBatch = !!fields.batchId;
    if (hasCourse === hasBatch) {
      throw new ApiError(400, 'Provide exactly one of courseId or batchId');
    }

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);
    this.assertOrganizationMutable(organization);

    const trainer = await this.loadTrainerMembership(organization._id, membershipId);
    if (trainer.status !== OrganizationMemberStatus.ACTIVE) {
      throw new ApiError(400, 'Trainer membership must be active to receive a new assignment');
    }

    let courseObjectId: Types.ObjectId | undefined;
    let batchObjectId: Types.ObjectId | undefined;

    if (hasCourse) {
      const course = await InstituteCourse.findOne({ _id: fields.courseId, organizationId: organization._id }).select('_id');
      if (!course) {
        throw new ApiError(404, 'Course not found');
      }
      courseObjectId = course._id as Types.ObjectId;
    } else {
      // Only ownership is validated here — the batch's own course/branch
      // relationships (set at batch creation/update, 11A) are untouched.
      const batch = await InstituteBatch.findOne({ _id: fields.batchId, organizationId: organization._id }).select('_id');
      if (!batch) {
        throw new ApiError(404, 'Batch not found');
      }
      batchObjectId = batch._id as Types.ObjectId;
    }

    try {
      const assignment = await InstituteTrainerAssignment.create({
        organizationId: organization._id,
        trainerMembershipId: trainer._id,
        courseId: courseObjectId,
        batchId: batchObjectId,
      });
      return this.toDetail(assignment.toObject());
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ApiError(409, 'This trainer is already assigned to this target');
      }
      throw error;
    }
  }

  /** Physical delete — this is only a relationship record, not historical interview evidence. Idempotent is NOT applicable: a missing assignment is a 404. */
  async deleteAssignment(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    membershipId: string,
    assignmentId: string
  ): Promise<void> {
    this.assertHasPermission(actingRole, OrganizationPermission.MEMBERS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);
    this.assertOrganizationMutable(organization);

    const trainer = await this.loadTrainerMembership(organization._id, membershipId);

    // Tenant + trainer scoped: never a bare {_id: assignmentId} delete.
    const result = await InstituteTrainerAssignment.deleteOne({
      _id: assignmentId,
      organizationId: organization._id,
      trainerMembershipId: trainer._id,
    });
    if (result.deletedCount === 0) {
      throw new ApiError(404, 'Assignment not found');
    }
  }

  /** A trainer identity is an OrganizationMember with role TRAINER in this exact organization — cross-org, nonexistent, or non-TRAINER membership all return the same 404, never a distinguishable leak. */
  private async loadTrainerMembership(organizationId: unknown, membershipId: string): Promise<IOrganizationMember> {
    const member = await OrganizationMember.findOne({
      _id: membershipId,
      organizationId,
      role: OrganizationMemberRole.TRAINER,
    });
    if (!member) {
      throw new ApiError(404, 'Trainer not found');
    }
    return member;
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

  /** Type guard — never a silent empty assignment list/detail for a company org. */
  private assertIsInstitute(organization: IOrganization): void {
    if (organization.type !== OrganizationType.INSTITUTE) {
      throw new ApiError(400, 'This organization is not an institute');
    }
  }

  private toDetail(assignment: any): Record<string, unknown> {
    return {
      assignmentId: assignment._id.toString(),
      organizationId: assignment.organizationId.toString(),
      trainerMembershipId: assignment.trainerMembershipId.toString(),
      courseId: assignment.courseId ? assignment.courseId.toString() : undefined,
      batchId: assignment.batchId ? assignment.batchId.toString() : undefined,
      createdAt: assignment.createdAt,
    };
  }
}

export const instituteTrainerAssignmentService = new InstituteTrainerAssignmentService();
