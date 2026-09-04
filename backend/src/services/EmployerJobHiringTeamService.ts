import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJob from '../models/EmployerJob.model';
import EmployerJobHiringTeamMember from '../models/EmployerJobHiringTeamMember.model';
import OrganizationMember from '../models/OrganizationMember.model';
import { EmployerJobStatus } from '../constants/employerJob';
import { EmployerJobHiringTeamRole } from '../constants/employerJobHiringTeam';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole, OrganizationMemberStatus } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

interface JobRef {
  _id: Types.ObjectId;
  status: EmployerJobStatus;
}

/**
 * Job-local hiring-team assignments (16D). Every operation verifies the
 * organization exists, is a COMPANY, and that the job belongs to that EXACT
 * organization before touching any hiring-team row — never a bare
 * `findById`. Reads use ORGANIZATION_VIEW (except the available-members
 * lookup, which is a mutation-support read gated by INTERVIEWS_MANAGE since
 * it's only ever used to populate the add-member form); mutations use
 * INTERVIEWS_MANAGE. A hiring-team assignment is metadata ONLY — it never
 * creates a user/member and never changes OrganizationMember.role/status;
 * OWNER/ADMIN/etc. may hold a job-local role independently of their
 * organization-wide role.
 */
export class EmployerJobHiringTeamService {
  /** GET .../hiring-team — read-only, so an archived organization remains readable regardless of job status. */
  async getHiringTeam(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    jobId: string
  ): Promise<Array<Record<string, unknown>>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    const job = await this.getJobInOrganization(organization._id, jobId);

    const rows = await EmployerJobHiringTeamMember.find({ organizationId: organization._id, jobId: job._id })
      .populate({
        path: 'membershipId',
        select: 'role status userId',
        populate: { path: 'userId', select: 'name email' },
      })
      .sort({ createdAt: -1 })
      .lean();

