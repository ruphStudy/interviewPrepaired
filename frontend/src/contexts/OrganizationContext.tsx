import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import organizationApi, {
  OrganizationDetail,
  OrganizationMemberRole,
  OrganizationPermission,
  OrganizationType,
} from '../api/organizationApi';

const ACTIVE_ORG_STORAGE_KEY = 'activeOrganizationId';

/**
 * Lightweight view model for the switcher/nav — deliberately narrower than
 * OrganizationSummary/OrganizationDetail since that's all a list entry needs.
 */
export interface OrganizationOption {
  id: string;
  name: string;
  slug: string;
  type: OrganizationType;
}

interface OrganizationContextType {
  /** Every organization the caller can access — owned, or an ACTIVE member of — as returned by GET /organizations. */
  organizations: OrganizationOption[];
  activeOrganizationId: string | null;
  activeOrganization: OrganizationDetail | null;
  /** The caller's own OrganizationMember id in the active organization — e.g. needed to self-scope trainer-only lookups. */
  activeMembershipId: string | null;
  activeRole: OrganizationMemberRole | null;
  activePermissions: OrganizationPermission[];
  loading: boolean;
  error: string | null;
  /** Pass null to switch to Personal/B2C mode. */
  setActiveOrganization: (organizationId: string | null) => Promise<void>;
  /** Re-fetches the active organization's own detail/access (e.g. after an edit). */
  refreshActiveOrganization: () => Promise<void>;
  /** Re-fetches the accessible-organizations list (e.g. after creating one or accepting an invitation). */
  refreshOrganizations: () => Promise<void>;
  hasPermission: (permission: OrganizationPermission) => boolean;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

export const useOrganization = () => {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
};

interface OrganizationProviderProps {
  children: ReactNode;
}

/**
 * Multi-tenant organization context (UI-02) — tracks which organization
 * (if any) is "active" for the current session, and that organization's
 * ORG-LOCAL role/permissions. Deliberately never derives permissions from
 * the global `useAuth().user.role` — that field is the platform role
 * ('user'|'admin'), unrelated to organization RBAC. The backend remains
 * the sole authority regardless of what this context reports; it exists
 * only to drive UI affordances (nav visibility, disabled buttons).
 *
 * `organizations` comes ENTIRELY from `GET /organizations`, which now
 * returns every organization the caller can access (owned OR an ACTIVE
 * member of) — there is no client-side cache/workaround for organizations
 * joined via invitation; `refreshOrganizations()` after an accept is
 * sufficient since the backend itself reflects the new membership.
 */
export const OrganizationProvider: React.FC<OrganizationProviderProps> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [activeOrganizationId, setActiveOrganizationId] = useState<string | null>(null);
  const [activeOrganization, setActiveOrganizationDetail] = useState<OrganizationDetail | null>(null);
  const [activeMembershipId, setActiveMembershipId] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<OrganizationMemberRole | null>(null);
  const [activePermissions, setActivePermissions] = useState<OrganizationPermission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearActive = useCallback(() => {
    setActiveOrganizationId(null);
    setActiveOrganizationDetail(null);
    setActiveMembershipId(null);
    setActiveRole(null);
    setActivePermissions([]);
    localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
  }, []);

  const loadActiveOrganization = useCallback(async (organizationId: string) => {
    try {
      const [orgResponse, access] = await Promise.all([
        organizationApi.getOrganization(organizationId),
        organizationApi.getOrganizationAccess(organizationId),
      ]);
      setActiveOrganizationDetail(orgResponse.data.organization);
      setActiveMembershipId(access.membershipId);
      setActiveRole(access.role);
      setActivePermissions(access.permissions);
      setActiveOrganizationId(organizationId);
      localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, organizationId);
      setError(null);
    } catch (err: any) {
      // No longer accessible (removed, archived-and-restricted, etc.) —
      // fall back to Personal mode cleanly rather than leaving stale data.
      clearActive();
      setError(err.message || 'Failed to load organization');
    }
  }, [clearActive]);

  const fetchAccessibleOrganizations = useCallback(async (): Promise<OrganizationOption[]> => {
    const response = await organizationApi.listMyOrganizations({ limit: 100 });
    return response.data.organizations.map((org) => ({ id: org.id, name: org.name, slug: org.slug, type: org.type }));
  }, []);

  const initialize = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const accessible = await fetchAccessibleOrganizations();
      setOrganizations(accessible);

      const storedId = localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
      const accessibleIds = new Set(accessible.map((o) => o.id));

      if (storedId && accessibleIds.has(storedId)) {
        await loadActiveOrganization(storedId);
      } else if (accessible.length > 0) {
        await loadActiveOrganization(accessible[0].id);
      } else {
        clearActive();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load organizations');
    } finally {
      setLoading(false);
    }
  }, [fetchAccessibleOrganizations, loadActiveOrganization, clearActive]);

  useEffect(() => {
    if (isAuthenticated) {
      initialize();
    } else {
      // Logged out (or never logged in) — reset everything and never call
      // organization endpoints while unauthenticated.
      setOrganizations([]);
      clearActive();
      setLoading(false);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const setActiveOrganization = useCallback(
    async (organizationId: string | null) => {
      if (organizationId === null) {
        clearActive();
        return;
      }
      setLoading(true);
      await loadActiveOrganization(organizationId);
      setLoading(false);
    },
    [clearActive, loadActiveOrganization]
  );

  const refreshActiveOrganization = useCallback(async () => {
    if (!activeOrganizationId) return;
    await loadActiveOrganization(activeOrganizationId);
  }, [activeOrganizationId, loadActiveOrganization]);

  const refreshOrganizations = useCallback(async () => {
    try {
      const accessible = await fetchAccessibleOrganizations();
      setOrganizations(accessible);
    } catch (err: any) {
      setError(err.message || 'Failed to load organizations');
    }
  }, [fetchAccessibleOrganizations]);

  const hasPermission = useCallback(
    (permission: OrganizationPermission) => activePermissions.includes(permission),
    [activePermissions]
  );

  const value: OrganizationContextType = {
    organizations,
    activeOrganizationId,
    activeOrganization,
    activeMembershipId,
    activeRole,
    activePermissions,
    loading,
    error,
    setActiveOrganization,
    refreshActiveOrganization,
    refreshOrganizations,
    hasPermission,
  };

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
};
