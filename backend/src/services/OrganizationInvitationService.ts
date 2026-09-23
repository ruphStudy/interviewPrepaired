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
import { userIdentityService, normalizeEmail } from './UserIdentityService';
import { organizationMemberService } from './OrganizationMemberService';
import { authSessionService } from './AuthSessionService';
import { ApiError } from '../utils/ApiError';
import { transactionalEmailService } from './TransactionalEmailService';
import { renderOrganizationInvitationEmail } from '../emails/templates';
import { EmailTemplateCode } from '../constants/email';
import { env } from '../config/environment';

interface CreateInvitationParams {
  email: string;
  role: OrganizationMemberRole;
  /** Only used when the email has no existing User — a fresh one is created awaiting activation (see below). Ignored (a warning-free no-op) when the email already has an account. */
  name?: string;
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

    const normalizedEmail = normalizeEmail(params.email);

    // Deliberately NOT `findActiveUserByEmail` — an invitation must still
    // detect and reject inviting an email that belongs to an existing (even
    // inactive) owner/member, so this intentionally matches regardless of
    // `isActive` (see UserIdentityService.findUserByEmail's doc comment).
    let invitedUser = await userIdentityService.findUserByEmail(normalizedEmail);
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
    } else {
      // No account for this email yet — create one immediately (unknown,
      // never-disclosed random password; never the global 'admin' role)
      // rather than requiring the invitee to self-register first. This
      // generalizes the same D2 pattern built for Super Admin owner
      // provisioning to every ordinary member invite (Institute
      // Trainer/etc.) — see UserIdentityService.createUserAwaitingActivation.
      // `activateOwnerAccount` (any non-OWNER role too, despite the name)
      // is how they complete activation; `acceptInvitation` still applies
      // once they have a real password.
      invitedUser = await userIdentityService.createUserAwaitingActivation(normalizedEmail, params.name);
    }

    const { invitation, token } = await this.upsertPendingInvitation(organization, params.role, normalizedEmail, invitedByUserId);
    return { invitation: this.toDetail(invitation), token };
  }

  /**
   * Super-Admin-only entry point (B2B provisioning) — NEVER callable by an
   * org owner/admin; the caller (OrganizationProvisioningService) is gated
   * entirely by `requireGlobalSuperAdmin` on the route, not by any
   * organization-scoped permission check here. Unlike `createInvitation`,
   * this intentionally creates/rotates an OWNER-role invitation and skips
   * `createInvitation`'s "already owner"/"already a member" conflict checks
   * (the invited email is EXPECTED to already be — or become — the
   * organization's owner; `Organization.ownerUserId` is already set
   * synchronously before this is ever called, per D1). The regular
   * member-invite flow's `role === OWNER` rejection above is untouched and
   * still fully enforced for every other caller.
   */
  async createOwnerInvitation(
    organizationId: string,
    invitedByUserId: string,
    email: string
  ): Promise<{ invitation: Record<string, unknown>; token: string }> {
    const organization = await this.getOrganizationById(organizationId);
    this.assertOrganizationMutable(organization);

    const normalizedEmail = normalizeEmail(email);
    const { invitation, token } = await this.upsertPendingInvitation(
      organization,
      OrganizationMemberRole.OWNER,
      normalizedEmail,
      invitedByUserId
    );
    return { invitation: this.toDetail(invitation), token };
  }

  /** Latest OWNER-role invitation for an organization (any status), if any — lets a caller resend/revoke without already knowing the invitation id. Lazily expires a stale PENDING row before returning it. */
  async getLatestOwnerInvitation(organizationId: string): Promise<Record<string, unknown> | null> {
    const invitation = await OrganizationInvitation.findOne({
      organizationId: new Types.ObjectId(organizationId),
      role: OrganizationMemberRole.OWNER,
    }).sort({ createdAt: -1 });
    if (!invitation) return null;
    await this.lazilyExpire(invitation);
    return this.toDetail(invitation);
  }

  /**
   * Shared by `createInvitation` and `createOwnerInvitation` — rotates an
   * existing PENDING row for this organization/email (fresh token/expiry/
   * role/inviter; the OLD emailed link stops working the moment tokenHash
   * changes) or creates a new PENDING row. Never applies a permission or
   * conflict check itself — callers own those, since they differ
   * intentionally between the two entry points.
   */
  private async upsertPendingInvitation(
    organization: IOrganization,
    role: OrganizationMemberRole,
    normalizedEmail: string,
    invitedByUserId: string
  ): Promise<{ invitation: IOrganizationInvitation; token: string }> {
    const { token, tokenHash } = this.generateToken();
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_MS);
    const invitedByObjectId = new Types.ObjectId(invitedByUserId);

    const existingPending = await OrganizationInvitation.findOne({
      organizationId: organization._id,
      email: normalizedEmail,
      status: OrganizationInvitationStatus.PENDING,
    });

    if (existingPending) {
      existingPending.tokenHash = tokenHash;
      existingPending.expiresAt = expiresAt;
      existingPending.role = role;
      existingPending.invitedByUserId = invitedByObjectId;
      await existingPending.save();

      await this.sendInvitationEmail(organization, existingPending, token, invitedByObjectId);
      return { invitation: existingPending, token };
    }

    const invitation = await OrganizationInvitation.create({
      organizationId: organization._id,
      email: normalizedEmail,
      role,
      status: OrganizationInvitationStatus.PENDING,
      invitedByUserId: invitedByObjectId,
      tokenHash,
      expiresAt,
    });

    await this.sendInvitationEmail(organization, invitation, token, invitedByObjectId);
    return { invitation, token };
  }

  /**
   * Best-effort — a delivery failure never blocks invitation creation
   * (the invitation itself is already valid/persisted; email is the
   * transport, not the source of truth). Idempotency key is derived from
   * the invitation id + its CURRENT tokenHash, so a rotation (resend)
   * always sends a fresh email while a retried HTTP request for the exact
   * same rotation never double-sends.
   */
  private async sendInvitationEmail(
    organization: IOrganization,
    invitation: IOrganizationInvitation,
    rawToken: string,
    invitedByUserId: Types.ObjectId
  ): Promise<void> {
    try {
      const inviter = await User.findById(invitedByUserId).select('name');
      const acceptUrl = `${env.frontendUrl.replace(/\/$/, '')}/accept-invite/${rawToken}`;
      const { subject, html, text } = renderOrganizationInvitationEmail({
        organizationName: organization.name,
        role: invitation.role,
        inviterName: inviter?.name,
        acceptUrl,
        expiresAt: invitation.expiresAt,
      });

      await transactionalEmailService.sendTransactionalEmail({
        to: invitation.email,
        templateCode: EmailTemplateCode.ORGANIZATION_INVITATION,
        subject,
        html,
        text,
        idempotencyKey: `organization-invite:${(invitation._id as Types.ObjectId).toString()}:${invitation.tokenHash}`,
        relatedEntityType: 'OrganizationInvitation',
        relatedEntityId: (invitation._id as Types.ObjectId).toString(),
      });
    } catch (error) {
      console.error('[OrganizationInvitationService] Failed to enqueue invitation email', {
        invitationId: (invitation._id as Types.ObjectId).toString(),
      });
    }
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
    if (
      !organization ||
      organization.status === OrganizationStatus.ARCHIVED ||
      organization.status === OrganizationStatus.SUSPENDED
    ) {
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
    const { invitation, organization } = await this.loadPendingInvitationForAcceptance(rawToken);

    const normalizedUserEmail = userEmail.trim().toLowerCase();
    if (normalizedUserEmail !== invitation.email) {
      throw new ApiError(403, 'This invitation was sent to a different email address');
    }

    return this.applyAcceptance(invitation, organization, userId);
  }

  /**
   * D2 — public, no auth (see organizationInvitation.routes.ts). Completes
   * a NEW invitee's account activation, for ANY invitation role (Owner,
   * Trainer, etc — the name predates that generalization; kept to minimize
   * blast radius rather than renamed): the User row already exists (created
   * synchronously at provisioning/invite time by
   * `UserIdentityService.createUserAwaitingActivation`, with an unknown
   * random password) but has never had a real password set. This is the
   * ONLY path that sets a password without an authenticated session —
   * gated entirely by possession of the invitation's raw token, exactly
   * like every other invitation-token flow in this codebase (a
   * reused/replayed token is rejected because the invitation's own
   * PENDING -> ACCEPTED transition already happened). Reuses
   * `applyAcceptance` — never duplicates the membership/acceptance logic.
   */
  async activateOwnerAccount(
    rawToken: string,
    password: string
  ): Promise<{ token: string; user: Record<string, unknown>; organization: Record<string, unknown>; membership: Record<string, unknown> }> {
    const { invitation, organization } = await this.loadPendingInvitationForAcceptance(rawToken);

    const user = await User.findOne({ email: invitation.email });
    if (!user) {
      // Should never happen — this invitation's User is always created
      // synchronously BEFORE the invitation itself (D1/D2, or
      // createInvitation's own auto-create-if-missing branch). Loud, not silent.
      console.error('[OrganizationInvitationService] Invitation activation found no User for invitation email', {
        invitationId: (invitation._id as Types.ObjectId).toString(),
      });
      throw new ApiError(500, 'Unable to activate this account — please contact support');
    }

    // SECURITY: a brand-new invitee and an already-existing account get a
    // structurally identical invitation — nothing on the invitation itself
    // distinguishes them. Without this check, a stolen/shared/forwarded
    // invitation link for an EXISTING account (who already has a real
    // password) could be used to silently overwrite it via this PUBLIC,
    // unauthenticated endpoint. Only a User created awaiting activation
    // (unknown random password) may ever have its password set here — see
    // User.model.ts's doc comment. This is the ONLY gate this method relies
    // on for that distinction — it is deliberately role-agnostic.
    if (!user.pendingPasswordActivation) {
      throw new ApiError(400, 'This account already has a password — please log in instead');
    }

    user.password = password;
    user.isVerified = true;
    user.pendingPasswordActivation = false;
    await user.save();

    const acceptance = await this.applyAcceptance(invitation, organization, (user._id as Types.ObjectId).toString());

    const sanitizedUser = user.toObject() as unknown as Record<string, unknown>;
    delete sanitizedUser.password;
    delete sanitizedUser.resetPasswordToken;
    delete sanitizedUser.emailVerificationTokenHash;

    const { token } = await authSessionService.createSession(user);

    return {
      token,
      user: sanitizedUser,
      organization: acceptance.organization as Record<string, unknown>,
      membership: acceptance.membership as Record<string, unknown>,
    };
  }

  /**
   * Shared by `acceptInvitation` and `getInvitationByToken`-adjacent flows —
   * loads a PENDING, non-expired invitation and its still-mutable
   * organization, or throws. Never checks the invitee's identity — callers
   * own that (email match for `acceptInvitation`, nothing further for
   * `activateOwnerAccount` since the token itself is the credential).
   */
  private async loadPendingInvitationForAcceptance(
    rawToken: string
  ): Promise<{ invitation: IOrganizationInvitation; organization: IOrganization }> {
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

    const organization = await Organization.findById(invitation.organizationId);
    if (!organization) {
      throw new ApiError(404, 'Organization not found');
    }
    this.assertOrganizationMutable(organization);

    return { invitation, organization };
  }

  /**
   * Shared by `acceptInvitation` and `activateOwnerAccount` — everything
   * that happens once a PENDING invitation + still-mutable organization are
   * confirmed and the acting `userId` is known. An OWNER-role invitation
   * takes a distinct branch: D1 already made this user the organization's
   * owner synchronously at provisioning/transfer time, so acceptance here
   * only CONFIRMS the OWNER membership row (idempotent) rather than
   * granting a new one — the "already owner" rejection below exists for the
   * ordinary non-owner invite flow, where it signals a genuine conflict.
   */
  private async applyAcceptance(
    invitation: IOrganizationInvitation,
    organization: IOrganization,
    userId: string
  ): Promise<Record<string, unknown>> {
    const userObjectId = new Types.ObjectId(userId);

    if (invitation.role === OrganizationMemberRole.OWNER) {
      // Defense in depth against a stale/reused owner-invitation token after
      // a later owner transfer moved ownership elsewhere.
      if (organization.ownerUserId.toString() !== userId) {
        throw new ApiError(403, 'This invitation no longer matches the organization owner');
      }
      await organizationMemberService.ensureOwnerMembership(organization._id.toString(), userId);
    } else {
      if (userId === organization.ownerUserId.toString()) {
        throw new ApiError(409, 'You are already the organization owner');
      }

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

    return this.performRevoke(organization, invitationId);
  }

  /** Super-Admin-only counterpart to `revokeInvitation` — no organization-scoped permission check (gated by `requireGlobalSuperAdmin` on the route), otherwise identical semantics (idempotent, never a physical delete). */
  async revokeOwnerInvitation(organizationId: string, invitationId: string): Promise<Record<string, unknown>> {
    const organization = await this.getOrganizationById(organizationId);
    this.assertOrganizationMutable(organization);

    return this.performRevoke(organization, invitationId);
  }

  private async performRevoke(organization: IOrganization, invitationId: string): Promise<Record<string, unknown>> {
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

  /** ARCHIVED (soft-deleted) and SUSPENDED both block invitation mutation/acceptance identically — distinct lifecycle states, same operational-access treatment (D6). */
  private assertOrganizationMutable(organization: IOrganization): void {
    if (organization.status === OrganizationStatus.ARCHIVED) {
      throw new ApiError(409, 'Organization is archived');
    }
    if (organization.status === OrganizationStatus.SUSPENDED) {
      throw new ApiError(409, 'Organization is suspended');
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