    return rows.map((row) => this.toDetail(row));
  }

  /**
   * GET .../hiring-team/available-members — a minimal, safe lookup so the
   * add-member UI works even when the caller lacks MEMBERS_VIEW (this is
   * gated by INTERVIEWS_MANAGE instead, which the caller must already have
   * to reach the add-member form at all). Returns only ACTIVE same-org
   * members not already on this job's hiring team, and only the fields
   * needed to populate a dropdown — never broader member metadata.
   */
  async getAvailableMembers(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    jobId: string
  ): Promise<Array<Record<string, unknown>>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    const job = await this.getJobInOrganization(organization._id, jobId);

    const alreadyAssignedMembershipIds = await EmployerJobHiringTeamMember.find({
      organizationId: organization._id,
      jobId: job._id,
    }).distinct('membershipId');

    const members = await OrganizationMember.find({
      organizationId: organization._id,
      status: OrganizationMemberStatus.ACTIVE,
      _id: { $nin: alreadyAssignedMembershipIds },
    })
      .select('role userId')
      .populate('userId', 'name email')
      .lean();

    return members.map((member: any) => ({
      id: member._id.toString(),
      name: member.userId?.name,
      email: member.userId?.email,
      organizationRole: member.role,
    }));
  }

  async addHiringTeamMember(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    addedByMembershipId: string,
    jobId: string,
    fields: { membershipId?: string; role?: EmployerJobHiringTeamRole }
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);

    if (!fields.membershipId) {
      throw new ApiError(400, 'membershipId is required');
    }
    if (!fields.role || !Object.values(EmployerJobHiringTeamRole).includes(fields.role)) {
      throw new ApiError(400, 'A valid role is required');
    }

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);
    const job = await this.getJobInOrganization(organization._id, jobId);
    this.assertJobMutable(job);

    // Critical member validation: must be an EXISTING, same-organization,
    // ACTIVE OrganizationMember — never a userId, never created here.
    const member = await OrganizationMember.findOne({
      _id: fields.membershipId,
      organizationId: organization._id,
      status: OrganizationMemberStatus.ACTIVE,
    }).select('_id');
    if (!member) {
      throw new ApiError(404, 'Organization member not found');
    }

    try {
      const row = await EmployerJobHiringTeamMember.create({
        organizationId: organization._id,
        jobId: job._id,
        membershipId: member._id,
        role: fields.role,
        addedByMembershipId: new Types.ObjectId(addedByMembershipId),
      });
      return this.toDetail(await this.populateRow(row._id as Types.ObjectId));
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ApiError(409, 'This member is already on the hiring team for this job');
      }
      throw error;
    }
  }

  /** PATCH-like: only `role` is ever mutable here — membershipId/addedByMembershipId/timestamps are immutable once assigned. */
  async updateHiringTeamMemberRole(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    jobId: string,
    teamMemberId: string,
    role?: EmployerJobHiringTeamRole
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);

    if (!role || !Object.values(EmployerJobHiringTeamRole).includes(role)) {
      throw new ApiError(400, 'A valid role is required');
    }

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);
    const job = await this.getJobInOrganization(organization._id, jobId);
    this.assertJobMutable(job);

    // Tenant + job scoped: never a bare {_id: teamMemberId} lookup.
    const row = await EmployerJobHiringTeamMember.findOne({
      _id: teamMemberId,
      organizationId: organization._id,
      jobId: job._id,
    });
    if (!row) {
      throw new ApiError(404, 'Hiring team member not found');
    }

    row.role = role;
    await row.save();

    return this.toDetail(await this.populateRow(row._id as Types.ObjectId));
  }

  /** Physical delete — this is only an assignment/metadata record, not historical evidence (unlike EmployerJobStatusHistory). */
  async removeHiringTeamMember(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    jobId: string,
    teamMemberId: string
  ): Promise<void> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);
    const job = await this.getJobInOrganization(organization._id, jobId);
    this.assertJobMutable(job);

    const result = await EmployerJobHiringTeamMember.deleteOne({
      _id: teamMemberId,
      organizationId: organization._id,
      jobId: job._id,
    });
    if (result.deletedCount === 0) {
      throw new ApiError(404, 'Hiring team member not found');
    }
  }

  /** Exact {_id, organizationId} match only — a cross-org job id is treated identically to a nonexistent one (404). */
  private async getJobInOrganization(organizationId: Types.ObjectId, jobId: string): Promise<JobRef> {
    const job = await EmployerJob.findOne({ _id: jobId, organizationId }).select('_id status').lean();
    if (!job) {
      throw new ApiError(404, 'Job not found');
    }
    return { _id: job._id as Types.ObjectId, status: job.status };
  }

  /** An archived JOB (independent of organization archival) can still be read, but its hiring team is no longer editable. */
  private assertJobMutable(job: JobRef): void {
    if (job.status === EmployerJobStatus.ARCHIVED) {
      throw new ApiError(409, 'Job is archived and its hiring team cannot be modified');
    }
  }

  private async populateRow(id: Types.ObjectId): Promise<any> {
    return EmployerJobHiringTeamMember.findById(id)
      .populate({
        path: 'membershipId',
        select: 'role status userId',
        populate: { path: 'userId', select: 'name email' },
      })
      .lean();
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

  /** Type guard — hiring teams don't apply to an institute org. */
  private assertIsCompany(organization: IOrganization): void {
    if (organization.type !== OrganizationType.COMPANY) {
      throw new ApiError(400, 'This organization is not a company');
    }
  }

  /** Never exposes auth/security internals — only name/email (from User) and role/status (from OrganizationMember). */
  private toDetail(row: any): Record<string, unknown> {
    const member = row.membershipId && typeof row.membershipId === 'object' ? row.membershipId : null;
    const user = member?.userId && typeof member.userId === 'object' ? member.userId : null;
    return {
      id: row._id.toString(),
      membershipId: (member?._id ?? row.membershipId).toString(),
      role: row.role,
      member: member
        ? {
            name: user?.name,
            email: user?.email,
            organizationRole: member.role,
            status: member.status,
          }
        : undefined,
      addedByMembershipId: row.addedByMembershipId.toString(),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

export const employerJobHiringTeamService = new EmployerJobHiringTeamService();
