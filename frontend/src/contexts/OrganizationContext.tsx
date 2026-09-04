import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import organizationApi, {
  OrganizationDetail,
  OrganizationMemberRole,
  OrganizationPermission,
  OrganizationType,
} from '../api/organizationApi';

const ACTIVE_ORG_STORAGE_KEY = 'activeOrganizationId';
const JOINED_ORGS_STORAGE_KEY = 'joinedOrganizations';

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
  /** Every organization the caller can switch into — owned orgs (from the
   * backend's owner-only list endpoint) merged with orgs joined via an
   * accepted invitation (cached locally — see the JOINED ORGS note below). */
  organizations: OrganizationOption[];
  activeOrganizationId: string | null;
  activeOrganization: OrganizationDetail | null;
  activeRole: OrganizationMemberRole | null;
  activePermissions: OrganizationPermission[];
  loading: boolean;
  error: string | null;
  /** Pass null to switch to Personal/B2C mode. */
  setActiveOrganization: (organizationId: string | null) => Promise<void>;
  /** Re-fetches the active organization's own detail/access (e.g. after an edit). */
  refreshActiveOrganization: () => Promise<void>;
  /** Re-fetches the owned-organizations list (e.g. after creating a new one). */
  refreshOrganizations: () => Promise<void>;
  /** Caches an organization the caller just joined via invitation acceptance, so it appears in the switcher. */
  addJoinedOrganization: (org: OrganizationOption) => void;
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

function readJoinedCache(): OrganizationOption[] {
  try {
    const raw = localStorage.getItem(JOINED_ORGS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as OrganizationOption[]) : [];
  } catch {
    return [];
  }
}

function writeJoinedCache(orgs: OrganizationOption[]): void {
  localStorage.setItem(JOINED_ORGS_STORAGE_KEY, JSON.stringify(orgs));
}

function mergeOrganizations(owned: OrganizationOption[], joined: OrganizationOption[]): OrganizationOption[] {
  const byId = new Map<string, OrganizationOption>();
  [...owned, ...joined].forEach((org) => byId.set(org.id, org));
  return Array.from(byId.values());
}

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
 * JOINED ORGS NOTE: `GET /organizations` (listMyOrganizations) is
 * owner-only on the backend — it does not return organizations the caller
 * merely belongs to as a non-owner member. There is no existing
 * "my memberships across organizations" endpoint. So an organization
 * joined via invitation acceptance is cached locally (id/name/slug/type,
 * from that endpoint's own response) purely so it keeps appearing in the
 * switcher across reloads. A member added directly via "Add Member" who
 * never went through the invitation-accept flow won't be locally cached
 * this way and would need the organization's direct URL — a known,
 * disclosed gap given no backend endpoint exists for this yet.
 */
export const OrganizationProvider: React.FC<OrganizationProviderProps> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [activeOrganizationId, setActiveOrganizationId] = useState<string | null>(null);
  const [activeOrganization, setActiveOrganizationDetail] = useState<OrganizationDetail | null>(null);
  const [activeRole, setActiveRole] = useState<OrganizationMemberRole | null>(null);
  const [activePermissions, setActivePermissions] = useState<OrganizationPermission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearActive = useCallback(() => {
    setActiveOrganizationId(null);
    setActiveOrganizationDetail(null);
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

  const fetchOwnedOrganizations = useCallback(async (): Promise<OrganizationOption[]> => {
    const response = await organizationApi.listMyOrganizations({ limit: 100 });
    return response.data.organizations.map((org) => ({ id: org.id, name: org.name, slug: org.slug, type: org.type }));
  }, []);

  const initialize = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const owned = await fetchOwnedOrganizations();
      const joined = readJoinedCache();
      const merged = mergeOrganizations(owned, joined);
      setOrganizations(merged);

      const storedId = localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
      const accessibleIds = new Set(merged.map((o) => o.id));

      if (storedId && accessibleIds.has(storedId)) {
        await loadActiveOrganization(storedId);
      } else if (merged.length > 0) {
        await loadActiveOrganization(merged[0].id);
      } else {
        clearActive();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load organizations');
    } finally {
      setLoading(false);
    }
  }, [fetchOwnedOrganizations, loadActiveOrganization, clearActive]);

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
      const owned = await fetchOwnedOrganizations();
      const joined = readJoinedCache();
      setOrganizations(mergeOrganizations(owned, joined));
    } catch (err: any) {
      setError(err.message || 'Failed to load organizations');
    }
  }, [fetchOwnedOrganizations]);

  const addJoinedOrganization = useCallback((org: OrganizationOption) => {
    const joined = readJoinedCache();
    const deduped = mergeOrganizations([], [...joined, org]);
    writeJoinedCache(deduped);
    setOrganizations((prev) => mergeOrganizations(prev, [org]));
  }, []);

  const hasPermission = useCallback(
    (permission: OrganizationPermission) => activePermissions.includes(permission),
    [activePermissions]
  );

  const value: OrganizationContextType = {
    organizations,
    activeOrganizationId,
    activeOrganization,
    activeRole,
    activePermissions,
    loading,
    error,
    setActiveOrganization,
    refreshActiveOrganization,
    refreshOrganizations,
    addJoinedOrganization,
    hasPermission,
  };

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
};
