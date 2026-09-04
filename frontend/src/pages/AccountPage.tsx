import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthenticatedLayout from '../components/AuthenticatedLayout';
import subscriptionApi, { CurrentSubscription, CreditTransaction, SubscriptionPlan } from '../api/subscriptionApi';
import { Wallet, CalendarClock, AlertCircle, Loader2, History, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const getStatusBadgeClass = (status: CurrentSubscription['status']) => {
  switch (status) {
    case 'active':
      return 'badge-success';
    case 'trial':
      return 'badge-info';
    case 'expired':
    case 'cancelled':
      return 'badge-neutral';
    default:
      return 'badge-neutral';
  }
};

const formatDate = (value?: string) =>
  value ? new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';

const TransactionRow: React.FC<{ transaction: CreditTransaction }> = ({ transaction }) => {
  const isPositive = transaction.amount > 0;
  return (
    <div className="flex items-center gap-3 px-4 sm:px-6 py-3">
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
          isPositive ? 'bg-mentor-mint' : 'bg-mentor-error/10'
        }`}
      >
        {isPositive ? (
          <ArrowUpRight size={15} className="text-mentor-success" />
        ) : (
          <ArrowDownRight size={15} className="text-mentor-error" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-mentor-text truncate">
          {transaction.description || transaction.type.replace(/_/g, ' ').toLowerCase()}
        </p>
        <p className="text-xs text-mentor-text-muted">{formatDate(transaction.createdAt)}</p>
      </div>
      <div className={`text-sm font-semibold shrink-0 ${isPositive ? 'text-mentor-success' : 'text-mentor-error'}`}>
        {isPositive ? '+' : ''}
        {transaction.amount}
      </div>
    </div>
  );
};

const AccountPage: React.FC = () => {
  const navigate = useNavigate();
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null);
  const [subscription, setSubscription] = useState<CurrentSubscription | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAccount = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [subscriptionResponse, creditsResponse] = await Promise.all([
        subscriptionApi.getMySubscription(),
        subscriptionApi.getMyCredits(),
      ]);
      setPlan(subscriptionResponse.data.plan);
      setSubscription(subscriptionResponse.data.subscription);
      setBalance(creditsResponse.data.balance);
      setRecentTransactions(creditsResponse.data.recentTransactions);
    } catch (err: any) {
      setError(err.message || 'Failed to load your account');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccount();
  }, [fetchAccount]);

  if (loading) {
    return (
      <AuthenticatedLayout>
        <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 64px)' }}>
          <div className="text-center">
            <Loader2 className="w-9 h-9 text-primary-600 animate-spin mx-auto mb-4" />
            <p className="text-mentor-text-secondary text-sm font-medium">Loading your account...</p>
          </div>
        </div>
      </AuthenticatedLayout>
    );
  }

  if (error || !plan || !subscription) {
    return (
      <AuthenticatedLayout>
        <div className="flex items-center justify-center p-4" style={{ minHeight: 'calc(100vh - 64px)' }}>
          <div className="card max-w-md w-full text-center">
            <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
            <h2 className="section-title text-lg mb-2">Couldn't load your account</h2>
            <p className="text-sm text-mentor-text-secondary mb-6">{error || 'Something went wrong'}</p>
            <button onClick={fetchAccount} className="btn btn-primary">
              Try Again
            </button>
          </div>
        </div>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        <div className="page-header">
          <h1 className="page-title">Account &amp; Credits</h1>
          <p className="page-subtitle">Your plan, subscription status, and interview credit balance.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* Plan + subscription */}
          <div className="card lg:col-span-2">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="section-title mb-1">{plan.name} Plan</h2>
                <p className="text-sm text-mentor-text-secondary">{plan.description}</p>
              </div>
              <span className={`badge ${getStatusBadgeClass(subscription.status)} shrink-0 capitalize`}>
                {subscription.status}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-mentor-border">
              <div className="flex items-start gap-2.5">
                <CalendarClock size={18} className="text-mentor-text-muted mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-mentor-text-muted mb-0.5">Current period ends</p>
                  <p className="text-sm font-medium text-mentor-text">{formatDate(subscription.currentPeriodEnd)}</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <History size={18} className="text-mentor-text-muted mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-mentor-text-muted mb-0.5">Started</p>
                  <p className="text-sm font-medium text-mentor-text">{formatDate(subscription.startedAt)}</p>
                </div>
              </div>
            </div>

            {subscription.cancelAtPeriodEnd && (
              <div className="mt-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <AlertCircle size={16} className="text-mentor-warning mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800">
                  Your plan will not renew after the current period ends on {formatDate(subscription.currentPeriodEnd)}.
                </p>
              </div>
            )}

            <button onClick={() => navigate('/pricing')} className="btn btn-secondary mt-5">
              View Plans
            </button>
          </div>

          {/* Credit balance */}
          <div className="card bg-mentor-mint dark:bg-future-card lg:col-span-1 flex flex-col">
            <div className="w-10 h-10 rounded-lg bg-white dark:bg-future-elevated flex items-center justify-center mb-4">
              <Wallet size={20} className="text-primary-600 dark:text-future-violet" />
            </div>
            <p className="text-xs text-mentor-text-muted mb-1">Remaining Credits</p>
            <p className="text-4xl font-bold text-mentor-text mb-1">{balance ?? 0}</p>
            <p className="text-sm text-mentor-text-secondary flex-1">
              {plan.includedInterviews} interview credit{plan.includedInterviews === 1 ? '' : 's'} included with your plan.
            </p>
          </div>
        </div>

        {/* Recent transactions */}
        <div className="card p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-mentor-border flex items-center justify-between">
            <h2 className="section-title">Recent Credit Activity</h2>
            <button
              onClick={() => navigate('/account/credits')}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              View Credit History
            </button>
          </div>

          {recentTransactions.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm text-mentor-text-secondary">No credit activity yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-mentor-border">
              {recentTransactions.map((transaction, index) => (
                <TransactionRow key={`${transaction.createdAt}-${index}`} transaction={transaction} />
              ))}
            </div>
          )}
        </div>
      </main>
    </AuthenticatedLayout>
  );
};

export default AccountPage;
