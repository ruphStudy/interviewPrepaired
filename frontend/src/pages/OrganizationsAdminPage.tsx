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

type ContractStatus = 'draft' | 'active' | 'expired' | 'cancelled';

interface ContractRow {
  id: string;
  organizationId: string;
  contractCode: string;
  status: ContractStatus;
  startDate: string;
  endDate?: string;
  billingModel: string;
  planCode?: string;
  contractValueInrPaise?: number;
  creditAllowance?: number;
  renewalTerms?: string;
  externalReference?: string;
  activatedAt?: string;
  expiredAt?: string;
  cancelledAt?: string;
  createdAt: string;
}

interface ManualPaymentRow {
  id: string;
  organizationId: string;
  method: string;
  amountPaise: number;
  currency: string;
  referenceNote?: string;
  paymentDate: string;
  source: string;
  contractId?: string;
  notes?: string;
  createdAt: string;
}

function contractStatusBadgeClass(status: ContractStatus): string {
  if (status === 'active') return 'bg-green-100 text-green-800';
  if (status === 'draft') return 'bg-gray-100 text-gray-800';
  if (status === 'expired') return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
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

  // Enterprise contracts (PR-B2B-BILL-5) — organization-scoped, Super Admin only.
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [contractsError, setContractsError] = useState('');
  const [showCreateContractForm, setShowCreateContractForm] = useState(false);
  const [creatingContract, setCreatingContract] = useState(false);
  const [contractForm, setContractForm] = useState({
    startDate: '',
    endDate: '',
    billingModel: 'prepaid' as 'prepaid' | 'monthly' | 'annual' | 'custom',
    planCode: '',
    contractValueInrPaise: '',
    creditAllowance: '',
    renewalTerms: '',
    externalReference: '',
  });

  // Manual B2B payments — recorded against a contract or standalone.
  const [manualPayments, setManualPayments] = useState<ManualPaymentRow[]>([]);
  const [manualPaymentsLoading, setManualPaymentsLoading] = useState(false);
  const [manualPaymentsError, setManualPaymentsError] = useState('');
  const [showRecordPaymentForm, setShowRecordPaymentForm] = useState(false);
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    method: 'bank_transfer' as 'bank_transfer' | 'invoice' | 'offline' | 'other',
    amountRupees: '',
    referenceNote: '',
    paymentDate: '',
    contractId: '',
    notes: '',
  });

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

  const fetchContracts = useCallback(
    async (organizationId: string) => {
      setContractsLoading(true);
      setContractsError('');
      try {
        const response = await axios.get(`${API_BASE_URL}/admin/organizations/${organizationId}/contracts`, {
          ...authHeaders(token),
          params: { limit: 50 },
        });
        setContracts(response.data.data.contracts);
      } catch (err: any) {
        setContractsError(err.response?.data?.message || 'Failed to load contracts');
      } finally {
        setContractsLoading(false);
      }
    },
    [token]
  );

  const fetchManualPayments = useCallback(
    async (organizationId: string) => {
      setManualPaymentsLoading(true);
      setManualPaymentsError('');
      try {
        const response = await axios.get(`${API_BASE_URL}/admin/organizations/${organizationId}/manual-payments`, {
          ...authHeaders(token),
          params: { limit: 50 },
        });
        setManualPayments(response.data.data.payments);
      } catch (err: any) {
        setManualPaymentsError(err.response?.data?.message || 'Failed to load manual payments');
      } finally {
        setManualPaymentsLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (selectedOrgId) {
      fetchDetail(selectedOrgId);
      fetchContracts(selectedOrgId);
      fetchManualPayments(selectedOrgId);
      setShowChangeOwnerForm(false);
      setChangeOwnerEmail('');
      setShowCreateContractForm(false);
      setShowRecordPaymentForm(false);
    } else {
      setSelectedOrg(null);
      setContracts([]);
      setManualPayments([]);
    }
  }, [selectedOrgId, fetchDetail, fetchContracts, fetchManualPayments]);

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

  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId) return;
    setContractsError('');
    if (!contractForm.startDate) {
      setContractsError('Start date is required.');
      return;
    }
    setCreatingContract(true);
    try {
      await axios.post(
        `${API_BASE_URL}/admin/organizations/${selectedOrgId}/contracts`,
        {
          startDate: contractForm.startDate,
          endDate: contractForm.endDate || undefined,
          billingModel: contractForm.billingModel,
          planCode: contractForm.planCode.trim() || undefined,
          contractValueInrPaise: contractForm.contractValueInrPaise ? Math.round(Number(contractForm.contractValueInrPaise) * 100) : undefined,
          creditAllowance: contractForm.creditAllowance ? Number(contractForm.creditAllowance) : undefined,
          renewalTerms: contractForm.renewalTerms.trim() || undefined,
          externalReference: contractForm.externalReference.trim() || undefined,
        },
        authHeaders(token)
      );
      setContractForm({
        startDate: '',
        endDate: '',
        billingModel: 'prepaid',
        planCode: '',
        contractValueInrPaise: '',
        creditAllowance: '',
        renewalTerms: '',
        externalReference: '',
      });
      setShowCreateContractForm(false);
      await fetchContracts(selectedOrgId);
    } catch (err: any) {
      setContractsError(err.response?.data?.message || 'Failed to create contract');
    } finally {
      setCreatingContract(false);
    }
  };

  const handleContractLifecycleAction = async (contractId: string, action: 'activate' | 'expire' | 'cancel', confirmMessage?: string) => {
    if (!selectedOrgId) return;
    if (confirmMessage && !confirm(confirmMessage)) return;
    setContractsError('');
    try {
      await axios.post(`${API_BASE_URL}/admin/organizations/${selectedOrgId}/contracts/${contractId}/${action}`, {}, authHeaders(token));
      await fetchContracts(selectedOrgId);
      await fetchDetail(selectedOrgId);
    } catch (err: any) {
      setContractsError(err.response?.data?.message || `Failed to ${action} contract`);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId) return;
    setManualPaymentsError('');
    const amountPaise = Math.round(Number(paymentForm.amountRupees) * 100);
    if (!amountPaise || amountPaise <= 0) {
      setManualPaymentsError('A positive payment amount is required.');
      return;
    }
    if (!paymentForm.paymentDate) {
      setManualPaymentsError('Payment date is required.');
      return;
    }
    setRecordingPayment(true);
    try {
      await axios.post(
        `${API_BASE_URL}/admin/organizations/${selectedOrgId}/manual-payments`,
        {
          method: paymentForm.method,
          amountPaise,
          referenceNote: paymentForm.referenceNote.trim() || undefined,
          paymentDate: paymentForm.paymentDate,
          contractId: paymentForm.contractId || undefined,
          notes: paymentForm.notes.trim() || undefined,
        },
        authHeaders(token)
      );
      setPaymentForm({ method: 'bank_transfer', amountRupees: '', referenceNote: '', paymentDate: '', contractId: '', notes: '' });
      setShowRecordPaymentForm(false);
      await fetchManualPayments(selectedOrgId);
    } catch (err: any) {
      setManualPaymentsError(err.response?.data?.message || 'Failed to record manual payment');
    } finally {
      setRecordingPayment(false);
    }
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

                {/* Enterprise Contracts (PR-B2B-BILL-5) — organization-scoped, Super Admin only */}
                <div className="pt-4 border-t border-gray-100 space-y-3">
                  <div className="flex justify-between items-center">
                    <h3 className="font-medium text-gray-900">Enterprise Contracts</h3>
                    <button
                      onClick={() => setShowCreateContractForm((v) => !v)}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      {showCreateContractForm ? 'Cancel' : '+ New Contract'}
                    </button>
                  </div>

                  {contractsError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">{contractsError}</div>}

                  {showCreateContractForm && (
                    <form onSubmit={handleCreateContract} className="bg-gray-50 rounded-lg p-4 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
                          <input
                            type="date"
                            value={contractForm.startDate}
                            onChange={(e) => setContractForm((f) => ({ ...f, startDate: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">End Date (optional)</label>
                          <input
                            type="date"
                            value={contractForm.endDate}
                            onChange={(e) => setContractForm((f) => ({ ...f, endDate: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Billing Model</label>
                          <select
                            value={contractForm.billingModel}
                            onChange={(e) => setContractForm((f) => ({ ...f, billingModel: e.target.value as any }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          >
                            <option value="prepaid">Prepaid</option>
                            <option value="monthly">Monthly</option>
                            <option value="annual">Annual</option>
                            <option value="custom">Custom</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Plan Code (optional)</label>
                          <input
                            type="text"
                            value={contractForm.planCode}
                            onChange={(e) => setContractForm((f) => ({ ...f, planCode: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Contract Value (₹, optional)</label>
                          <input
                            type="number"
                            min="0"
                            value={contractForm.contractValueInrPaise}
                            onChange={(e) => setContractForm((f) => ({ ...f, contractValueInrPaise: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Credit Allowance (optional)</label>
                          <input
                            type="number"
                            min="0"
                            value={contractForm.creditAllowance}
                            onChange={(e) => setContractForm((f) => ({ ...f, creditAllowance: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Renewal Terms (optional)</label>
                          <input
                            type="text"
                            value={contractForm.renewalTerms}
                            onChange={(e) => setContractForm((f) => ({ ...f, renewalTerms: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-gray-600 mb-1">External Reference (optional)</label>
                          <input
                            type="text"
                            value={contractForm.externalReference}
                            onChange={(e) => setContractForm((f) => ({ ...f, externalReference: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={creatingContract}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:opacity-50"
                      >
                        {creatingContract ? 'Creating...' : 'Create Contract (draft)'}
                      </button>
                    </form>
                  )}

                  {contractsLoading ? (
                    <div className="text-sm text-gray-500">Loading contracts...</div>
                  ) : contracts.length === 0 ? (
                    <p className="text-sm text-gray-500">No contracts yet.</p>
                  ) : (
                    <div className="bg-white rounded-lg shadow overflow-hidden overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Billing</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Term</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {contracts.map((contract) => (
                            <tr key={contract.id}>
                              <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{contract.contractCode}</td>
                              <td className="px-4 py-2 whitespace-nowrap">
                                <span className={`px-2 py-0.5 text-xs rounded-full capitalize ${contractStatusBadgeClass(contract.status)}`}>
                                  {contract.status}
                                </span>
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 capitalize">{contract.billingModel}</td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                                {contract.contractValueInrPaise ? `₹${(contract.contractValueInrPaise / 100).toFixed(2)}` : '—'}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                                {new Date(contract.startDate).toLocaleDateString()}
                                {contract.endDate ? ` – ${new Date(contract.endDate).toLocaleDateString()}` : ''}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm space-x-2">
                                {contract.status === 'draft' && (
                                  <button
                                    onClick={() => handleContractLifecycleAction(contract.id, 'activate')}
                                    className="text-green-600 hover:text-green-900"
                                  >
                                    Activate
                                  </button>
                                )}
                                {contract.status === 'active' && (
                                  <>
                                    <button
                                      onClick={() =>
                                        handleContractLifecycleAction(contract.id, 'expire', 'Mark this contract as expired?')
                                      }
                                      className="text-yellow-600 hover:text-yellow-900"
                                    >
                                      Expire
                                    </button>
                                    <button
                                      onClick={() =>
                                        handleContractLifecycleAction(contract.id, 'cancel', 'Cancel this contract?')
                                      }
                                      className="text-red-600 hover:text-red-900"
                                    >
                                      Cancel
                                    </button>
                                  </>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Manual B2B Payments — reuses the existing backend recordManualPayment/listManualPayments APIs; never fabricates a payment success client-side. */}
                <div className="pt-4 border-t border-gray-100 space-y-3">
                  <div className="flex justify-between items-center">
                    <h3 className="font-medium text-gray-900">Manual B2B Payments</h3>
                    <button
                      onClick={() => setShowRecordPaymentForm((v) => !v)}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      {showRecordPaymentForm ? 'Cancel' : '+ Record Payment'}
                    </button>
                  </div>

                  {manualPaymentsError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">{manualPaymentsError}</div>
                  )}

                  {showRecordPaymentForm && (
                    <form onSubmit={handleRecordPayment} className="bg-gray-50 rounded-lg p-4 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Method</label>
                          <select
                            value={paymentForm.method}
                            onChange={(e) => setPaymentForm((f) => ({ ...f, method: e.target.value as any }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          >
                            <option value="bank_transfer">Bank Transfer</option>
                            <option value="invoice">Invoice</option>
                            <option value="offline">Offline</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Amount (₹)</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={paymentForm.amountRupees}
                            onChange={(e) => setPaymentForm((f) => ({ ...f, amountRupees: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Payment Date</label>
                          <input
                            type="date"
                            value={paymentForm.paymentDate}
                            onChange={(e) => setPaymentForm((f) => ({ ...f, paymentDate: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Contract (optional)</label>
                          <select
                            value={paymentForm.contractId}
                            onChange={(e) => setPaymentForm((f) => ({ ...f, contractId: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          >
                            <option value="">None</option>
                            {contracts.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.contractCode}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Reference Note (optional)</label>
                          <input
                            type="text"
                            value={paymentForm.referenceNote}
                            onChange={(e) => setPaymentForm((f) => ({ ...f, referenceNote: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
                          <input
                            type="text"
                            value={paymentForm.notes}
                            onChange={(e) => setPaymentForm((f) => ({ ...f, notes: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={recordingPayment}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:opacity-50"
                      >
                        {recordingPayment ? 'Recording...' : 'Record Payment'}
                      </button>
                    </form>
                  )}

                  {manualPaymentsLoading ? (
                    <div className="text-sm text-gray-500">Loading payments...</div>
                  ) : manualPayments.length === 0 ? (
                    <p className="text-sm text-gray-500">No manual payments recorded yet.</p>
                  ) : (
                    <div className="bg-white rounded-lg shadow overflow-hidden overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {manualPayments.map((payment) => (
                            <tr key={payment.id}>
                              <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 capitalize">{payment.method.replace('_', ' ')}</td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                                {(payment.amountPaise / 100).toFixed(2)} {payment.currency}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">{payment.referenceNote || '—'}</td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                                {new Date(payment.paymentDate).toLocaleDateString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AuthenticatedLayout>
  );
};

export default OrganizationsAdminPage;
