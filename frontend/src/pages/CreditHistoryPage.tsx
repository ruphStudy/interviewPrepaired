import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthenticatedLayout from '../components/AuthenticatedLayout';
import subscriptionApi, { CreditTransaction } from '../api/subscriptionApi';
import { ArrowLeft, AlertCircle, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_LIMIT = 20;

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

const formatType = (type: CreditTransaction['type']) =>
  type
    .split('_')
    .map((word) => word[0] + word.slice(1).toLowerCase())
    .join(' ');

const CreditHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  const fetchHistory = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await subscriptionApi.getCreditHistory({ page: targetPage, limit: PAGE_LIMIT });
      setTransactions(response.data.transactions);
      setTotal(response.data.total);
    } catch (err: any) {
      setError(err.message || 'Failed to load credit history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory(page);
  }, [page, fetchHistory]);

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
          <h1 className="page-title">Credit History</h1>
          <p className="page-subtitle">Every credit granted, consumed, or refunded on your account.</p>
        </div>

        <div className="card p-0 overflow-hidden">
          {loading ? (
            <div className="p-16 text-center">
              <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
              <p className="text-mentor-text-muted text-sm">Loading credit history...</p>
            </div>
          ) : error ? (
            <div className="p-16 text-center">
              <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
              <h3 className="section-title mb-1.5">Couldn't load credit history</h3>
              <p className="text-sm text-mentor-text-secondary mb-5">{error}</p>
              <button onClick={() => fetchHistory(page)} className="btn btn-primary">
                Try Again
              </button>
            </div>
          ) : transactions.length === 0 ? (
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
                  {transactions.map((transaction, index) => {
                    const isPositive = transaction.amount > 0;
                    return (
                      <tr key={`${transaction.createdAt}-${index}`}>
                        <td className="px-6 py-3 text-sm text-mentor-text-secondary whitespace-nowrap">
                          {formatDate(transaction.createdAt)}
                        </td>
                        <td className="px-6 py-3 text-sm text-mentor-text">
                          {transaction.description || '—'}
                        </td>
                        <td className="px-6 py-3">
                          <span className="badge badge-neutral">{formatType(transaction.type)}</span>
                        </td>
                        <td
                          className={`px-6 py-3 text-sm font-semibold text-right whitespace-nowrap ${
                            isPositive ? 'text-mentor-success' : 'text-mentor-error'
                          }`}
                        >
                          {isPositive ? '+' : ''}
                          {transaction.amount}
                        </td>
                        <td className="px-6 py-3 text-sm text-mentor-text-secondary text-right whitespace-nowrap">
                          {transaction.balanceAfter}
                        </td>
                      </tr>
                    );
                  })}
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

export default CreditHistoryPage;
