import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthenticatedLayout from '../components/AuthenticatedLayout';
import billingApi, { PaymentOrder } from '../api/billingApi';
import { ArrowLeft, AlertCircle, Loader2, ChevronLeft, ChevronRight, Receipt } from 'lucide-react';

const PAGE_LIMIT = 20;

const formatDate = (value?: string) =>
  value ? new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

const formatPurchase = (order: PaymentOrder) =>
  order.purchaseType === 'subscription' ? `Plan: ${order.planCode}` : `Credits: ${order.creditPackCode}`;

const STATUS_BADGE: Record<string, string> = {
  paid: 'badge-success',
  refunded: 'badge-neutral',
  partially_refunded: 'badge-neutral',
  failed: 'bg-red-50 text-red-700 dark:bg-mentor-error/10 dark:text-mentor-error',
  cancelled: 'badge-neutral',
  expired: 'badge-neutral',
  created: 'badge-warning',
  provider_created: 'badge-warning',
  payment_pending: 'badge-warning',
};

const STATUS_LABEL: Record<string, string> = {
  paid: 'Paid',
  refunded: 'Refunded',
  partially_refunded: 'Partially Refunded',
  failed: 'Failed',
  cancelled: 'Cancelled',
  expired: 'Expired',
  created: 'Pending',
  provider_created: 'Pending',
  payment_pending: 'Pending',
};

const BillingHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  const fetchOrders = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await billingApi.listOrders({ page: targetPage, limit: PAGE_LIMIT });
      setOrders(response.data.orders);
      setTotal(response.data.total);
    } catch (err: any) {
      setError(err.message || 'Failed to load billing history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders(page);
  }, [page, fetchOrders]);

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        <div className="page-header">
          <button
            onClick={() => navigate('/account')}
            className="inline-flex items-center gap-1.5 text-sm text-mentor-text-secondary hover:text-mentor-text mb-3"
          >
            <ArrowLeft size={16} />
            Back to Account
          </button>
          <h1 className="page-title">Billing History</h1>
          <p className="page-subtitle">Every subscription and credit-pack purchase on your account.</p>
        </div>

        <div className="card p-0 overflow-hidden">
          {loading ? (
            <div className="p-16 text-center">
              <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
              <p className="text-mentor-text-muted text-sm">Loading billing history...</p>
            </div>
          ) : error ? (
            <div className="p-16 text-center">
              <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
              <h3 className="section-title mb-1.5">Couldn't load billing history</h3>
              <p className="text-sm text-mentor-text-secondary mb-5">{error}</p>
              <button onClick={() => fetchOrders(page)} className="btn btn-primary">
                Try Again
              </button>
            </div>
          ) : orders.length === 0 ? (
            <div className="p-16 text-center">
              <p className="text-sm text-mentor-text-secondary">
                No purchases yet.{' '}
                <button onClick={() => navigate('/pricing')} className="text-primary-600 hover:underline">
                  View plans
                </button>
              </p>
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
                      Purchase
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Reference
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Receipt
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mentor-border">
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td className="px-6 py-3 text-sm text-mentor-text-secondary whitespace-nowrap">
                        {formatDate(order.createdAt)}
                      </td>
                      <td className="px-6 py-3 text-sm text-mentor-text">{formatPurchase(order)}</td>
                      <td className="px-6 py-3 text-sm text-mentor-text text-right whitespace-nowrap">
                        ₹{(order.amountPaise / 100).toLocaleString('en-IN')}
                      </td>
                      <td className="px-6 py-3">
                        <span className={`badge ${STATUS_BADGE[order.status] || 'badge-neutral'}`}>
                          {STATUS_LABEL[order.status] || order.status}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-xs text-mentor-text-muted whitespace-nowrap">
                        {order.providerPaymentId || order.receiptReference}
                      </td>
                      <td className="px-6 py-3 text-right whitespace-nowrap">
                        {order.status === 'paid' || order.status === 'refunded' || order.status === 'partially_refunded' ? (
                          <button
                            onClick={() => navigate(`/billing/orders/${order.id}/receipt`)}
                            className="inline-flex items-center gap-1 text-sm text-primary-600 hover:underline"
                          >
                            <Receipt size={14} />
                            View
                          </button>
                        ) : (
                          <span className="text-xs text-mentor-text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && !error && total > 0 && (
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

export default BillingHistoryPage;
