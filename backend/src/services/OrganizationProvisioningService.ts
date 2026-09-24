import { Types } from 'mongoose';
import Organization, { IOrganization, IInstituteProfile, ICompanyProfile, IOrganizationSettings } from '../models/Organization.model';
import OrganizationMember from '../models/OrganizationMember.model';
import { User, IUser } from '../models/user.model';
import { OrganizationProvisioningAudit } from '../models/OrganizationProvisioningAudit.model';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationInvitationStatus } from '../constants/organizationInvitation';
import { organizationService } from './OrganizationService';
import { organizationMemberService } from './OrganizationMemberService';
import { organizationInvitationService } from './OrganizationInvitationService';
import { organizationProvisioningAuditService } from './OrganizationProvisioningAuditService';
import { organizationSubscriptionService } from './OrganizationSubscriptionService';
import { userIdentityService, normalizeEmail } from './UserIdentityService';
import { ApiError } from '../utils/ApiError';

interface CreateOrganizationWithOwnerParams {
  name: string;
  type: OrganizationType;
  ownerEmail: string;
  /** Only used when the email has no existing User — ignored (a warning-free no-op) when attaching an existing owner. */
  ownerName?: string;
  description?: string;
  website?: string;
  logoUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  settings?: IOrganizationSettings;
  instituteProfile?: IInstituteProfile;
  companyProfile?: ICompanyProfile;
  /** Optional, best-effort — see class doc on `applyPlanIfRequested`. */
  planCode?: string;
  /** REQUIRED (D5) — the request's idempotency key. A retried call with the SAME key returns the original result rather than creating a duplicate organization/user/membership/invitation. */
  idempotencyKey: string;
}

interface ChangeOwnerParams {
  newOwnerEmail: string;
  newOwnerName?: string;
}

/**
 * Super Admin B2B organization provisioning (institute or company/employer)
 * — the ONLY place that creates an organization together with its first
 * owner, resends/revokes the owner's invitation, suspends/reactivates an
 * organization, or transfers ownership. Every method here is reached ONLY
 * via `requireGlobalSuperAdmin` routes (admin.routes.ts) — never callable
 * by an organization owner/admin themselves.
 *
 * D1: ownership is set SYNCHRONOUSLY at creation/transfer time —
 * `Organization.ownerUserId` is a required field, so an organization is
 * never observably ownerless. The owner invitation/activation email that
 * follows is purely about credential setup (new owner) or notification
 * (existing owner) — it never gates technical ownership.
 */
