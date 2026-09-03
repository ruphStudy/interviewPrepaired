import crypto from 'crypto';
import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import OrganizationMember from '../models/OrganizationMember.model';
import OrganizationInvitation, { IOrganizationInvitation } from '../models/OrganizationInvitation.model';
import { OrganizationMemberRole, OrganizationMemberStatus } from '../constants/organizationMember';
import { OrganizationInvitationStatus, INVITATION_EXPIRY_MS } from '../constants/organizationInvitation';
import { OrganizationStatus } from '../constants/organization';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { User } from '../models/user.model';
import { ApiError } from '../utils/ApiError';

interface CreateInvitationParams {
  email: string;
  role: OrganizationMemberRole;
}

interface ListInvitationsParams {
  page: number;
  limit: number;
  status?: OrganizationInvitationStatus;
  role?: OrganizationMemberRole;
}

/**
 * Invitation lifecycle is a wholly separate model from OrganizationMember —
 * no `OrganizationMember` row is ever created until `acceptInvitation`
 * succeeds (no "ghost members"). Only a SHA-256 hash of the raw token is
 * ever persisted or logged; the raw token is returned to the caller exactly
 * once, at creation/resend time, because no email-delivery layer exists yet
 * (see controller/route docs — this is a stopgap, not the intended
 * transport).
 */
export class OrganizationInvitationService {
  async createInvitation(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    invitedByUserId: string,
    params: CreateInvitationParams
  ): Promise<{ invitation: Record<string, unknown>; token: string }> {
    this.assertHasPermission(actingRole, OrganizationPermission.MEMBERS_MANAGE);
    if (params.role === OrganizationMemberRole.OWNER) {
      throw new ApiError(400, 'Cannot invite a user as owner');
    }

    const organization = await this.getOrganizationById(organizationId);
    this.assertOrganizationMutable(organization);

    const normalizedEmail = params.email.trim().toLowerCase();

    const invitedUser = await User.findOne({ email: normalizedEmail }).select('_id');
    if (invitedUser) {
      if (invitedUser._id.toString() === organization.ownerUserId.toString()) {
        throw new ApiError(409, 'This user is already the organization owner');
      }
      const existingMembership = await OrganizationMember.findOne({
        organizationId: organization._id,
        userId: invitedUser._id,
      });
      if (existingMembership && existingMembership.status === OrganizationMemberStatus.ACTIVE) {
        throw new ApiError(409, 'This user is already a member of the organization');
      }
      // An INACTIVE former membership is fine — inviting re-adds them via acceptance.
    }

    const { token, tokenHash } = this.generateToken();
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_MS);
    const invitedByObjectId = new Types.ObjectId(invitedByUserId);

    const existingPending = await OrganizationInvitation.findOne({
      organizationId: organization._id,
      email: normalizedEmail,
      status: OrganizationInvitationStatus.PENDING,
    });

    if (existingPending) {
      // Rotate rather than create a duplicate pending row — same invitation
      // record, fresh token/expiry/role/inviter.
      existingPending.tokenHash = tokenHash;
      existingPending.expiresAt = expiresAt;
      existingPending.role = params.role;
      existingPending.invitedByUserId = invitedByObjectId;
      await existingPending.save();
      return { invitation: this.toDetail(existingPending), token };
    }

    const invitation = await OrganizationInvitation.create({
      organizationId: organization._id,
      email: normalizedEmail,
      role: params.role,
      status: OrganizationInvitationStatus.PENDING,
      invitedByUserId: invitedByObjectId,
      tokenHash,
      expiresAt,
    });

