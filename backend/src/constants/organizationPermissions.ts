import { OrganizationMemberRole } from './organizationMember';

/**
 * Stable, machine-readable organization permission values — `resource:action`,
 * lowercase. Foundational set only; add feature-specific permissions when
 * those features actually exist (students/batches/courses/jobs/etc.).
 */
export enum OrganizationPermission {
  ORGANIZATION_VIEW = 'organization:view',
  ORGANIZATION_UPDATE = 'organization:update',
  MEMBERS_VIEW = 'members:view',
  MEMBERS_MANAGE = 'members:manage',
  INTERVIEWS_VIEW = 'interviews:view',
  INTERVIEWS_MANAGE = 'interviews:manage',
  QUESTION_SETS_VIEW = 'question-sets:view',
  QUESTION_SETS_MANAGE = 'question-sets:manage',
  REPORTS_VIEW = 'reports:view',
  ANALYTICS_VIEW = 'analytics:view',
}

const ALL_PERMISSIONS = Object.values(OrganizationPermission);

// OWNER and ADMIN currently share every operational permission. This does
// NOT make OWNER an alias of ADMIN — owner identity/lifecycle protections
// (cannot be demoted/deactivated/removed; Organization.ownerUserId is the
// canonical source of truth) remain enforced as service-level invariants,
// independent of this permission matrix.
const OWNER_PERMISSIONS = ALL_PERMISSIONS;
const ADMIN_PERMISSIONS = ALL_PERMISSIONS;

const TRAINER_PERMISSIONS = [
  OrganizationPermission.ORGANIZATION_VIEW,
  OrganizationPermission.MEMBERS_VIEW,
  OrganizationPermission.INTERVIEWS_VIEW,
  OrganizationPermission.INTERVIEWS_MANAGE,
  OrganizationPermission.QUESTION_SETS_VIEW,
  OrganizationPermission.QUESTION_SETS_MANAGE,
  OrganizationPermission.REPORTS_VIEW,
  OrganizationPermission.ANALYTICS_VIEW,
] as const;

const RECRUITER_PERMISSIONS = [
  OrganizationPermission.ORGANIZATION_VIEW,
  OrganizationPermission.MEMBERS_VIEW,
  OrganizationPermission.INTERVIEWS_VIEW,
  OrganizationPermission.INTERVIEWS_MANAGE,
  OrganizationPermission.QUESTION_SETS_VIEW,
  OrganizationPermission.REPORTS_VIEW,
  OrganizationPermission.ANALYTICS_VIEW,
] as const;

const MEMBER_PERMISSIONS = [
  OrganizationPermission.ORGANIZATION_VIEW,
  OrganizationPermission.INTERVIEWS_VIEW,
  OrganizationPermission.REPORTS_VIEW,
] as const;

/** Single source of truth: role -> permissions. Same matrix for every organization type — RBAC answers "what can this role do", not "should this org type use this role" (that's a later, separate concern). */
export const ORGANIZATION_ROLE_PERMISSIONS: Record<OrganizationMemberRole, readonly OrganizationPermission[]> = {
  [OrganizationMemberRole.OWNER]: OWNER_PERMISSIONS,
  [OrganizationMemberRole.ADMIN]: ADMIN_PERMISSIONS,
  [OrganizationMemberRole.TRAINER]: TRAINER_PERMISSIONS,
  [OrganizationMemberRole.RECRUITER]: RECRUITER_PERMISSIONS,
  [OrganizationMemberRole.MEMBER]: MEMBER_PERMISSIONS,
};

/** Returns a copy-safe permission list for a role. Unknown/stale runtime role values (bad DB data) safely return an empty list rather than throwing. */
export function getOrganizationPermissionsForRole(role: OrganizationMemberRole): readonly OrganizationPermission[] {
  return ORGANIZATION_ROLE_PERMISSIONS[role] ?? [];
}

/** Fails closed: an unrecognized role never matches any permission. */
export function hasOrganizationPermission(role: OrganizationMemberRole, permission: OrganizationPermission): boolean {
  return getOrganizationPermissionsForRole(role).includes(permission);
}

export function hasAnyOrganizationPermission(
  role: OrganizationMemberRole,
  permissions: readonly OrganizationPermission[]
): boolean {
  const granted = getOrganizationPermissionsForRole(role);
  return permissions.some((permission) => granted.includes(permission));
}

export function hasAllOrganizationPermissions(
  role: OrganizationMemberRole,
  permissions: readonly OrganizationPermission[]
): boolean {
  const granted = getOrganizationPermissionsForRole(role);
  return permissions.every((permission) => granted.includes(permission));
}
