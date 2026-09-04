import React, { useCallback, useEffect, useState } from 'react';
import AuthenticatedLayout from '../components/AuthenticatedLayout';
import subscriptionApi, { SubscriptionPlan } from '../api/subscriptionApi';
import { Check, Sparkles, Crown, Zap, ShieldCheck, AlertCircle, Loader2, type LucideIcon } from 'lucide-react';

// One icon per plan code, purely presentational — falls back to ShieldCheck
// for any plan code this list doesn't recognize yet, so a new backend plan
// never breaks rendering.
const PLAN_ICONS: Record<string, LucideIcon> = {
  FREE: Zap,
  BASIC: Zap,
  PRO: Sparkles,
  PREMIUM: Crown,
};

const formatPrice = (plan: SubscriptionPlan): { amount: string; suffix: string } => {
  if (plan.priceInr === 0) {
    return { amount: 'Free', suffix: '' };
  }
  const amount = `₹${plan.priceInr.toLocaleString('en-IN')}`;
  const suffix = plan.billingInterval === 'month' ? ' / month' : '';
  return { amount, suffix };
};

const PricingPage: React.FC = () => {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [currentPlanCode, setCurrentPlanCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [plansResponse, subscriptionResponse] = await Promise.all([
        subscriptionApi.getPlans(),
        // Current plan is a nice-to-have indicator, not required to show
        // pricing — if it fails, the plans themselves should still render.
        subscriptionApi.getMySubscription().catch(() => null),
      ]);
      setPlans(plansResponse.data);
      setCurrentPlanCode(subscriptionResponse?.data.plan.code ?? null);
    } catch (err: any) {
      setError(err.message || 'Failed to load subscription plans');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <AuthenticatedLayout>
      <div className="page-container py-8">
        <div className="page-header">
          <h1 className="page-title">Choose the plan that fits your preparation goals</h1>
          <p className="page-subtitle">
            Practice consistently, get actionable feedback, and improve with every interview.
          </p>
        </div>

        {loading ? (
          <div className="card p-16 text-center">
            <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
            <p className="text-mentor-text-muted text-sm">Loading plans...</p>
          </div>
        ) : error ? (
          <div className="card p-16 text-center">
            <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
            <h3 className="section-title mb-1.5">Couldn't load plans</h3>
            <p className="text-sm text-mentor-text-secondary mb-5">{error}</p>
            <button onClick={fetchData} className="btn btn-primary">
              Try Again
            </button>
          </div>
        ) : plans.length === 0 ? (
          <div className="card p-16 text-center">
            <p className="text-sm text-mentor-text-secondary">No plans are available right now.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {plans.map((plan) => {
              const Icon = PLAN_ICONS[plan.code] || ShieldCheck;
              const isCurrentPlan = plan.code === currentPlanCode;
              const { amount, suffix } = formatPrice(plan);

              return (
                <div
                  key={plan.code}
                  className={`relative card flex flex-col ${
                    isCurrentPlan
                      ? 'border-primary-600 bg-mentor-soft dark:border-future-violet dark:bg-future-card dark:shadow-future-glow'
                      : ''
                  }`}
                >
                  {isCurrentPlan && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 badge badge-info">Current Plan</span>
                  )}

                  <div className="w-11 h-11 rounded-lg bg-white dark:bg-future-elevated flex items-center justify-center mb-4 shadow-soft dark:shadow-none">
                    <Icon size={20} className="text-primary-600 dark:text-future-violet" />
                  </div>

                  <h3 className="text-lg font-semibold text-mentor-text mb-1">{plan.name}</h3>
                  <p className="text-sm text-mentor-text-secondary mb-4">{plan.description}</p>

                  <div className="mb-5">
                    <span className="text-2xl font-bold text-mentor-text">{amount}</span>
                    <span className="text-sm text-mentor-text-muted">{suffix}</span>
                    <p className="text-xs text-mentor-text-muted mt-0.5">
                      {plan.includedInterviews} interview credit{plan.includedInterviews === 1 ? '' : 's'} included
                    </p>
                  </div>

                  <ul className="space-y-2 mb-6 flex-1">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm text-mentor-text-secondary">
                        <Check size={16} className="text-mentor-success mt-0.5 shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    disabled
                    aria-disabled="true"
                    className="btn btn-secondary w-full justify-center opacity-60 cursor-not-allowed"
                  >
                    {isCurrentPlan ? 'Current Plan' : 'Upgrade Coming Soon'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-center text-xs text-mentor-text-muted mt-8">
          Payments are not yet available — plan upgrades will be enabled in a future update.
        </p>
      </div>
    </AuthenticatedLayout>
  );
};

export default PricingPage;
