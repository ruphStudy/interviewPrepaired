import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useOrganization } from '../../contexts/OrganizationContext';
import organizationBillingApi, {
  OrgBillingPlan,
  OrgSubscriptionStatusResponse,
  OrgPaymentOrder,
} from '../../api/organizationBillingApi';
import billingApi from '../../api/billingApi';
import { openRazorpayCheckout } from '../../utils/razorpayCheckout';
import {
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  CheckCircle2,
  Receipt,
  Building2,
} from 'lucide-react';

const ORDERS_PAGE_LIMIT = 10;

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const formatInr = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;
const formatDate = (value?: string) => (value ? new Date(value).toLocaleDateString() : '—');
const formatDateTime = (value: string) => new Date(value).toLocaleString();

/**
 * Company (Employer) Billing (PR-B2B-BILL-4) — Current Plan/Subscription
 * status, upgrade/downgrade/cancel actions, purchase history, and an
 * Enterprise/contract-managed "Contact Sales" state with no self-service
 * checkout button. Mirrors InstituteBillingPage's structure but for the
 * company org type's seat/feature subscription model (not prepaid credits).
 */
const EmployerBillingPage: React.FC = () => {
  const { organizationId } = useParams<{ organizationId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    activeOrganizationId,
    activeOrganization,
    loading: contextLoading,
    error: contextError,
    setActiveOrganization,
    hasPermission,
  } = useOrganization();

  const [plans, setPlans] = useState<OrgBillingPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState<string | null>(null);

  const [status, setStatus] = useState<OrgSubscriptionStatusResponse | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [orders, setOrders] = useState<OrgPaymentOrder[]>([]);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  const [processingPlanCode, setProcessingPlanCode] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;
  const canView = hasPermission('organization:view');
  const canManage = hasPermission('organization:update') && activeOrganization?.status !== 'archived';

  const fetchPlans = useCallback(async () => {
    if (!organizationId) return;
    setPlansLoading(true);
    setPlansError(null);
    try {
      const response = await organizationBillingApi.getPlans(organizationId);
      setPlans(response.data.plans);
    } catch (err: any) {
      setPlansError(err.message || 'Failed to load plans');
    } finally {
      setPlansLoading(false);
    }
  }, [organizationId]);

  const fetchStatus = useCallback(async () => {
    if (!organizationId) return;
    setStatusLoading(true);
    setStatusError(null);
    try {
      const response = await organizationBillingApi.getSubscriptionStatus(organizationId);
      setStatus(response.data);
    } catch (err: any) {
      setStatusError(err.message || 'Failed to load subscription status');
    } finally {
      setStatusLoading(false);
    }
  }, [organizationId]);

  const fetchOrders = useCallback(async () => {
    if (!organizationId) return;
    setOrdersLoading(true);
    setOrdersError(null);
    try {
      const response = await organizationBillingApi.listOrders(organizationId, { page: ordersPage, limit: ORDERS_PAGE_LIMIT });
      setOrders(response.data.orders);
      setOrdersTotal(response.data.total);
    } catch (err: any) {
      setOrdersError(err.message || 'Failed to load purchase history');
    } finally {
      setOrdersLoading(false);
    }
  }, [organizationId, ordersPage]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchPlans();
      fetchStatus();
      fetchOrders();
    }
  }, [isSyncing, activeOrganization, canView, fetchPlans, fetchStatus, fetchOrders]);

  const isEnterprise = status?.entitlements?.billingType === 'company_subscription' && !!status?.contract;

  const handleUpgrade = async (planCode: string) => {
    if (processingPlanCode || !organizationId) return;
    setActionError(null);
    setActionSuccess(null);
    setProcessingPlanCode(planCode);
    try {
      const idempotencyKey = generateIdempotencyKey();
      const checkoutResponse = await organizationBillingApi.checkoutSubscription(organizationId, planCode, idempotencyKey);
      const payload = checkoutResponse.data;

      if (!payload.keyId || !payload.providerOrderId) {
        setActionError('Payment setup pending — the payment provider is not yet configured for this environment.');
        return;
      }

      const outcome = await openRazorpayCheckout({
        keyId: payload.keyId,
        providerOrderId: payload.providerOrderId,
        amountPaise: payload.amountPaise,
        currency: payload.currency,
        description: `${activeOrganization?.name || 'Organization'} — ${planCode} subscription`,
        prefill: { name: user?.name, email: user?.email },
      });

      if (outcome.status === 'dismissed') {
        return;
      }

      await billingApi.verifyPayment({
        paymentOrderId: payload.paymentOrderId,
        razorpay_order_id: outcome.payment.razorpay_order_id,
        razorpay_payment_id: outcome.payment.razorpay_payment_id,
        razorpay_signature: outcome.payment.razorpay_signature,
      });

      setActionSuccess('Subscription activated successfully.');
      await Promise.all([fetchStatus(), fetchOrders()]);
    } catch (err: any) {
      if (err.code === 'PAYMENT_PROVIDER_UNAVAILABLE') {
        setActionError('Payment setup pending — the payment provider is not yet configured for this environment.');
      } else if (err.code === 'ORGANIZATION_SUBSCRIPTION_ALREADY_ACTIVE') {
        setActionError('This organization already has this plan active.');
      } else if (err.code === 'ORGANIZATION_ARCHIVED') {
        setActionError('This organization is archived or suspended and cannot make a purchase.');
      } else {
        setActionError(err.message || 'Payment could not be completed. Please try again.');
      }
    } finally {
      setProcessingPlanCode(null);
    }
  };

  const handleDowngrade = async (planCode: string) => {
    if (!organizationId) return;
    setActionError(null);
    setActionSuccess(null);
    setProcessingPlanCode(planCode);
    try {
      await organizationBillingApi.scheduleDowngrade(organizationId, planCode);
      setActionSuccess('Downgrade scheduled. The current plan stays active until the end of this billing period.');
      await fetchStatus();
    } catch (err: any) {
      setActionError(err.message || 'Failed to schedule downgrade');
    } finally {
      setProcessingPlanCode(null);
    }
  };

  const handleCancelScheduledDowngrade = async () => {
    if (!organizationId) return;
    setActionError(null);
    setActionSuccess(null);
    setProcessingPlanCode('cancel-downgrade');
    try {
      await organizationBillingApi.cancelScheduledDowngrade(organizationId);
      setActionSuccess('Scheduled downgrade cancelled.');
      await fetchStatus();
    } catch (err: any) {
      setActionError(err.message || 'Failed to cancel scheduled downgrade');
    } finally {
      setProcessingPlanCode(null);
    }
  };

  const handleCancelSubscription = async (cancelAtPeriodEnd: boolean) => {
    if (!organizationId) return;
    setActionError(null);
    setActionSuccess(null);
    setProcessingPlanCode('cancel');
    try {
      await organizationBillingApi.cancelSubscription(organizationId, cancelAtPeriodEnd);
      setActionSuccess(cancelAtPeriodEnd ? 'Subscription will end at the current period boundary.' : 'Subscription cancelled.');
      await fetchStatus();
    } catch (err: any) {
      setActionError(err.message || 'Failed to cancel subscription');
    } finally {
      setProcessingPlanCode(null);
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

  if (activeOrganization.type !== 'company') {
    return (
      <AuthenticatedLayout>
        <main className="page-container py-8">
          <div className="card max-w-md mx-auto text-center">
            <AlertCircle className="w-12 h-12 text-mentor-warning mx-auto mb-4" />
            <h2 className="section-title text-lg mb-2">Not available</h2>
            <p className="text-sm text-mentor-text-secondary">Billing &amp; subscription are only available for company organizations.</p>
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
            <p className="text-sm text-mentor-text-secondary">You don't have permission to view billing and subscription.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        <div className="page-header">
          <h1 className="page-title">Billing &amp; Subscription</h1>
          <p className="page-subtitle">Current plan, subscription status and purchase history for {activeOrganization.name}.</p>
        </div>

        {activeOrganization.status === 'archived' && (
          <div className="flex items-start gap-2 bg-amber-50 dark:bg-future-warning/10 border border-amber-200 dark:border-future-warning/20 rounded-lg p-3 mb-6">
            <AlertCircle size={16} className="text-mentor-warning mt-0.5 shrink-0" />
            <p className="text-sm text-mentor-warning">
              This organization is archived. Subscription and history remain viewable, but purchases are disabled.
            </p>
          </div>
        )}

        {actionError && (
          <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-6">
            <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
            <p className="text-sm text-mentor-error">{actionError}</p>
          </div>
        )}
        {actionSuccess && (
          <div className="flex items-start gap-2 bg-mentor-mint dark:bg-future-success/10 border border-emerald-200 dark:border-future-success/20 rounded-lg p-3 mb-6">
            <CheckCircle2 size={16} className="text-mentor-success mt-0.5 shrink-0" />
            <p className="text-sm text-mentor-success">{actionSuccess}</p>
          </div>
        )}

        {/* Current plan / subscription status */}
        <div className="card mb-6">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard size={18} className="text-primary-600" />
            <h2 className="section-title mb-0">Current Plan</h2>
          </div>
          {statusLoading ? (
            <div className="p-6 text-center">
              <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
            </div>
          ) : statusError ? (
            <div className="p-6 text-center">
              <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
              <p className="text-sm text-mentor-text-secondary mb-4">{statusError}</p>
              <button onClick={fetchStatus} className="btn btn-primary">
                Try Again
              </button>
            </div>
          ) : isEnterprise ? (
            <div className="surface-muted p-4">
              <div className="flex items-center gap-2 mb-2">
                <Building2 size={16} className="text-primary-600" />
                <p className="text-sm font-semibold text-mentor-text">Contract Managed — {status?.contract?.contractCode}</p>
              </div>
              <p className="text-sm text-mentor-text-secondary mb-1">
                Plan: {status?.contract?.planCode || 'Custom'} &middot; Status: {status?.contract?.status}
              </p>
              <p className="text-sm text-mentor-text-secondary mb-1">
                Start: {formatDate(status?.contract?.startDate)} &middot; End: {formatDate(status?.contract?.endDate)}
              </p>
              {status?.contract?.creditAllowance !== undefined && (
                <p className="text-sm text-mentor-text-secondary mb-3">Credit allowance: {status?.contract?.creditAllowance}</p>
              )}
              <p className="text-sm text-mentor-text-secondary">
                Account-managed billing — contact your account manager for any changes.
              </p>
            </div>
          ) : status?.subscription ? (
            <div className="surface-muted p-4">
              <p className="text-lg font-bold text-mentor-text dark:text-future-text mb-1">{status.subscription.planCode}</p>
              <p className="text-sm text-mentor-text-secondary mb-1">
                Status: <span className="badge badge-info">{status.subscription.status}</span>
              </p>
              <p className="text-sm text-mentor-text-secondary mb-1">
                Period: {formatDate(status.subscription.currentPeriodStart)} &rarr; {formatDate(status.subscription.currentPeriodEnd)}
              </p>
              <p className="text-sm text-mentor-text-secondary mb-3">
                {status.subscription.cancelAtPeriodEnd
                  ? 'This subscription will end at the current period boundary — no automatic renewal.'
                  : 'No recurring auto-charge is set up — renew manually before the period ends.'}
              </p>
              {status.subscription.pendingNextPlanCode && (
                <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg border border-amber-200 bg-amber-50 p-3 mb-3">
                  <p className="text-sm text-amber-800">
                    Scheduled change: moving to <strong>{status.subscription.pendingNextPlanCode}</strong> at period end.
                  </p>
                  {canManage && (
                    <button
                      onClick={handleCancelScheduledDowngrade}
                      disabled={processingPlanCode === 'cancel-downgrade'}
                      className="btn btn-secondary px-3 py-1.5 text-xs"
                    >
                      {processingPlanCode === 'cancel-downgrade' ? 'Cancelling...' : 'Cancel Scheduled Change'}
                    </button>
                  )}
                </div>
              )}
              {canManage && !status.subscription.cancelAtPeriodEnd && (
                <button
                  onClick={() => handleCancelSubscription(true)}
                  disabled={processingPlanCode === 'cancel'}
                  className="btn btn-secondary px-3 py-1.5 text-xs"
                >
                  {processingPlanCode === 'cancel' ? 'Processing...' : 'Cancel at Period End'}
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-mentor-text-secondary">No active subscription. Choose a plan below to get started.</p>
          )}
        </div>

        {/* Plan catalog / upgrade-downgrade */}
        {!isEnterprise && (
          <div className="card mb-6">
            <h2 className="section-title mb-1">Available Plans</h2>
            <p className="text-sm text-mentor-text-secondary mb-5">
              Upgrades activate immediately. Downgrades take effect at the end of the current billing period.
            </p>
            {plansLoading ? (
              <div className="p-6 text-center">
                <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
              </div>
            ) : plansError ? (
              <p className="text-sm text-mentor-error text-center py-6">{plansError}</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[...plans]
                  .filter((p) => p.organizationType === 'company')
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((plan) => {
                    const isCurrent = status?.subscription?.planCode === plan.code && status?.subscription?.status === 'active';
                    const isProcessing = processingPlanCode === plan.code;
                    const currentPrice = plans.find((p) => p.code === status?.subscription?.planCode)?.priceInrPaise;
                    const isDowngrade =
                      !plan.customPrice &&
                      plan.priceInrPaise !== null &&
                      currentPrice != null &&
                      plan.priceInrPaise < currentPrice;
                    return (
                      <div key={plan.code} className="surface-muted p-4 flex flex-col">
                        <h3 className="text-sm font-semibold text-mentor-text mb-1">{plan.name}</h3>
                        <p className="text-xs text-mentor-text-secondary mb-3">{plan.description}</p>
                        <div className="mb-3">
                          {plan.customPrice || plan.priceInrPaise === null ? (
                            <span className="badge badge-info">Custom pricing — contact sales</span>
                          ) : (
                            <p className="text-xl font-bold text-mentor-text dark:text-future-text">
                              {formatInr(plan.priceInrPaise)}
                              <span className="text-xs font-normal text-mentor-text-muted"> / month</span>
                            </p>
                          )}
                        </div>
                        <ul className="space-y-1 mb-3">
                          {plan.features.map((feature, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-xs text-mentor-text-secondary">
                              <CheckCircle2 size={13} className="text-mentor-success mt-0.5 shrink-0" />
                              {feature.replace(/_/g, ' ')}
                            </li>
                          ))}
                        </ul>
                        <div className="mt-auto">
                          {plan.customPrice || plan.priceInrPaise === null ? (
                            <a href="mailto:sales@enterskill.com" className="btn btn-secondary w-full text-center">
                              Contact Sales
                            </a>
                          ) : isCurrent ? (
                            <button disabled className="btn btn-secondary w-full">
                              Current Plan
                            </button>
                          ) : canManage ? (
                            <button
                              onClick={() => (isDowngrade ? handleDowngrade(plan.code) : handleUpgrade(plan.code))}
                              disabled={!!processingPlanCode}
                              className="btn btn-primary w-full"
                            >
                              {isProcessing ? 'Processing...' : isDowngrade ? 'Schedule Downgrade' : 'Upgrade'}
                            </button>
                          ) : (
                            <p className="text-xs text-mentor-text-muted text-center">Contact an organization admin to change plan.</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {/* Purchase History */}
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center gap-2 px-6 pt-6 mb-2">
            <Receipt size={18} className="text-primary-600" />
            <h2 className="section-title mb-0">Purchase History</h2>
          </div>
          {ordersLoading ? (
            <div className="p-16 text-center">
              <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
              <p className="text-mentor-text-muted text-sm">Loading purchase history...</p>
            </div>
          ) : ordersError ? (
            <div className="p-16 text-center">
              <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
              <h3 className="section-title mb-1.5">Couldn't load purchase history</h3>
              <p className="text-sm text-mentor-text-secondary mb-5">{ordersError}</p>
              <button onClick={fetchOrders} className="btn btn-primary">
                Try Again
              </button>
            </div>
          ) : orders.length === 0 ? (
            <div className="p-16 text-center">
              <p className="text-sm text-mentor-text-secondary">No purchases yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-mentor-border">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">Plan</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mentor-border">
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td className="px-6 py-3 text-sm text-mentor-text-secondary whitespace-nowrap">{formatDateTime(order.createdAt)}</td>
                      <td className="px-6 py-3 text-sm text-mentor-text">{order.planCode || '—'}</td>
                      <td className="px-6 py-3 text-sm text-right text-mentor-text">{formatInr(order.amountPaise)}</td>
                      <td className="px-6 py-3">
                        <span className={`badge ${order.status === 'paid' ? 'badge-success' : 'badge-neutral'}`}>{order.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!ordersLoading && !ordersError && ordersTotal > ORDERS_PAGE_LIMIT && (
            <div className="px-4 sm:px-6 py-4 border-t border-mentor-border flex items-center justify-between gap-4">
              <p className="text-xs text-mentor-text-muted">
                Page {ordersPage} of {Math.max(1, Math.ceil(ordersTotal / ORDERS_PAGE_LIMIT))} &middot; {ordersTotal} total
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setOrdersPage((p) => Math.max(1, p - 1))}
                  disabled={ordersPage <= 1}
                  className="btn btn-secondary px-3 py-2"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setOrdersPage((p) => Math.min(Math.ceil(ordersTotal / ORDERS_PAGE_LIMIT), p + 1))}
                  disabled={ordersPage >= Math.ceil(ordersTotal / ORDERS_PAGE_LIMIT)}
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

export default EmployerBillingPage;
