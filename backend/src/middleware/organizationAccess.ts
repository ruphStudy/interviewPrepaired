import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { AuthRequest } from './auth';
import Organization, { IOrganization } from '../models/Organization.model';
import OrganizationMember, { IOrganizationMember } from '../models/OrganizationMember.model';
import { OrganizationMemberRole, OrganizationMemberStatus } from '../constants/organizationMember';
import { OrganizationStatus } from '../constants/organization';
import {
  OrganizationPermission,
  hasOrganizationPermission,
  getOrganizationPermissionsForRole,
} from '../constants/organizationPermissions';
import { organizationMemberService } from '../services/OrganizationMemberService';
import { ApiError } from '../utils/ApiError';
import { catchAsync } from '../utils/catchAsync';

export interface OrganizationAuthRequest extends AuthRequest {
  organizationContext?: {
    organizationId: string;
    organization: IOrganization;
    member: IOrganizationMember;
    role: OrganizationMemberRole;
    permissions: readonly OrganizationPermission[];
  };
}

interface OrganizationAccessOptions {
  /** Route param carrying the organization ID. Defaults to 'organizationId' (member routes use this); pass 'id' for the `/organizations/:id` detail routes. */
  paramName?: string;
}

/**
 * Loads the organization (by trusted route param only — never body/query/
 * header) and resolves the caller's ACTIVE membership. Organization.ownerUserId
 * is canonical: if the caller is the owner, their mirrored OWNER membership
 * row is lazily synchronized (8B's ensureOwnerMembership) before resolving
 * it, even if that row didn't exist yet. Never falls back to User.role.
 */
async function resolveOrganizationContext(req: OrganizationAuthRequest, paramName: string): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new ApiError(401, 'Authentication required');
  }

  const organizationId = req.params[paramName];

  const organization = await Organization.findById(organizationId);
  if (!organization) {
    throw new ApiError(404, 'Organization not found');
  }

  let member: IOrganizationMember | null;

  if (organization.ownerUserId.toString() === userId) {
    await organizationMemberService.ensureOwnerMembership(organizationId, userId);
    member = await OrganizationMember.findOne({
      organizationId: organization._id,
      userId: new Types.ObjectId(userId),
    });
  } else {
    member = await OrganizationMember.findOne({
      organizationId: organization._id,
      userId: new Types.ObjectId(userId),
      status: OrganizationMemberStatus.ACTIVE,
    });
  }

  // Also guards a stray INACTIVE owner row (should never happen — ensureOwnerMembership always sets ACTIVE — but this stays exact rather than assumed).
  if (!member || member.status !== OrganizationMemberStatus.ACTIVE) {
    throw new ApiError(403, 'You do not have access to this organization');
  }

  req.organizationContext = {
    organizationId,
    organization,
    member,
    role: member.role,
    permissions: getOrganizationPermissionsForRole(member.role),
  };
}

/** Loads trusted organization context onto the request with no permission check — use requireOrganizationPermission for the common case. */
export function loadOrganizationContext(options: OrganizationAccessOptions = {}) {
  const paramName = options.paramName ?? 'organizationId';
  return catchAsync(async (req: OrganizationAuthRequest, _res: Response, next: NextFunction) => {
    await resolveOrganizationContext(req, paramName);
    next();
  });
}

/**
 * A `resource:view`/`resource:read`-shaped permission is read-only by this
 * codebase's own naming convention (see organizationPermissions.ts's class
 * doc: "resource:action, lowercase"). Everything else (`:update`/`:manage`)
 * is a mutation. Used only to decide whether a SUSPENDED organization's
 * "no normal operational access" restriction (D6) applies — never used for
 * the underlying permission grant itself, which stays the 8C matrix's job.
 */
function isReadOnlyPermission(permission: OrganizationPermission): boolean {
  const action = permission.split(':')[1];
  return action === 'view';
}

/**
 * Primary export: loads trusted organization context AND verifies the
 * resolved role has `permission`, using only the centralized 8C matrix
 * (never a hardcoded role check). Fails closed — an unknown/stale role or a
 * missing permission both deny with 403.
 *
 * D6 — a SUSPENDED organization blocks every mutating (`:update`/`:manage`)
 * permission with 409, identically across EVERY organization-scoped route
 * in the app (this is the single choke point virtually all of them already
 * pass through) — but never blocks a `:view` permission, so members/history
 * stay readable, matching this codebase's existing ARCHIVED read/write
 * asymmetry (e.g. OrganizationMemberService.getMembers's "Reads are allowed
 * on an archived org"). Super Admin's own provisioning routes bypass this
 * middleware entirely (they use `requireGlobalSuperAdmin` directly), so
 * suspend/reactivate/view-status/change-owner are never blocked by this.
 */
export function requireOrganizationPermission(permission: OrganizationPermission, options: OrganizationAccessOptions = {}) {
  const paramName = options.paramName ?? 'organizationId';
  return catchAsync(async (req: OrganizationAuthRequest, _res: Response, next: NextFunction) => {
    await resolveOrganizationContext(req, paramName);

    if (!req.organizationContext || !hasOrganizationPermission(req.organizationContext.role, permission)) {
      throw new ApiError(403, 'You do not have permission to perform this action');
    }

    if (req.organizationContext.organization.status === OrganizationStatus.SUSPENDED && !isReadOnlyPermission(permission)) {
      throw new ApiError(409, 'Organization is suspended');
    }

    next();
  });
}

/**
 * Foundation-only, additive guard: NOT wired onto any existing route yet.
 * OWNER and ADMIN currently share every permission in the 8C matrix, so
 * `requireOrganizationPermission` cannot by itself express "OWNER only" —
 * today that distinction is enforced ad hoc at the service layer instead
 * (e.g. `OrganizationService.deleteOrganization` checking `ownerUserId`
 * directly, `OrganizationMemberService.assertNotOwnerMembership`). This
 * gives a future route (e.g. archiving/deleting an organization) a single
 * named place to require it, reusing the exact same trusted
 * route-param-only `resolveOrganizationContext` as every other guard here —
 * never body/query/header. A caller is accepted if either their resolved
 * membership role is OWNER, or they are the organization's canonical
 * `ownerUserId` (covers the moment before `ensureOwnerMembership` has ever
 * run for them — resolveOrganizationContext already lazily syncs that row,
 * so in practice both checks agree, but the ownerUserId check is kept as
 * the authoritative fallback, matching this codebase's own "Organization.
 * ownerUserId is canonical" convention).
 */
export function requireOrganizationOwner(options: OrganizationAccessOptions = {}) {
  const paramName = options.paramName ?? 'organizationId';
  return catchAsync(async (req: OrganizationAuthRequest, _res: Response, next: NextFunction) => {
    await resolveOrganizationContext(req, paramName);

    const context = req.organizationContext;
    const userId = req.user?.id;
    const isOwner =
      !!context &&
      !!userId &&
      (context.role === OrganizationMemberRole.OWNER || context.organization.ownerUserId.toString() === userId);

    if (!isOwner) {
      throw new ApiError(403, 'Only the organization owner may perform this action');
    }

    // Owner-only routes are mutations by nature (see D6 doc on
    // requireOrganizationPermission above) — a SUSPENDED organization blocks
    // them identically.
    if (context!.organization.status === OrganizationStatus.SUSPENDED) {
      throw new ApiError(409, 'Organization is suspended');
    }

    next();
  });
}
