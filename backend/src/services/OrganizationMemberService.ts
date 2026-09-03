import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import OrganizationMember, { IOrganizationMember } from '../models/OrganizationMember.model';
import { OrganizationMemberRole, OrganizationMemberStatus } from '../constants/organizationMember';
import { OrganizationStatus } from '../constants/organization';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { User } from '../models/user.model';
import { ApiError } from '../utils/ApiError';

interface ListMembersParams {
  page: number;
  limit: number;
  role?: OrganizationMemberRole;
  status?: OrganizationMemberStatus;
}

interface AddMemberParams {
  userId: string;
  role: OrganizationMemberRole;
}

interface UpdateMemberParams {
  role?: OrganizationMemberRole;
  status?: OrganizationMemberStatus;
}

/**
 * Organization member management. Authorization is performed by the
 * `requireOrganizationPermission` middleware (8D), which resolves the
 * caller's trusted role and attaches it to the request; these methods take
 * that already-trusted `organizationId`/`actingRole` rather than an
 * `actingUserId` + re-deriving ownership. Each method still re-asserts the
 * relevant permission via the same centralized 8C matrix as defense in
 * depth — never a hardcoded role check, never duplicated matrix logic.
 */
export class OrganizationMemberService {
  /**
   * Upserts exactly one OWNER/ACTIVE membership row mirroring
   * Organization.ownerUserId — the org itself remains the source of truth.
   * Never demotes; corrects an inconsistent existing row back to OWNER.
   * `joinedAt` is only ever set on first insert.
   */
  async ensureOwnerMembership(organizationId: string, ownerUserId: string): Promise<void> {
    await OrganizationMember.findOneAndUpdate(
      {
        organizationId: new Types.ObjectId(organizationId),
        userId: new Types.ObjectId(ownerUserId),
      },
      {
        $setOnInsert: { joinedAt: new Date() },
        $set: { role: OrganizationMemberRole.OWNER, status: OrganizationMemberStatus.ACTIVE },
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
  }

  async getMembers(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    params: ListMembersParams
  ): Promise<{
    members: Array<Record<string, unknown>>;
    pagination: { page: number; limit: number; total: number; pages: number };
  }> {
    this.assertHasPermission(actingRole, OrganizationPermission.MEMBERS_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    // Reads are allowed on an archived org (history) — sync is harmless either way.
    await this.ensureOwnerMembership(organizationId, organization.ownerUserId.toString());

    const filter: Record<string, unknown> = { organizationId: organization._id };
    if (params.role) filter.role = params.role;
    if (params.status) filter.status = params.status;
    const skip = (params.page - 1) * params.limit;

    const [members, total] = await Promise.all([
      OrganizationMember.find(filter)
        .populate('userId', 'name email avatar')
        .sort({ joinedAt: -1 })
        .skip(skip)
        .limit(params.limit)
        .lean(),
      OrganizationMember.countDocuments(filter),
    ]);

    return {
      members: members.map((m) => this.toDetail(m)),
      pagination: { page: params.page, limit: params.limit, total, pages: Math.ceil(total / params.limit) },
    };
  }

  async addMember(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    params: AddMemberParams
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.MEMBERS_MANAGE);
    if (params.role === OrganizationMemberRole.OWNER) {
      throw new ApiError(400, 'Cannot assign the owner role directly');
    }

    const organization = await this.getOrganizationById(organizationId);
    this.assertOrganizationMutable(organization);
    await this.ensureOwnerMembership(organizationId, organization.ownerUserId.toString());

    if (params.userId === organization.ownerUserId.toString()) {
      throw new ApiError(409, 'User is already the organization owner');
    }

    const targetUser = await User.findOne({ _id: params.userId, isActive: true }).select('_id');
    if (!targetUser) {
      throw new ApiError(404, 'User not found');
    }

    const userObjectId = new Types.ObjectId(params.userId);
    const existing = await OrganizationMember.findOne({ organizationId: organization._id, userId: userObjectId });

    if (existing) {
      if (existing.status === OrganizationMemberStatus.ACTIVE) {
        throw new ApiError(409, 'Member already exists');
      }
      // Reactivate — same semantics as a fresh join, not a duplicate row
      // (the unique index forbids a second row anyway).
      existing.status = OrganizationMemberStatus.ACTIVE;
      existing.role = params.role;
      existing.joinedAt = new Date();
      await existing.save();
      return this.toDetail(await this.populateMember(existing._id));
    }

    try {
      const member = await OrganizationMember.create({
        organizationId: organization._id,
        userId: userObjectId,
        role: params.role,
        status: OrganizationMemberStatus.ACTIVE,
        joinedAt: new Date(),
      });
      return this.toDetail(await this.populateMember(member._id));
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ApiError(409, 'Member already exists');
      }
      throw error;
    }
  }

  async updateMember(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    memberId: string,
    params: UpdateMemberParams
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.MEMBERS_MANAGE);
    if (params.role === undefined && params.status === undefined) {
      throw new ApiError(400, 'At least one of role or status is required');
    }
    if (params.role === OrganizationMemberRole.OWNER) {
      throw new ApiError(400, 'Cannot assign the owner role directly');
    }

    const organization = await this.getOrganizationById(organizationId);
    this.assertOrganizationMutable(organization);
    await this.ensureOwnerMembership(organizationId, organization.ownerUserId.toString());

    const member = await OrganizationMember.findOne({ _id: memberId, organizationId: organization._id });
    if (!member) {
      throw new ApiError(404, 'Member not found');
    }
    this.assertNotOwnerMembership(member, organization);

    if (params.role !== undefined) {
      member.role = params.role;
    }
    if (params.status !== undefined) {
      if (params.status === OrganizationMemberStatus.ACTIVE && member.status !== OrganizationMemberStatus.ACTIVE) {
        // Reactivation is treated as rejoining, same as addMember.
        member.joinedAt = new Date();
      }
      member.status = params.status;
    }

    await member.save();
    return this.toDetail(await this.populateMember(member._id));
  }

  /** Soft deactivate only — never a physical delete. Idempotent if already inactive. */
  async removeMember(organizationId: string, actingRole: OrganizationMemberRole, memberId: string): Promise<void> {
    this.assertHasPermission(actingRole, OrganizationPermission.MEMBERS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertOrganizationMutable(organization);
    await this.ensureOwnerMembership(organizationId, organization.ownerUserId.toString());

    const member = await OrganizationMember.findOne({ _id: memberId, organizationId: organization._id });
    if (!member) {
      throw new ApiError(404, 'Member not found');
    }
    this.assertNotOwnerMembership(member, organization);

    if (member.status !== OrganizationMemberStatus.INACTIVE) {
      member.status = OrganizationMemberStatus.INACTIVE;
      await member.save();
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

  private assertNotOwnerMembership(member: IOrganizationMember, organization: IOrganization): void {
    if (member.role === OrganizationMemberRole.OWNER || member.userId.toString() === organization.ownerUserId.toString()) {
      throw new ApiError(400, 'Organization owner membership cannot be modified');
    }
  }

  private async populateMember(memberId: Types.ObjectId): Promise<any> {
    return OrganizationMember.findById(memberId).populate('userId', 'name email avatar').lean();
  }

  private toDetail(member: any): Record<string, unknown> {
    const user = member.userId && typeof member.userId === 'object' ? member.userId : null;
    return {
      id: member._id.toString(),
      organizationId: member.organizationId.toString(),
      user: user
        ? {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            avatar: user.avatar,
          }
        : undefined,
      role: member.role,
      status: member.status,
      joinedAt: member.joinedAt,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
    };
  }
}

export const organizationMemberService = new OrganizationMemberService();
