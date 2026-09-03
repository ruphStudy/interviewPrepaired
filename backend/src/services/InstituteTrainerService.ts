import Organization, { IOrganization } from '../models/Organization.model';
import OrganizationMember, { IOrganizationMember } from '../models/OrganizationMember.model';
import InstituteTrainerProfile from '../models/InstituteTrainerProfile.model';
import { InstituteTrainerProfileStatus } from '../constants/instituteTrainerProfile';
import { OrganizationMemberRole, OrganizationMemberStatus } from '../constants/organizationMember';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { User } from '../models/user.model';
import { ApiError } from '../utils/ApiError';

interface ListTrainersParams {
  page: number;
  limit: number;
  status?: OrganizationMemberStatus;
  search?: string;
}

interface TrainerProfileFields {
  employeeCode?: string;
  designation?: string;
  department?: string;
  specialization?: string[];
  bio?: string;
}

/**
 * Institute trainer management (12A). Trainer identity is the EXISTING
 * OrganizationMember row with role TRAINER — no separate Trainer/account
 * model. Authorization mirrors the other institute services: the
 * `requireOrganizationPermission` middleware (8D) resolves the caller's
 * trusted role onto the request, and these methods take that
 * already-trusted `organizationId`/`actingRole` — never an `actingUserId` +
 * re-deriving ownership. Every method re-asserts the relevant permission
 * via the centralized 8C matrix as defense in depth. Institute-only: a
 * COMPANY organization gets 400 from every method here. Never
 * creates/modifies Users, invitations, or the membership's own role/status —
 * this only manages the optional profile metadata layered on top.
 */
export class InstituteTrainerService {
  async getTrainers(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    params: ListTrainersParams
  ): Promise<{
    trainers: Array<Record<string, unknown>>;
    pagination: { page: number; limit: number; total: number; pages: number };
  }> {
    this.assertHasPermission(actingRole, OrganizationPermission.MEMBERS_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);

    const filter: Record<string, unknown> = { organizationId: organization._id, role: OrganizationMemberRole.TRAINER };
    if (params.status) filter.status = params.status;

    const search = params.search?.trim();
    if (search) {
      // Escape regex metacharacters — this is a plain substring search, not a pattern language exposed to the caller.
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(escaped, 'i');
      const matchingUsers = await User.find({ $or: [{ name: pattern }, { email: pattern }] }).select('_id');
      filter.userId = { $in: matchingUsers.map((u) => u._id) };
    }

    const skip = (params.page - 1) * params.limit;

    const [members, total] = await Promise.all([
      OrganizationMember.find(filter)
        .populate('userId', 'name email')
        .sort({ joinedAt: -1 })
        .skip(skip)
        .limit(params.limit)
        .lean(),
      OrganizationMember.countDocuments(filter),
    ]);

    const membershipIds = members.map((m) => m._id);
    const profiles = await InstituteTrainerProfile.find({
      organizationId: organization._id,
      membershipId: { $in: membershipIds },
    }).lean();
    const profileByMembership = new Map(profiles.map((p) => [p.membershipId.toString(), p]));

    return {
      trainers: members.map((m) => this.toDetail(m, profileByMembership.get(m._id.toString()))),
      pagination: { page: params.page, limit: params.limit, total, pages: Math.ceil(total / params.limit) },
    };
  }

  async getTrainerByMembershipId(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    membershipId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.MEMBERS_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);

    const member = await this.loadTrainerMembership(organization._id, membershipId);
    await member.populate('userId', 'name email');

    const profile = await InstituteTrainerProfile.findOne({
      organizationId: organization._id,
      membershipId: member._id,
    }).lean();

    return this.toDetail(member.toObject(), profile ?? undefined);
  }

  /** PATCH-like merge; creates the profile lazily if it doesn't exist yet. Never touches the membership's own role/status. */
  async updateTrainerProfile(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    membershipId: string,
    fields: TrainerProfileFields
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.MEMBERS_MANAGE);
    if (Object.values(fields).every((value) => value === undefined)) {
      throw new ApiError(400, 'At least one field is required');
    }

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);
    this.assertOrganizationMutable(organization);

    // Unpopulated on purpose — member.userId must stay a raw ObjectId here
    // for the lazy profile create below; population happens separately,
    // after writes, only for the response.
    const member = await this.loadTrainerMembership(organization._id, membershipId);

    let profile = await InstituteTrainerProfile.findOne({ organizationId: organization._id, membershipId: member._id });
    if (!profile) {
      profile = new InstituteTrainerProfile({
        organizationId: organization._id,
        membershipId: member._id,
        userId: member.userId,
        status: InstituteTrainerProfileStatus.ACTIVE,
      });
    }

    if (fields.employeeCode !== undefined) profile.employeeCode = this.normalizeEmployeeCode(fields.employeeCode);
    if (fields.designation !== undefined) profile.designation = fields.designation.trim() || undefined;
    if (fields.department !== undefined) profile.department = fields.department.trim() || undefined;
    if (fields.specialization !== undefined) {
      const cleaned = fields.specialization.map((s) => s.trim()).filter(Boolean);
      profile.specialization = cleaned.length > 0 ? cleaned : undefined;
    }
    if (fields.bio !== undefined) profile.bio = fields.bio.trim() || undefined;

    try {
      await profile.save();
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ApiError(409, 'A trainer with this employee code already exists in this organization');
      }
      throw error;
    }

    await member.populate('userId', 'name email');
    return this.toDetail(member.toObject(), profile.toObject());
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

  private normalizeEmployeeCode(code?: string): string | undefined {
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

  /** Type guard — never a silent empty trainer list/detail for a company org. */
  private assertIsInstitute(organization: IOrganization): void {
    if (organization.type !== OrganizationType.INSTITUTE) {
      throw new ApiError(400, 'This organization is not an institute');
    }
  }

  private toDetail(member: any, profile?: any): Record<string, unknown> {
    const user = member.userId && typeof member.userId === 'object' ? member.userId : null;
    return {
      membershipId: member._id.toString(),
      organizationId: member.organizationId.toString(),
      // Safe user info only — never password/auth secrets.
      user: user
        ? {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
          }
        : undefined,
      status: member.status,
      joinedAt: member.joinedAt,
      profile: profile
        ? {
            employeeCode: profile.employeeCode,
            designation: profile.designation,
            department: profile.department,
            specialization: profile.specialization,
            bio: profile.bio,
            status: profile.status,
            updatedAt: profile.updatedAt,
          }
        : null,
    };
  }
}

export const instituteTrainerService = new InstituteTrainerService();