export class OrganizationProvisioningService {
  /**
   * D1/D2/D3/D5 — creates an organization with its first owner, resolving
   * (never duplicating) an existing User by email, or creating a new one
   * with an unknown random password awaiting activation. Idempotent via
   * `idempotencyKey` (primary defense, enforced by a unique-sparse DB
   * index) plus natural per-step idempotency (mirrors
   * `ensureOwnerMembership`'s own upsert pattern).
   */
  async createOrganizationWithOwner(
    params: CreateOrganizationWithOwnerParams,
    actorUserId: string
  ): Promise<Record<string, unknown>> {
    const idempotencyKey = params.idempotencyKey.trim();
    if (!idempotencyKey) {
      throw new ApiError(400, 'idempotencyKey is required');
    }

    // Primary idempotency defense — a unique-sparse index on
    // OrganizationProvisioningAudit.idempotencyKey means a concurrent or
    // retried request with the SAME key hits a duplicate-key error here,
    // BEFORE anything else is created.
    let auditRow;
    try {
      auditRow = await OrganizationProvisioningAudit.create({
        action: 'organization_created',
        status: 'pending',
        actorUserId,
        idempotencyKey,
        metadata: { name: params.name, type: params.type, ownerEmail: normalizeEmail(params.ownerEmail) },
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        const existing = await OrganizationProvisioningAudit.findOne({ idempotencyKey });
        if (existing?.organizationId && existing.status === 'success') {
          // Same response SHAPE as a fresh creation ({organization, owner,
          // invitation}) — never the bare admin-detail object — so a
          // retried request is observably indistinguishable from the
          // original from the caller's point of view.
          const orgId = existing.organizationId.toString();
          const organization = await this.getOrganizationDetail(orgId);
          const metadata = (existing.metadata ?? {}) as Record<string, unknown>;
          return {
            organization,
            owner: {
              id: existing.targetUserId?.toString(),
              email: metadata.ownerEmail,
              isNewOwner: metadata.isNewOwner,
            },
            invitation: (organization as any).ownerInvitation ?? null,
          };
        }
        throw new ApiError(409, 'A request with this idempotency key is already being processed');
      }
      throw error;
    }

    try {
      const normalizedEmail = normalizeEmail(params.ownerEmail);

      // Deliberately NOT active-only — matches OrganizationInvitationService's
      // existing precedent (an inactive/former account still counts as
      // "already exists", never silently double-created).
      let ownerUser = await userIdentityService.findUserByEmail(normalizedEmail);
      const isNewOwner = !ownerUser;

      if (!ownerUser) {
        ownerUser = await this.createOwnerAwaitingActivation(normalizedEmail, params.ownerName);
      }

      const organization = (await organizationService.createOrganization({
        userId: (ownerUser._id as Types.ObjectId).toString(),
        name: params.name,
        type: params.type,
        description: params.description,
        website: params.website,
        logoUrl: params.logoUrl,
        contactEmail: params.contactEmail,
        contactPhone: params.contactPhone,
        settings: params.settings,
        instituteProfile: params.instituteProfile,
        companyProfile: params.companyProfile,
      })) as { id: string };

      // D1 — synchronous, in the same request. There is never a window
      // where the organization exists without a valid owner membership.
      await organizationMemberService.ensureOwnerMembership(organization.id, (ownerUser._id as Types.ObjectId).toString());

      const { invitation } = await organizationInvitationService.createOwnerInvitation(
        organization.id,
        actorUserId,
        normalizedEmail
      );

      // Distinct from the 'organization_created' row finalized below — that
      // one is the request's primary idempotency defense (fires once per
      // idempotencyKey); this one is the specific "Owner linked/invited"
      // checkpoint section 28 calls out separately.
      await organizationProvisioningAuditService.record('owner_invitation_created', {
        actorUserId,
        organizationId: organization.id,
        targetUserId: (ownerUser._id as Types.ObjectId).toString(),
        metadata: { isNewOwner, invitationId: (invitation as any).id },
      });

      await this.applyPlanIfRequested(organization.id, params.planCode);

      auditRow.status = 'success';
      auditRow.organizationId = new Types.ObjectId(organization.id);
      auditRow.targetUserId = ownerUser._id as Types.ObjectId;
      auditRow.metadata = { ...auditRow.metadata, isNewOwner, slug: (organization as any).slug };
      await auditRow.save().catch((error) => {
        console.error('[OrganizationProvisioningService] Failed to finalize provisioning audit row', error);
      });

      return {
        organization,
        owner: { id: (ownerUser._id as Types.ObjectId).toString(), email: normalizedEmail, isNewOwner },
        invitation,
      };
    } catch (error) {
      auditRow.status = 'failed';
      await auditRow.save().catch(() => undefined);
      throw error;
    }
  }

  /** Super Admin ALL-organizations list — platform-wide, never scoped to the caller's own membership (that's OrganizationService.getOrganizations's job). */
  async listOrganizations(params: {
    page: number;
    limit: number;
    type?: OrganizationType;
    status?: OrganizationStatus;
    search?: string;
  }): Promise<{ organizations: Array<Record<string, unknown>>; pagination: { page: number; limit: number; total: number; pages: number } }> {
    const filter: Record<string, unknown> = {};
    if (params.type) filter.type = params.type;
    if (params.status) filter.status = params.status;
    if (params.search) {
      filter.name = new RegExp(params.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }

    const skip = (params.page - 1) * params.limit;
    const [organizations, total] = await Promise.all([
      Organization.find(filter)
        .populate('ownerUserId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(params.limit)
        .lean(),
      Organization.countDocuments(filter),
    ]);

    return {
      organizations: organizations.map((org) => this.toAdminSummary(org)),
      pagination: { page: params.page, limit: params.limit, total, pages: Math.ceil(total / params.limit) },
    };
  }

  async getOrganizationDetail(organizationId: string): Promise<Record<string, unknown>> {
    const organization = await Organization.findById(organizationId).populate('ownerUserId', 'name email isActive isVerified').lean();
    if (!organization) {
      throw new ApiError(404, 'Organization not found');
    }

    const [ownerInvitation, subscription] = await Promise.all([
      organizationInvitationService.getLatestOwnerInvitation(organizationId),
      organizationSubscriptionService.getCurrentSubscription(organizationId).catch(() => null),
    ]);

    return {
      ...this.toAdminSummary(organization),
      description: (organization as any).description,
      website: (organization as any).website,
      ownerInvitation,
      subscription: subscription
        ? { planCode: subscription.planCode, status: subscription.status, currentPeriodEnd: subscription.currentPeriodEnd }
        : null,
    };
  }

  /** Resends (rotates) the organization's current owner invitation — creates a fresh one if none exists yet. */
  async resendOwnerInvitation(organizationId: string, actorUserId: string): Promise<Record<string, unknown>> {
    const organization = await this.getOrganizationOrThrow(organizationId);
    const owner = await User.findById(organization.ownerUserId).select('email');
    if (!owner) {
      throw new ApiError(500, 'Organization owner account is missing');
    }

    const latest = await organizationInvitationService.getLatestOwnerInvitation(organizationId);
    if (latest && (latest as any).status === OrganizationInvitationStatus.ACCEPTED) {
      throw new ApiError(409, 'The organization owner has already accepted their invitation');
    }

    const { invitation } = await organizationInvitationService.createOwnerInvitation(organizationId, actorUserId, owner.email);

    await organizationProvisioningAuditService.record('owner_invitation_resent', {
      actorUserId,
      organizationId,
      targetUserId: organization.ownerUserId.toString(),
    });

    return invitation;
  }

  /** Revokes the organization's current PENDING owner invitation. Idempotent (re-revoking an already-revoked invitation is a no-op, matching OrganizationInvitationService's own convention). */
  async revokeOwnerInvitation(organizationId: string, actorUserId: string): Promise<Record<string, unknown>> {
    await this.getOrganizationOrThrow(organizationId);

    const latest = await organizationInvitationService.getLatestOwnerInvitation(organizationId);
    if (!latest) {
      throw new ApiError(404, 'No owner invitation exists for this organization');
    }

    const result = await organizationInvitationService.revokeOwnerInvitation(organizationId, (latest as any).id as string);

    await organizationProvisioningAuditService.record('owner_invitation_revoked', {
      actorUserId,
      organizationId,
      metadata: { invitationId: (latest as any).id },
    });

    return result;
  }

  /** SUSPENDED <-> ACTIVE only — never touches ARCHIVED (that's the separate soft-delete concept owned by OrganizationService.deleteOrganization). Idempotent. */
  async suspendOrganization(organizationId: string, actorUserId: string): Promise<Record<string, unknown>> {
    const organization = await this.getOrganizationOrThrow(organizationId);

    if (organization.status === OrganizationStatus.ARCHIVED) {
      throw new ApiError(409, 'Cannot suspend an archived organization');
    }
    if (organization.status === OrganizationStatus.SUSPENDED) {
      return this.toAdminSummary(organization.toObject());
    }

    organization.status = OrganizationStatus.SUSPENDED;
    await organization.save();

    await organizationProvisioningAuditService.record('organization_suspended', { actorUserId, organizationId });

    return this.toAdminSummary(organization.toObject());
  }

  async reactivateOrganization(organizationId: string, actorUserId: string): Promise<Record<string, unknown>> {
    const organization = await this.getOrganizationOrThrow(organizationId);

    if (organization.status === OrganizationStatus.ARCHIVED) {
      throw new ApiError(409, 'Cannot reactivate an archived organization');
    }
    if (organization.status === OrganizationStatus.ACTIVE) {
      return this.toAdminSummary(organization.toObject());
    }

    organization.status = OrganizationStatus.ACTIVE;
    await organization.save();

    await organizationProvisioningAuditService.record('organization_reactivated', { actorUserId, organizationId });

    return this.toAdminSummary(organization.toObject());
  }

  /**
   * D4 — synchronous owner transfer. Resolves (never duplicates) the new
   * owner exactly like `createOrganizationWithOwner`; downgrades the
   * previous owner's membership to ADMIN (non-destructive — OWNER/ADMIN
   * share every permission) rather than removing it. A no-op if the target
   * is already the current owner (idempotent).
   */
  async changeOwner(organizationId: string, actorUserId: string, params: ChangeOwnerParams): Promise<Record<string, unknown>> {
    const organization = await this.getOrganizationOrThrow(organizationId);
    if (organization.status === OrganizationStatus.ARCHIVED) {
      throw new ApiError(409, 'Cannot change the owner of an archived organization');
    }

    const normalizedEmail = normalizeEmail(params.newOwnerEmail);
    const previousOwnerUserId = organization.ownerUserId as Types.ObjectId;

    let newOwnerUser = await userIdentityService.findUserByEmail(normalizedEmail);

    if (newOwnerUser && newOwnerUser._id.toString() === previousOwnerUserId.toString()) {
      // Already the current owner — idempotent no-op, no side effects.
      return this.toAdminSummary(organization.toObject());
    }

    const isNewOwner = !newOwnerUser;
    if (!newOwnerUser) {
      newOwnerUser = await this.createOwnerAwaitingActivation(normalizedEmail, params.newOwnerName);
    }

    const newOwnerObjectId = newOwnerUser._id as Types.ObjectId;

    organization.ownerUserId = newOwnerObjectId;
    await organization.save();

    await organizationMemberService.ensureOwnerMembership(organizationId, newOwnerObjectId.toString());

    // Non-destructive downgrade — OWNER and ADMIN currently share every
    // permission (organizationPermissions.ts), so the previous owner keeps
    // full operational access, just without owner status.
    await OrganizationMember.findOneAndUpdate(
      { organizationId: organization._id, userId: previousOwnerUserId, role: OrganizationMemberRole.OWNER },
      { $set: { role: OrganizationMemberRole.ADMIN } }
    );

    const { invitation } = await organizationInvitationService.createOwnerInvitation(organizationId, actorUserId, normalizedEmail);

    await organizationProvisioningAuditService.record('owner_changed', {
      actorUserId,
      organizationId,
      targetUserId: newOwnerObjectId.toString(),
      previousOwnerUserId: previousOwnerUserId.toString(),
      metadata: { isNewOwner },
    });

    return {
      organization: this.toAdminSummary(organization.toObject()),
      owner: { id: newOwnerObjectId.toString(), email: normalizedEmail, isNewOwner },
      invitation,
    };
  }

  /**
   * Best-effort, optional (goal explicitly deprioritizes this) — only wires
   * INTO the existing OrganizationSubscriptionService, never fabricates a
   * new billing concept. A failure here must never fail organization
   * creation.
   */
  private async applyPlanIfRequested(organizationId: string, planCode?: string): Promise<void> {
    if (!planCode) return;
    try {
      await organizationSubscriptionService.activateFromContract(organizationId, planCode, { start: new Date() });
    } catch (error) {
      console.error('[OrganizationProvisioningService] Failed to apply requested plan at provisioning time', {
        organizationId,
        planCode,
        error,
      });
    }
  }

  /**
   * D2 — thin delegate to the shared, generalized primitive (now also used
   * by Institute Trainer/Student onboarding) — see
   * `UserIdentityService.createUserAwaitingActivation`'s doc comment.
   */
  private async createOwnerAwaitingActivation(normalizedEmail: string, name?: string): Promise<IUser> {
    return userIdentityService.createUserAwaitingActivation(normalizedEmail, name);
  }

  private async getOrganizationOrThrow(organizationId: string): Promise<IOrganization> {
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      throw new ApiError(404, 'Organization not found');
    }
    return organization;
  }

  private toAdminSummary(org: any): Record<string, unknown> {
    // `ownerUserId` is either a populated User doc (has `.email`) or a bare
    // ObjectId/id — both are `typeof === 'object'` for a real ObjectId, so
    // checking for `.email` is what actually distinguishes "populated".
    const owner = org.ownerUserId && typeof org.ownerUserId === 'object' && 'email' in org.ownerUserId ? org.ownerUserId : null;
    return {
      id: org._id.toString(),
      name: org.name,
      slug: org.slug,
      type: org.type,
      status: org.status,
      owner: owner
        ? { id: owner._id.toString(), name: owner.name, email: owner.email }
        : { id: org.ownerUserId.toString() },
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
    };
  }
}

export const organizationProvisioningService = new OrganizationProvisioningService();
