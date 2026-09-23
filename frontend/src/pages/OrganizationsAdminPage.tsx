import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import AuthenticatedLayout from '../components/AuthenticatedLayout';
import { API_BASE_URL } from '../config/api.config';

/**
 * Super Admin B2B organization provisioning (PR-PROVISIONING). A separate
 * route (`/admin/organizations`, gated identically to `/admin` via
 * `<ProtectedRoute adminOnly>` in App.tsx) rather than a new tab bolted onto
 * AdminDashboard.tsx — that file is already ~950 lines across 7 tabs, and
 * this feature (create org + owner, invitation lifecycle, suspend/
 * reactivate, owner transfer) is substantial enough to warrant its own
 * page rather than pushing that file past ~1500 lines. Mirrors
 * AdminDashboard.tsx's own conventions exactly: plain axios + Bearer token
 * (not the organizationApi.ts class, which is the MEMBER-facing org API,
 * not the Super-Admin provisioning one), AuthenticatedLayout, Tailwind
 * table/badge/button styling, `confirm()` for destructive actions.
 */

type OrgType = 'institute' | 'company';
type OrgStatus = 'active' | 'suspended' | 'archived';

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  type: OrgType;
  status: OrgStatus;
  owner: { id: string; name?: string; email?: string };
  createdAt: string;
}

interface OrganizationDetail extends OrganizationRow {
  description?: string;
  website?: string;
  ownerInvitation: { id: string; status: string; email: string; expiresAt: string } | null;
  subscription: { planCode: string; status: string; currentPeriodEnd?: string } | null;
}

function authHeaders(token: string | null) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

function statusBadgeClass(status: OrgStatus): string {
  if (status === 'active') return 'bg-green-100 text-green-800';
  if (status === 'suspended') return 'bg-yellow-100 text-yellow-800';
  return 'bg-gray-100 text-gray-800';
}

