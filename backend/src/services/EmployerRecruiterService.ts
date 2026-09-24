import Organization, { IOrganization } from '../models/Organization.model';
import OrganizationMember from '../models/OrganizationMember.model';
import { OrganizationMemberRole, OrganizationMemberStatus } from '../constants/organizationMember';
import { OrganizationInvitationStatus } from '../constants/organizationInvitation';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { User } from '../models/user.model';
import { organizationInvitationService } from './OrganizationInvitationService';
import { organizationProvisioningAuditService } from './OrganizationProvisioningAuditService';
import { ApiError } from '../utils/ApiError';

interface ListRecruitersParams {
  page: number;
  limit: number;
  status?: OrganizationMemberStatus;
  search?: string;
}

interface InviteRecruiterFields {
  name?: string;
  email: string;
}

/**
 * Employer recruiter/hiring-manager management (PR-PEOPLE-2). Recruiter
 * identity is the EXISTING OrganizationMember row with role RECRUITER — no
 * separate Recruiter/account model, exactly mirroring how
 * InstituteTrainerService treats TRAINER. `HIRING_MANAGER` (per the master
 * prompt's "RECRUITER / HIRING_MANAGER as already modeled") is a SEPARATE,
 * job-local concept (`EmployerJobHiringTeamRole`, via
 * EmployerJobHiringTeamService) layered on top of an existing
 * OrganizationMember — never a second org-level role to create here; once
 * someone has a RECRUITER (or any) org membership, assigning them
 * HIRING_MANAGER on a specific job already works unchanged via that
 * existing feature. Disable/reactivate for an existing recruiter already
 * works unchanged via the generic `organizationMemberService`
 * (removeMember/updateMember) and the `/organizations/:id/members` routes
 * — not duplicated here. `inviteRecruiter` covers the one real gap:
 * onboarding a Recruiter whose email has no User yet.
 */
export class EmployerRecruiterService {
  async getRecruiters(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    params: ListRecruitersParams
  ): Promise<{
    recruiters: Array<Record<string, unknown>>;
    pagination: { page: number; limit: number; total: number; pages: number };
  }> {
    this.assertHasPermission(actingRole, OrganizationPermission.MEMBERS_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const filter: Record<string, unknown> = { organizationId: organization._id, role: OrganizationMemberRole.RECRUITER };
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

    return {
      recruiters: members.map((m) => this.toDetail(m)),
      pagination: { page: params.page, limit: params.limit, total, pages: Math.ceil(total / params.limit) },
    };
  }

  /**
   * Onboards a Recruiter whose email may not have a User yet. Thin
   * Employer-scoped wrapper around the generic member-invitation flow —
   * `organizationInvitationService.createInvitation` already (a) resolves
   * an existing User by email or creates one awaiting activation if none
   * exists, (b) rejects/rotates duplicate active invites, (c) rejects an
   * already-ACTIVE Recruiter/member, and (d) is reused UNCHANGED by every
   * other member-invite caller (Institute Trainer included). An EXISTING
   * user + EXISTING account can still be added directly via the generic
   * `POST /:organizationId/members` (role: recruiter).
   */
  async inviteRecruiter(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    actorUserId: string,
    fields: InviteRecruiterFields
  ): Promise<Record<string, unknown>> {
    const email = fields.email?.trim();
    if (!email) {
      throw new ApiError(400, 'email is required');
    }

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const { invitation } = await organizationInvitationService.createInvitation(organizationId, actingRole, actorUserId, {
      email,
      role: OrganizationMemberRole.RECRUITER,
      name: fields.name,
    });

    await organizationProvisioningAuditService.record('recruiter_invited', {
      actorUserId,
      organizationId,
      metadata: { email: email.trim().toLowerCase() },
    });

    return invitation;
  }

  /** Pending/all RECRUITER-role invitations for this employer — reuses the existing generic invitation listing, scoped by role. */
  async listRecruiterInvitations(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    params: { page: number; limit: number; status?: OrganizationInvitationStatus }
  ): Promise<{ invitations: Array<Record<string, unknown>>; pagination: { page: number; limit: number; total: number; pages: number } }> {
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    return organizationInvitationService.getInvitations(organizationId, actingRole, {
      page: params.page,
      limit: params.limit,
      status: params.status,
      role: OrganizationMemberRole.RECRUITER,
    });
  }

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

  /** ARCHIVED and SUSPENDED both block mutation — same D6 treatment as OrganizationService/OrganizationMemberService/OrganizationInvitationService. */
  private assertOrganizationMutable(organization: IOrganization): void {
    if (organization.status === OrganizationStatus.ARCHIVED) {
      throw new ApiError(409, 'Organization is archived');
    }
    if (organization.status === OrganizationStatus.SUSPENDED) {
      throw new ApiError(409, 'Organization is suspended');
    }
  }

  /** Type guard — never a silent empty recruiter list for an institute org. */
  private assertIsCompany(organization: IOrganization): void {
    if (organization.type !== OrganizationType.COMPANY) {
      throw new ApiError(400, 'This organization is not a company');
    }
  }

  private toDetail(member: any): Record<string, unknown> {
    const user = member.userId && typeof member.userId === 'object' ? member.userId : null;
    return {
      membershipId: member._id.toString(),
      organizationId: member.organizationId.toString(),
      user: user
        ? {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
          }
        : undefined,
      status: member.status,
      joinedAt: member.joinedAt,
    };
  }
}

export const employerRecruiterService = new EmployerRecruiterService();
