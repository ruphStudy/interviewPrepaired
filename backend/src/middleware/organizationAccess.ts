import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { AuthRequest } from './auth';
import Organization, { IOrganization } from '../models/Organization.model';
import OrganizationMember, { IOrganizationMember } from '../models/OrganizationMember.model';
import { OrganizationMemberRole, OrganizationMemberStatus } from '../constants/organizationMember';
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
 * Primary export: loads trusted organization context AND verifies the
 * resolved role has `permission`, using only the centralized 8C matrix
 * (never a hardcoded role check). Fails closed — an unknown/stale role or a
 * missing permission both deny with 403.
 */
export function requireOrganizationPermission(permission: OrganizationPermission, options: OrganizationAccessOptions = {}) {
  const paramName = options.paramName ?? 'organizationId';
  return catchAsync(async (req: OrganizationAuthRequest, _res: Response, next: NextFunction) => {
    await resolveOrganizationContext(req, paramName);

    if (!req.organizationContext || !hasOrganizationPermission(req.organizationContext.role, permission)) {
      throw new ApiError(403, 'You do not have permission to perform this action');
    }
    next();
  });
}