const OrganizationsAdminPage: React.FC = () => {
  const navigate = useNavigate();
  const { token, isAdmin } = useAuth();

  useEffect(() => {
    if (!isAdmin) {
      navigate('/setup');
    }
  }, [isAdmin, navigate]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [organizations, setOrganizations] = useState<OrganizationRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createForm, setCreateForm] = useState({
    name: '',
    type: 'institute' as OrgType,
    ownerEmail: '',
    ownerName: '',
  });

  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<OrganizationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [changeOwnerEmail, setChangeOwnerEmail] = useState('');
  const [showChangeOwnerForm, setShowChangeOwnerForm] = useState(false);

  const fetchOrganizations = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string | number> = { page, limit: 10 };
      if (typeFilter) params.type = typeFilter;
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;

      const response = await axios.get(`${API_BASE_URL}/admin/organizations`, { ...authHeaders(token), params });
      setOrganizations(response.data.data.organizations);
      setTotal(response.data.data.pagination.total);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load organizations');
    } finally {
      setLoading(false);
    }
  }, [token, page, typeFilter, statusFilter, search]);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  const fetchDetail = useCallback(
    async (organizationId: string) => {
      setDetailLoading(true);
      setActionError('');
      try {
        const response = await axios.get(`${API_BASE_URL}/admin/organizations/${organizationId}`, authHeaders(token));
        setSelectedOrg(response.data.data);
      } catch (err: any) {
        setActionError(err.response?.data?.message || 'Failed to load organization detail');
      } finally {
        setDetailLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (selectedOrgId) {
      fetchDetail(selectedOrgId);
      setShowChangeOwnerForm(false);
      setChangeOwnerEmail('');
    } else {
      setSelectedOrg(null);
    }
  }, [selectedOrgId, fetchDetail]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');

    if (!createForm.name.trim() || !createForm.ownerEmail.trim()) {
      setCreateError('Name and owner email are required.');
      return;
    }

    setCreating(true);
    try {
      const idempotencyKey =
        (globalThis.crypto && 'randomUUID' in globalThis.crypto && globalThis.crypto.randomUUID()) ||
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      await axios.post(
        `${API_BASE_URL}/admin/organizations`,
        {
          name: createForm.name.trim(),
          type: createForm.type,
          ownerEmail: createForm.ownerEmail.trim(),
          ownerName: createForm.ownerName.trim() || undefined,
          idempotencyKey,
        },
        authHeaders(token)
      );

      setCreateForm({ name: '', type: 'institute', ownerEmail: '', ownerName: '' });
      setShowCreateForm(false);
      setPage(1);
      await fetchOrganizations();
    } catch (err: any) {
      setCreateError(err.response?.data?.message || 'Failed to create organization');
    } finally {
      setCreating(false);
    }
  };

  const runAction = async (action: () => Promise<void>) => {
    setActionError('');
    setActionBusy(true);
    try {
      await action();
      if (selectedOrgId) await fetchDetail(selectedOrgId);
      await fetchOrganizations();
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Action failed');
    } finally {
      setActionBusy(false);
    }
  };

  const handleResendInvite = () =>
    runAction(async () => {
      await axios.post(`${API_BASE_URL}/admin/organizations/${selectedOrgId}/owner-invitation/resend`, {}, authHeaders(token));
    });

  const handleRevokeInvite = () =>
    runAction(async () => {
      if (!confirm('Revoke the pending owner invitation? The current invite link will stop working.')) return;
      await axios.post(`${API_BASE_URL}/admin/organizations/${selectedOrgId}/owner-invitation/revoke`, {}, authHeaders(token));
    });

  const handleSuspend = () =>
    runAction(async () => {
      if (!confirm('Suspend this organization? Members will lose normal operational access until reactivated.')) return;
      await axios.post(`${API_BASE_URL}/admin/organizations/${selectedOrgId}/suspend`, {}, authHeaders(token));
    });

  const handleReactivate = () =>
    runAction(async () => {
      await axios.post(`${API_BASE_URL}/admin/organizations/${selectedOrgId}/reactivate`, {}, authHeaders(token));
    });

  const handleChangeOwner = (e: React.FormEvent) => {
    e.preventDefault();
    if (!changeOwnerEmail.trim()) return;
    if (!confirm(`Transfer ownership to ${changeOwnerEmail.trim()}? The previous owner keeps admin-level access.`)) return;
    runAction(async () => {
      await axios.post(
        `${API_BASE_URL}/admin/organizations/${selectedOrgId}/change-owner`,
        { email: changeOwnerEmail.trim() },
        authHeaders(token)
      );
      setShowChangeOwnerForm(false);
      setChangeOwnerEmail('');
    });
  };

  const totalPages = Math.max(1, Math.ceil(total / 10));

  return (
    <AuthenticatedLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <button onClick={() => navigate('/admin')} className="text-sm text-gray-500 hover:text-gray-700 mb-1">
              ← Admin Dashboard
            </button>
            <h1 className="text-2xl font-bold text-gray-900">Organizations</h1>
          </div>
          <button
            onClick={() => setShowCreateForm((v) => !v)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
          >
            {showCreateForm ? 'Cancel' : '+ New Organization'}
          </button>
        </div>

        {showCreateForm && (
          <form onSubmit={handleCreate} className="bg-white rounded-lg shadow p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Create Institute or Employer Organization</h2>
            {createError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">{createError}</div>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Organization Name</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                <select
                  value={createForm.type}
                  onChange={(e) => setCreateForm((f) => ({ ...f, type: e.target.value as OrgType }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="institute">Institute</option>
                  <option value="company">Employer (Company)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Owner Email</label>
                <input
                  type="email"
                  value={createForm.ownerEmail}
                  onChange={(e) => setCreateForm((f) => ({ ...f, ownerEmail: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  If this email has no account yet, one is created and sent an activation link. If it already has an
                  account, that owner is linked and notified — their password is never touched.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Owner Name (new accounts only)</label>
                <input
                  type="text"
                  value={createForm.ownerName}
                  onChange={(e) => setCreateForm((f) => ({ ...f, ownerName: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Organization'}
            </button>
          </form>
        )}

        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="Search by name..."
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          />
          <select
            value={typeFilter}
            onChange={(e) => {
              setPage(1);
              setTypeFilter(e.target.value);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="">All types</option>
            <option value="institute">Institute</option>
            <option value="company">Employer</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => {
              setPage(1);
              setStatusFilter(e.target.value);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="archived">Archived</option>
          </select>
          <div className="text-sm text-gray-600 ml-auto">Total: {total}</div>
        </div>

        {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">{error}</div>}

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-lg shadow overflow-hidden overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Owner</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {organizations.map((org) => (
                    <tr key={org.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{org.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">{org.type}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full capitalize ${statusBadgeClass(org.status)}`}>
                          {org.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {org.owner.name || org.owner.email || org.owner.id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => setSelectedOrgId(org.id)}
                          className="text-indigo-600 hover:text-indigo-900"
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                  {organizations.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
                        No organizations found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </>
        )}

        {/* Detail / management panel */}
        {selectedOrgId && (
          <div className="bg-white rounded-lg shadow p-6 space-y-4 border border-indigo-100">
            <div className="flex justify-between items-start">
              <h2 className="font-semibold text-gray-900 text-lg">
                {selectedOrg ? selectedOrg.name : 'Loading...'}
              </h2>
              <button onClick={() => setSelectedOrgId(null)} className="text-gray-400 hover:text-gray-600 text-sm">
                Close
              </button>
            </div>

            {actionError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">{actionError}</div>}

            {detailLoading || !selectedOrg ? (
              <div className="text-sm text-gray-500">Loading details...</div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Status: </span>
                    <span className={`px-2 py-0.5 text-xs rounded-full capitalize ${statusBadgeClass(selectedOrg.status)}`}>
                      {selectedOrg.status}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Slug: </span>
                    {selectedOrg.slug}
                  </div>
                  <div>
                    <span className="text-gray-500">Owner: </span>
                    {selectedOrg.owner.name || '—'} ({selectedOrg.owner.email || selectedOrg.owner.id})
                  </div>
                  <div>
                    <span className="text-gray-500">Plan: </span>
                    {selectedOrg.subscription ? `${selectedOrg.subscription.planCode} (${selectedOrg.subscription.status})` : 'None assigned'}
                  </div>
                  <div className="md:col-span-2">
                    <span className="text-gray-500">Owner invitation: </span>
                    {selectedOrg.ownerInvitation
                      ? `${selectedOrg.ownerInvitation.status} — expires ${new Date(selectedOrg.ownerInvitation.expiresAt).toLocaleString()}`
                      : 'None'}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                  <button
                    onClick={handleResendInvite}
                    disabled={actionBusy}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    Resend Owner Invite
                  </button>
                  <button
                    onClick={handleRevokeInvite}
                    disabled={actionBusy}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    Revoke Owner Invite
                  </button>
                  {selectedOrg.status === 'suspended' ? (
                    <button
                      onClick={handleReactivate}
                      disabled={actionBusy}
                      className="px-3 py-1.5 text-sm border border-green-300 text-green-700 rounded-lg hover:bg-green-50 disabled:opacity-50"
                    >
                      Reactivate
                    </button>
                  ) : (
                    <button
                      onClick={handleSuspend}
                      disabled={actionBusy || selectedOrg.status === 'archived'}
                      className="px-3 py-1.5 text-sm border border-yellow-300 text-yellow-700 rounded-lg hover:bg-yellow-50 disabled:opacity-50"
                    >
                      Suspend
                    </button>
                  )}
                  <button
                    onClick={() => setShowChangeOwnerForm((v) => !v)}
                    disabled={actionBusy}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    Change Owner
                  </button>
                </div>

                {showChangeOwnerForm && (
                  <form onSubmit={handleChangeOwner} className="flex gap-2 items-center pt-2">
                    <input
                      type="email"
                      placeholder="New owner email"
                      value={changeOwnerEmail}
                      onChange={(e) => setChangeOwnerEmail(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg flex-1"
                      required
                    />
                    <button
                      type="submit"
                      disabled={actionBusy}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:opacity-50"
                    >
                      Transfer
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </AuthenticatedLayout>
  );
};

export default OrganizationsAdminPage;