    return { invitation: this.toDetail(invitation), token };
  }

  async getInvitations(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    params: ListInvitationsParams
  ): Promise<{
    invitations: Array<Record<string, unknown>>;
    pagination: { page: number; limit: number; total: number; pages: number };
  }> {
    this.assertHasPermission(actingRole, OrganizationPermission.MEMBERS_MANAGE);
    await this.getOrganizationById(organizationId);

    const orgObjectId = new Types.ObjectId(organizationId);

    // Lazily settle stale PENDING rows before listing/counting — one bulk
    // update rather than a save-per-row. History (list on an archived org)
    // stays allowed; this is a read-path correction, not a mutation gate.
    await OrganizationInvitation.updateMany(
      { organizationId: orgObjectId, status: OrganizationInvitationStatus.PENDING, expiresAt: { $lte: new Date() } },
      { $set: { status: OrganizationInvitationStatus.EXPIRED } }
    );

    const filter: Record<string, unknown> = { organizationId: orgObjectId };
    if (params.status) filter.status = params.status;
    if (params.role) filter.role = params.role;
    const skip = (params.page - 1) * params.limit;

    const [invitations, total] = await Promise.all([
      OrganizationInvitation.find(filter).sort({ createdAt: -1 }).skip(skip).limit(params.limit).lean(),
      OrganizationInvitation.countDocuments(filter),
    ]);

    return {
      invitations: invitations.map((inv) => this.toDetail(inv)),
      pagination: { page: params.page, limit: params.limit, total, pages: Math.ceil(total / params.limit) },
    };
  }

  /** Public — no auth. Never exposes the token hash or the full invitee email. */
  async getInvitationByToken(rawToken: string): Promise<Record<string, unknown>> {
    const tokenHash = this.hashToken(rawToken);
    const invitation = await OrganizationInvitation.findOne({ tokenHash });
    if (!invitation) {
      throw new ApiError(404, 'Invitation not found');
    }

    await this.lazilyExpire(invitation);

    if (invitation.status === OrganizationInvitationStatus.EXPIRED) {
      throw new ApiError(410, 'Invitation has expired');
    }
    if (
      invitation.status === OrganizationInvitationStatus.REVOKED ||
      invitation.status === OrganizationInvitationStatus.ACCEPTED
    ) {
      throw new ApiError(409, `Invitation is ${invitation.status}`);
    }

    const organization = await Organization.findById(invitation.organizationId).select('name slug type status');
    if (!organization || organization.status === OrganizationStatus.ARCHIVED) {
      throw new ApiError(409, 'Organization is no longer available');
    }

    return {
      organization: { id: organization._id.toString(), name: organization.name, slug: organization.slug },
      role: invitation.role,
      email: this.maskEmail(invitation.email),
      expiresAt: invitation.expiresAt,
    };
  }

  /** Requires an authenticated user whose account email matches the invitation exactly. */
  async acceptInvitation(
    rawToken: string,
    userId: string,
    userEmail: string
  ): Promise<Record<string, unknown>> {
    const tokenHash = this.hashToken(rawToken);
    const invitation = await OrganizationInvitation.findOne({ tokenHash });
    if (!invitation) {
      throw new ApiError(404, 'Invitation not found');
    }

    await this.lazilyExpire(invitation);

    if (invitation.status === OrganizationInvitationStatus.EXPIRED) {
      throw new ApiError(410, 'Invitation has expired');
    }
    if (invitation.status === OrganizationInvitationStatus.REVOKED) {
      throw new ApiError(409, 'Invitation has been revoked');
    }
    if (invitation.status === OrganizationInvitationStatus.ACCEPTED) {
      throw new ApiError(409, 'Invitation has already been accepted');
    }

    const normalizedUserEmail = userEmail.trim().toLowerCase();
    if (normalizedUserEmail !== invitation.email) {
      throw new ApiError(403, 'This invitation was sent to a different email address');
    }

    const organization = await Organization.findById(invitation.organizationId);
    if (!organization) {
      throw new ApiError(404, 'Organization not found');
    }
    this.assertOrganizationMutable(organization);

    if (userId === organization.ownerUserId.toString()) {
      throw new ApiError(409, 'You are already the organization owner');
    }

    const userObjectId = new Types.ObjectId(userId);
    const existingMembership = await OrganizationMember.findOne({ organizationId: organization._id, userId: userObjectId });

    if (existingMembership) {
      if (existingMembership.status !== OrganizationMemberStatus.ACTIVE) {
        existingMembership.status = OrganizationMemberStatus.ACTIVE;
        existingMembership.role = invitation.role;
        existingMembership.joinedAt = new Date();
        await existingMembership.save();
      }
      // else: already ACTIVE — idempotent no-op, no duplicate membership.
    } else {
      try {
        await OrganizationMember.create({
          organizationId: organization._id,
          userId: userObjectId,
          role: invitation.role,
          status: OrganizationMemberStatus.ACTIVE,
          joinedAt: new Date(),
        });
      } catch (error: any) {
        // Race: a concurrent accept already created the membership — fine, continue.
        if (error?.code !== 11000) throw error;
      }
    }

    // Only the first concurrent winner flips PENDING -> ACCEPTED; a loser
    // re-reads the now-accepted row rather than erroring or double-writing.
    await OrganizationInvitation.findOneAndUpdate(
      { _id: invitation._id, status: OrganizationInvitationStatus.PENDING },
      { $set: { status: OrganizationInvitationStatus.ACCEPTED, acceptedByUserId: userObjectId, acceptedAt: new Date() } }
    );

    // Re-read the final membership rather than trusting the branch taken
    // above — a concurrent request may have created/reactivated it instead.
    const finalMembership = await OrganizationMember.findOne({ organizationId: organization._id, userId: userObjectId });
    if (!finalMembership) {
      throw new ApiError(500, 'Membership was not created');
    }

    return {
      organization: {
        id: organization._id.toString(),
        name: organization.name,
        slug: organization.slug,
        type: organization.type,
      },
      membership: {
        id: finalMembership._id.toString(),
        role: finalMembership.role,
        status: finalMembership.status,
        joinedAt: finalMembership.joinedAt,
      },
    };
  }

  /** Org-scoped lookup only (`{_id, organizationId}`), never a bare `findById` — never physically deletes. */
  async revokeInvitation(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    invitationId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.MEMBERS_MANAGE);

    const organization = await this.getOrganizationById(organizationId);
    this.assertOrganizationMutable(organization);

    const invitation = await OrganizationInvitation.findOne({
      _id: invitationId,
      organizationId: organization._id,
    });
    if (!invitation) {
      throw new ApiError(404, 'Invitation not found');
    }

    await this.lazilyExpire(invitation);

    if (invitation.status === OrganizationInvitationStatus.ACCEPTED) {
      throw new ApiError(409, 'Invitation has already been accepted');
    }
    if (invitation.status === OrganizationInvitationStatus.EXPIRED) {
      throw new ApiError(409, 'Invitation is already expired');
    }
    if (invitation.status === OrganizationInvitationStatus.REVOKED) {
      // Idempotently re-revokable — no error on a second revoke.
      return this.toDetail(invitation);
    }

    invitation.status = OrganizationInvitationStatus.REVOKED;
    invitation.revokedAt = new Date();
    await invitation.save();
    return this.toDetail(invitation);
  }

  private generateToken(): { token: string; tokenHash: string } {
    const token = crypto.randomBytes(32).toString('hex');
    return { token, tokenHash: this.hashToken(token) };
  }

  private hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return email;
    const visible = local.slice(0, 1) || '*';
    return `${visible}${'*'.repeat(Math.max(local.length - 1, 1))}@${domain}`;
  }

  private async lazilyExpire(invitation: IOrganizationInvitation): Promise<void> {
    if (invitation.status === OrganizationInvitationStatus.PENDING && invitation.expiresAt < new Date()) {
      invitation.status = OrganizationInvitationStatus.EXPIRED;
      await invitation.save();
    }
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

  private assertOrganizationMutable(organization: IOrganization): void {
    if (organization.status === OrganizationStatus.ARCHIVED) {
      throw new ApiError(409, 'Organization is archived');
    }
  }

  /** Never includes tokenHash — the raw token is only ever returned once, from createInvitation's own return value. */
  private toDetail(invitation: any): Record<string, unknown> {
    return {
      id: invitation._id.toString(),
      organizationId: invitation.organizationId.toString(),
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      invitedByUserId: invitation.invitedByUserId.toString(),
      expiresAt: invitation.expiresAt,
      acceptedByUserId: invitation.acceptedByUserId ? invitation.acceptedByUserId.toString() : undefined,
      acceptedAt: invitation.acceptedAt,
      revokedAt: invitation.revokedAt,
      createdAt: invitation.createdAt,
      updatedAt: invitation.updatedAt,
    };
  }
}

export const organizationInvitationService = new OrganizationInvitationService();
