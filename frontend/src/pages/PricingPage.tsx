import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthenticatedLayout from '../components/AuthenticatedLayout';
import { useAuth } from '../contexts/AuthContext';
import subscriptionApi, { SubscriptionPlan, CurrentSubscription } from '../api/subscriptionApi';
import billingApi, { CreditPack } from '../api/billingApi';
import { openRazorpayCheckout } from '../utils/razorpayCheckout';
import { Check, Sparkles, Crown, Zap, ShieldCheck, AlertCircle, CheckCircle2, Loader2, Coins, type LucideIcon } from 'lucide-react';

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

const formatDate = (value?: string) =>
  value ? new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const PricingPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subscription, setSubscription] = useState<CurrentSubscription | null>(null);
  const [currentPlanCode, setCurrentPlanCode] = useState<string | null>(null);
  const [creditPacks, setCreditPacks] = useState<CreditPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [processingCode, setProcessingCode] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [plansResponse, subscriptionResponse, packsResponse] = await Promise.all([
        subscriptionApi.getPlans(),
        subscriptionApi.getMySubscription(),
        billingApi.getCreditPacks().catch(() => null),
      ]);
      setPlans(plansResponse.data);
      setSubscription(subscriptionResponse.data.subscription);
      setCurrentPlanCode(subscriptionResponse.data.plan.code);
      if (packsResponse) setCreditPacks(packsResponse.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load subscription plans');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const runCheckout = async (
    purchaseType: 'subscription' | 'credit_pack',
    code: string,
    label: string,
    createOrder: () => ReturnType<typeof billingApi.checkoutSubscription>
  ) => {
    setProcessingCode(code);
    setActionError(null);
    setActionSuccess(null);
    try {
      const idempotencyKey = generateIdempotencyKey();
      const checkoutResponse = await createOrder();
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
        description: label,
        prefill: { name: user?.name, email: user?.email },
      });

      if (outcome.status === 'dismissed') {
        // User closed the modal without paying — not a failure, just abandoned.
        return;
      }

      const verifyResponse = await billingApi.verifyPayment({
        paymentOrderId: payload.paymentOrderId,
        razorpay_order_id: outcome.payment.razorpay_order_id,
        razorpay_payment_id: outcome.payment.razorpay_payment_id,
        razorpay_signature: outcome.payment.razorpay_signature,
      });

      if (purchaseType === 'subscription') {
        setActionSuccess(`${verifyResponse.data.plan?.name || 'Plan'} activated successfully.`);
      } else {
        setActionSuccess(`Interview credits added. New balance: ${verifyResponse.data.credits.balance}.`);
      }
      await fetchData();
      // idempotencyKey is deliberately generated fresh per click — never reused across attempts.
      void idempotencyKey;
    } catch (err: any) {
      if (err.code === 'PAYMENT_PROVIDER_UNAVAILABLE') {
        setActionError('Payment setup pending — the payment provider is not yet configured for this environment.');
      } else if (err.code === 'SUBSCRIPTION_ALREADY_ACTIVE') {
        setActionError('You already have this plan active.');
      } else {
        setActionError(err.message || 'Payment could not be completed. Please try again.');
      }
    } finally {
      setProcessingCode(null);
    }
  };

  const handleUpgrade = (planCode: string, planName: string) => {
    runCheckout('subscription', planCode, `Upgrade to ${planName}`, () =>
      billingApi.checkoutSubscription(planCode, generateIdempotencyKey())
    );
  };

  const handleDowngrade = async (planCode: string) => {
    setProcessingCode(planCode);
    setActionError(null);
    setActionSuccess(null);
    try {
      await billingApi.scheduleDowngrade(planCode);
      setActionSuccess('Downgrade scheduled. Your current plan stays active until the end of this billing period.');
      await fetchData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to schedule downgrade');
    } finally {
      setProcessingCode(null);
    }
  };

  const handleCancelScheduledDowngrade = async () => {
    setProcessingCode('cancel-downgrade');
    setActionError(null);
    setActionSuccess(null);
    try {
      await billingApi.cancelScheduledDowngrade();
      setActionSuccess('Scheduled downgrade cancelled.');
      await fetchData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to cancel scheduled downgrade');
    } finally {
      setProcessingCode(null);
    }
  };

  const handleBuyPack = (pack: CreditPack) => {
    runCheckout('credit_pack', pack.code, pack.name, () => billingApi.checkoutCreditPack(pack.code, generateIdempotencyKey()));
  };

  return (
    <AuthenticatedLayout>
      <div className="page-container py-8">
        <div className="page-header">
          <h1 className="page-title">Choose the plan that fits your preparation goals</h1>
          <p className="page-subtitle">
            Practice consistently, get actionable feedback, and improve with every interview.
          </p>
        </div>

        {actionError && (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-mentor-error/30 bg-mentor-error/10 p-4">
            <AlertCircle size={20} className="text-mentor-error mt-0.5 shrink-0" />
            <p className="text-sm text-mentor-error">{actionError}</p>
          </div>
        )}
        {actionSuccess && (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-mentor-success/30 bg-mentor-success/10 p-4">
            <CheckCircle2 size={20} className="text-mentor-success mt-0.5 shrink-0" />
            <p className="text-sm text-mentor-success">{actionSuccess}</p>
          </div>
        )}
        {subscription?.pendingPlanCode && (
          <div className="mb-4 flex items-center justify-between gap-3 flex-wrap rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-800">
              Scheduled change: moving to <strong>{subscription.pendingPlanCode}</strong> on{' '}
              {formatDate(subscription.pendingPlanEffectiveAt)}.
            </p>
            <button
              onClick={handleCancelScheduledDowngrade}
              disabled={processingCode === 'cancel-downgrade'}
              className="btn btn-secondary px-3 py-1.5 text-xs"
            >
              {processingCode === 'cancel-downgrade' ? 'Cancelling...' : 'Cancel Scheduled Change'}
            </button>
          </div>
        )}

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
              const isScheduledTarget = subscription?.pendingPlanCode === plan.code;
              const currentPlanDefinition = plans.find((p) => p.code === currentPlanCode);
              const isDowngrade = !isCurrentPlan && currentPlanDefinition && plan.priceInrPaise < currentPlanDefinition.priceInrPaise;
              const isFree = plan.priceInrPaise === 0;
              const { amount, suffix } = formatPrice(plan);
              const processing = processingCode === plan.code;

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

                  {isCurrentPlan ? (
                    <button disabled className="btn btn-secondary w-full justify-center opacity-60 cursor-not-allowed">
                      Current Plan
                    </button>
                  ) : isScheduledTarget ? (
                    <button disabled className="btn btn-secondary w-full justify-center opacity-70 cursor-not-allowed">
                      Scheduled
                    </button>
                  ) : isFree ? (
                    <button
                      onClick={() => handleDowngrade(plan.code)}
                      disabled={processing || !currentPlanCode}
                      className="btn btn-secondary w-full justify-center"
                    >
                      {processing ? 'Scheduling...' : 'Downgrade to Free'}
                    </button>
                  ) : isDowngrade ? (
                    <button onClick={() => handleDowngrade(plan.code)} disabled={processing} className="btn btn-secondary w-full justify-center">
                      {processing ? 'Scheduling...' : `Downgrade to ${plan.name}`}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleUpgrade(plan.code, plan.name)}
                      disabled={processing}
                      className="btn btn-primary w-full justify-center"
                    >
                      {processing ? 'Processing...' : `Upgrade to ${plan.name}`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {creditPacks.length > 0 && (
          <div className="mt-12">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-mentor-text flex items-center gap-2">
                <Coins size={20} className="text-primary-600" />
                Buy Interview Credits
              </h2>
              <p className="text-sm text-mentor-text-secondary mt-1">
                A one-time top-up — no subscription required. Purchased credits never expire and are never removed by a
                plan change.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {creditPacks.map((pack) => {
                const processing = processingCode === pack.code;
                return (
                  <div key={pack.code} className="card flex flex-col">
                    <h3 className="text-base font-semibold text-mentor-text mb-1">{pack.name}</h3>
                    <p className="text-xs text-mentor-text-secondary mb-3">{pack.description}</p>
                    <p className="text-2xl font-bold text-mentor-text mb-1">₹{pack.priceInr.toLocaleString('en-IN')}</p>
                    <p className="text-xs text-mentor-text-muted mb-4">
                      {pack.credits} interview credit{pack.credits === 1 ? '' : 's'}
                    </p>
                    <button onClick={() => handleBuyPack(pack)} disabled={processing} className="btn btn-primary w-full justify-center mt-auto">
                      {processing ? 'Processing...' : 'Buy Now'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-mentor-text-muted mt-8">
          Payments are processed securely via Razorpay. Amounts and included credits are always determined by our
          servers.
        </p>
        <p className="text-center text-xs text-mentor-text-muted mt-2">
          <button onClick={() => navigate('/billing/history')} className="text-primary-600 hover:underline">
            View billing history
          </button>
        </p>
      </div>
    </AuthenticatedLayout>
  );
};

export default PricingPage;
