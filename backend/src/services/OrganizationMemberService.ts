import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import OrganizationMember, { IOrganizationMember } from '../models/OrganizationMember.model';
import { OrganizationMemberRole, OrganizationMemberStatus } from '../constants/organizationMember';
import { OrganizationStatus } from '../constants/organization';
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
 * Owner-only organization member management (Sprint 8 / 8B). Authorization
 * here is exclusively `Organization.ownerUserId === authenticated userId` —
 * OrganizationMember.role is NOT yet an authorization source (8C/8D).
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
    userId: string,
    organizationId: string,
    params: ListMembersParams
  ): Promise<{
    members: Array<Record<string, unknown>>;
    pagination: { page: number; limit: number; total: number; pages: number };
  }> {
    const organization = await this.getOwnedOrganization(userId, organizationId);
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
    actingUserId: string,
    organizationId: string,
    params: AddMemberParams
  ): Promise<Record<string, unknown>> {
    if (params.role === OrganizationMemberRole.OWNER) {
      throw new ApiError(400, 'Cannot assign the owner role directly');
    }

    const organization = await this.getOwnedOrganization(actingUserId, organizationId);
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
    actingUserId: string,
    organizationId: string,
    memberId: string,
    params: UpdateMemberParams
  ): Promise<Record<string, unknown>> {
    if (params.role === undefined && params.status === undefined) {
      throw new ApiError(400, 'At least one of role or status is required');
    }
    if (params.role === OrganizationMemberRole.OWNER) {
      throw new ApiError(400, 'Cannot assign the owner role directly');
    }

    const organization = await this.getOwnedOrganization(actingUserId, organizationId);
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
  async removeMember(actingUserId: string, organizationId: string, memberId: string): Promise<void> {
    const organization = await this.getOwnedOrganization(actingUserId, organizationId);
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

  /** Ownership check happens in the DB query itself, never fetch-then-compare. */
  private async getOwnedOrganization(userId: string, organizationId: string): Promise<IOrganization> {
    const organization = await Organization.findOne({
      _id: organizationId,
      ownerUserId: new Types.ObjectId(userId),
    });
    if (!organization) {
      throw new ApiError(404, 'Organization not found');
    }
    return organization;
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
