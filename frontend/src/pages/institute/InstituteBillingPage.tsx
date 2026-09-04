import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import instituteApi, {
  InstituteCreditPlan,
  InstitutePlanCode,
  InterviewCreditLedgerRow,
  InterviewCreditLedgerType,
} from '../../api/instituteApi';
import { AlertCircle, Loader2, ChevronLeft, ChevronRight, Wallet, Package, CheckCircle2, ShieldCheck } from 'lucide-react';

const PAGE_LIMIT = 20;

// ENTERPRISE is intentionally excluded — its volume/price is custom and can
// never be auto-granted (enforced server-side too).
const GRANTABLE_PLAN_CODES: InstitutePlanCode[] = ['STARTER', 'GROWTH', 'PRO'];

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `grant-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const getLedgerTypeBadgeClass = (type: InterviewCreditLedgerType) => {
  switch (type) {
    case 'GRANT':
    case 'REFUND':
      return 'badge-success';
    case 'CONSUME':
      return 'badge-info';
    case 'ADMIN_ADJUSTMENT':
      return 'badge-warning';
    default:
      return 'badge-neutral';
  }
};

const formatAmount = (amount: number) => (amount > 0 ? `+${amount}` : `${amount}`);
const formatDateTime = (value: string) => new Date(value).toLocaleString();
const formatInr = (value: number) => `₹${value.toLocaleString('en-IN')}`;

/**
 * Institute Billing & Credits (UI-08). There is NO payment gateway or
 * subscription model yet — the plan catalog is informational only ("what
 * packages exist"), never a checkout. The only mutation here is the
 * existing foundation/admin-style grant endpoint, deliberately labeled
 * "Administrative Credit Grant" and gated to organization:update so it
 * reads as an internal action, not a purchase flow.
 */
const InstituteBillingPage: React.FC = () => {
  const { organizationId } = useParams<{ organizationId: string }>();
  const navigate = useNavigate();
  const {
    activeOrganizationId,
    activeOrganization,
    loading: contextLoading,
    error: contextError,
    setActiveOrganization,
    hasPermission,
  } = useOrganization();

  const [balance, setBalance] = useState<number | null>(null);
  const [plans, setPlans] = useState<InstituteCreditPlan[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [ledger, setLedger] = useState<InterviewCreditLedgerRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  const [grantMode, setGrantMode] = useState<'plan' | 'amount'>('plan');
  const [grantPlanCode, setGrantPlanCode] = useState<InstitutePlanCode>('STARTER');
  const [grantAmount, setGrantAmount] = useState('');
  const [granting, setGranting] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [grantSuccess, setGrantSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;
  const canView = hasPermission('organization:view');
  const canGrant = hasPermission('organization:update') && activeOrganization?.status !== 'archived';
  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  const fetchSummary = useCallback(async () => {
    if (!organizationId) return;
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const response = await instituteApi.getInterviewCreditSummary(organizationId);
      setBalance(response.data.balance);
      setPlans(response.data.plans);
    } catch (err: any) {
      setSummaryError(err.message || 'Failed to load credit summary');
    } finally {
      setSummaryLoading(false);
    }
  }, [organizationId]);

  const fetchLedger = useCallback(async () => {
    if (!organizationId) return;
    setLedgerLoading(true);
    setLedgerError(null);
    try {
      const response = await instituteApi.listInterviewCreditLedger(organizationId, { page, limit: PAGE_LIMIT });
      setLedger(response.data.transactions);
      setTotal(response.data.pagination.total);
    } catch (err: any) {
      setLedgerError(err.message || 'Failed to load credit history');
    } finally {
      setLedgerLoading(false);
    }
  }, [organizationId, page]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'institute' && canView) {
      fetchSummary();
      fetchLedger();
    }
  }, [isSyncing, activeOrganization, canView, fetchSummary, fetchLedger]);

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (granting || !organizationId) return;

    setGrantError(null);
    setGrantSuccess(null);

    let payload: { planCode?: InstitutePlanCode; amount?: number };
    if (grantMode === 'plan') {
      payload = { planCode: grantPlanCode };
    } else {
      const amount = Number(grantAmount);
      if (!Number.isInteger(amount) || amount <= 0) {
        setGrantError('Enter a positive whole number of credits');
        return;
      }
      payload = { amount };
    }

    // Generated once per deliberate submit; the button is disabled for the
    // duration of the request (below), so a double-click cannot fire a
    // second request with a different key for the same intent.
    const idempotencyKey = generateIdempotencyKey();
    setGranting(true);
    try {
      await instituteApi.grantInterviewCredits(organizationId, { ...payload, idempotencyKey });
      setGrantSuccess('Credits granted successfully.');
      setGrantAmount('');
      await Promise.all([fetchSummary(), fetchLedger()]);
    } catch (err: any) {
      setGrantError(err.message || 'Failed to grant credits');
    } finally {
      setGranting(false);
    }
  };

  if (isSyncing || contextLoading) {
    return (
      <AuthenticatedLayout>
        <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 64px)' }}>
          <div className="text-center">
            <Loader2 className="w-9 h-9 text-primary-600 animate-spin mx-auto mb-4" />
            <p className="text-mentor-text-secondary text-sm font-medium">Loading organization...</p>
          </div>
        </div>
      </AuthenticatedLayout>
    );
  }

  if (contextError || !activeOrganization) {
    return (
      <AuthenticatedLayout>
        <div className="flex items-center justify-center p-4" style={{ minHeight: 'calc(100vh - 64px)' }}>
          <div className="card max-w-md w-full text-center">
            <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
            <h2 className="section-title text-lg mb-2">Couldn't load organization</h2>
            <p className="text-sm text-mentor-text-secondary mb-6">
              {contextError || "You don't have access to this organization, or it no longer exists."}
            </p>
            <button onClick={() => navigate('/dashboard')} className="btn btn-primary">
              Back to Dashboard
            </button>
          </div>
        </div>
      </AuthenticatedLayout>
    );
  }

  if (activeOrganization.type !== 'institute') {
    return (
      <AuthenticatedLayout>
        <main className="page-container py-8">
          <div className="card max-w-md mx-auto text-center">
            <AlertCircle className="w-12 h-12 text-mentor-warning mx-auto mb-4" />
            <h2 className="section-title text-lg mb-2">Not available</h2>
            <p className="text-sm text-mentor-text-secondary">Billing &amp; credits are only available for institute organizations.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  if (!canView) {
    return (
      <AuthenticatedLayout>
        <main className="page-container py-8">
          <div className="card max-w-md mx-auto text-center">
            <AlertCircle className="w-12 h-12 text-mentor-warning mx-auto mb-4" />
            <h2 className="section-title text-lg mb-2">No access</h2>
            <p className="text-sm text-mentor-text-secondary">You don't have permission to view billing and credits.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        <div className="page-header">
          <h1 className="page-title">Billing &amp; Credits</h1>
          <p className="page-subtitle">Interview credit balance, plan catalog and credit history for {activeOrganization.name}.</p>
        </div>

        {activeOrganization.status === 'archived' && (
          <div className="flex items-start gap-2 bg-amber-50 dark:bg-future-warning/10 border border-amber-200 dark:border-future-warning/20 rounded-lg p-3 mb-6">
            <AlertCircle size={16} className="text-mentor-warning mt-0.5 shrink-0" />
            <p className="text-sm text-mentor-warning">
              This organization is archived. Balance and history remain viewable, but credit grants are disabled.
            </p>
          </div>
        )}

        {/* Balance */}
        <div className="card mb-6">
          {summaryLoading ? (
            <div className="p-6 text-center">
              <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
            </div>
          ) : summaryError ? (
            <div className="p-6 text-center">
              <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
              <p className="text-sm text-mentor-text-secondary mb-4">{summaryError}</p>
              <button onClick={fetchSummary} className="btn btn-primary">
                Try Again
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-mentor-aqua flex items-center justify-center shrink-0">
                <Wallet size={22} className="text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-mentor-text-muted uppercase tracking-wide">Interview Credit Balance</p>
                <p className="text-3xl font-bold text-mentor-text dark:text-future-text">{balance}</p>
              </div>
            </div>
          )}
        </div>

        {/* Plan catalog */}
        <div className="card mb-6">
          <h2 className="section-title mb-1">Available Credit Packages</h2>
          <p className="text-sm text-mentor-text-secondary mb-5">
            Reference plan catalog. There is no online checkout yet — contact your account team to purchase, or ask an
            organization admin to use the administrative grant below.
          </p>
          {plans.length === 0 ? (
            <p className="text-sm text-mentor-text-secondary text-center py-6">No plans available.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...plans]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((plan) => (
                  <div key={plan.code} className="surface-muted p-4 flex flex-col">
                    <div className="flex items-center gap-2 mb-1">
                      <Package size={16} className="text-primary-600" />
                      <h3 className="text-sm font-semibold text-mentor-text">{plan.name}</h3>
                    </div>
                    <p className="text-xs text-mentor-text-secondary mb-3">{plan.description}</p>
                    <div className="mb-3">
                      {plan.customPrice || plan.priceINR === null ? (
                        <span className="badge badge-info">Custom pricing — contact sales</span>
                      ) : (
                        <p className="text-xl font-bold text-mentor-text dark:text-future-text">{formatInr(plan.priceINR)}</p>
                      )}
                      <p className="text-xs text-mentor-text-muted mt-1">
                        {plan.interviewCredits !== null ? `${plan.interviewCredits} interview credits` : 'Custom credit volume'}
                      </p>
                    </div>
                    <ul className="space-y-1 mt-auto">
                      {plan.features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-mentor-text-secondary">
                          <CheckCircle2 size={13} className="text-mentor-success mt-0.5 shrink-0" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Administrative grant */}
        {canGrant && (
          <div className="card mb-6">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck size={18} className="text-primary-600" />
              <h2 className="section-title mb-0">Administrative Credit Grant</h2>
            </div>
            <p className="text-sm text-mentor-text-secondary mb-5">
              A foundation, admin-only action — not a purchase or subscription. Grants credits directly to this
              organization's balance.
            </p>

            {grantError && (
              <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-4">
                <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                <p className="text-sm text-mentor-error">{grantError}</p>
              </div>
            )}
            {grantSuccess && (
              <div className="flex items-start gap-2 bg-mentor-mint dark:bg-future-success/10 border border-emerald-200 dark:border-future-success/20 rounded-lg p-3 mb-4">
                <CheckCircle2 size={16} className="text-mentor-success mt-0.5 shrink-0" />
                <p className="text-sm text-mentor-success">{grantSuccess}</p>
              </div>
            )}

            <form onSubmit={handleGrant} className="space-y-4">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={grantMode === 'plan'}
                    onChange={() => setGrantMode('plan')}
                  />
                  Plan grant
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={grantMode === 'amount'}
                    onChange={() => setGrantMode('amount')}
                  />
                  Manual amount
                </label>
              </div>

              {grantMode === 'plan' ? (
                <div className="sm:w-1/3">
                  <label className="label">Plan</label>
                  <select
                    value={grantPlanCode}
                    onChange={(e) => setGrantPlanCode(e.target.value as InstitutePlanCode)}
                    className="input"
                  >
                    {GRANTABLE_PLAN_CODES.map((code) => {
                      const plan = plans.find((p) => p.code === code);
                      return (
                        <option key={code} value={code}>
                          {plan ? `${plan.name} — ${plan.interviewCredits} credits` : code}
                        </option>
                      );
                    })}
                  </select>
                </div>
              ) : (
                <div className="sm:w-1/3">
                  <label className="label">Credits to grant</label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={grantAmount}
                    onChange={(e) => setGrantAmount(e.target.value)}
                    className="input"
                    placeholder="e.g. 50"
                  />
                </div>
              )}

              <button type="submit" disabled={granting} className="btn btn-primary">
                {granting ? 'Granting...' : 'Grant Credits'}
              </button>
            </form>
          </div>
        )}

        {/* Ledger */}
        <div className="card p-0 overflow-hidden">
          <h2 className="section-title px-6 pt-6 mb-2">Credit History</h2>
          {ledgerLoading ? (
            <div className="p-16 text-center">
              <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
              <p className="text-mentor-text-muted text-sm">Loading credit history...</p>
            </div>
          ) : ledgerError ? (
            <div className="p-16 text-center">
              <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
              <h3 className="section-title mb-1.5">Couldn't load credit history</h3>
              <p className="text-sm text-mentor-text-secondary mb-5">{ledgerError}</p>
              <button onClick={fetchLedger} className="btn btn-primary">
                Try Again
              </button>
            </div>
          ) : ledger.length === 0 ? (
            <div className="p-16 text-center">
              <p className="text-sm text-mentor-text-secondary">No credit transactions yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-mentor-border">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Description
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Type
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Balance After
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mentor-border">
                  {ledger.map((row) => (
                    <tr key={row.id}>
                      <td className="px-6 py-3 text-sm text-mentor-text-secondary whitespace-nowrap">
                        {formatDateTime(row.createdAt)}
                      </td>
                      <td className="px-6 py-3 text-sm text-mentor-text">
                        {row.description || '—'}
                        {row.referenceType && (
                          <span className="text-xs text-mentor-text-muted ml-2">
                            ({row.referenceType}
                            {row.referenceId ? `: ${row.referenceId}` : ''})
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <span className={`badge ${getLedgerTypeBadgeClass(row.type)}`}>{row.type.replace('_', ' ')}</span>
                      </td>
                      <td
                        className={`px-6 py-3 text-sm text-right font-semibold ${
                          row.amount > 0 ? 'text-mentor-success' : 'text-mentor-error'
                        }`}
                      >
                        {formatAmount(row.amount)}
                      </td>
                      <td className="px-6 py-3 text-sm text-right text-mentor-text-secondary">{row.balanceAfter}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!ledgerLoading && !ledgerError && total > 0 && (
            <div className="px-4 sm:px-6 py-4 border-t border-mentor-border flex items-center justify-between gap-4">
              <p className="text-xs text-mentor-text-muted">
                Page {page} of {totalPages} &middot; {total} total
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="btn btn-secondary px-3 py-2"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="btn btn-secondary px-3 py-2"
                  aria-label="Next page"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </AuthenticatedLayout>
  );
};

export default InstituteBillingPage;
