import React from 'react';
import { useNavigate } from 'react-router-dom';
import AuthenticatedLayout from '../components/AuthenticatedLayout';
import { Check, Sparkles, Crown, Zap, type LucideIcon } from 'lucide-react';

// Billing is not wired up yet — no backend plan/checkout exists. These are
// presentation-only placeholders so the page can later be swapped for real
// backend/config-driven pricing without a page redesign.
interface PricingPlan {
  name: string;
  description: string;
  icon: LucideIcon;
  features: string[];
  cta: string;
  highlighted?: boolean;
}

const PLANS: PricingPlan[] = [
  {
    name: 'Starter',
    description: 'Basic interview practice to get comfortable with the format.',
    icon: Zap,
    features: ['AI-generated mock interviews', 'Voice-based practice sessions', 'Performance report after each session'],
    cta: 'Get Started',
  },
  {
    name: 'Pro',
    description: 'More practice sessions plus deeper, detailed feedback.',
    icon: Sparkles,
    features: ['Everything in Starter', 'Dimension-by-dimension reports', 'Practice from your own question sets'],
    cta: 'Coming Soon',
    highlighted: true,
  },
  {
    name: 'Premium',
    description: 'For candidates who want more in-depth preparation.',
    icon: Crown,
    features: ['Everything in Pro', 'Priority AI evaluation', 'Advanced progress analytics'],
    cta: 'Coming Soon',
  },
];

const PricingPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <AuthenticatedLayout>
      <div className="page-container py-8">
        <div className="page-header">
          <h1 className="page-title">Choose the plan that fits your preparation goals</h1>
          <p className="page-subtitle">
            Practice consistently, get actionable feedback, and improve with every interview.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {PLANS.map((plan) => {
            const Icon = plan.icon;
            const isFunctional = plan.name === 'Starter';
            return (
              <div
                key={plan.name}
                className={`relative card flex flex-col ${
                  plan.highlighted
                    ? 'border-primary-600 bg-mentor-soft dark:border-future-violet dark:bg-future-card dark:shadow-future-glow'
                    : ''
                }`}
              >
                {plan.highlighted && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 badge badge-info">Most Popular</span>
                )}

                <div className="w-11 h-11 rounded-lg bg-white dark:bg-future-elevated flex items-center justify-center mb-4 shadow-soft dark:shadow-none">
                  <Icon size={20} className="text-primary-600 dark:text-future-violet" />
                </div>

                <h3 className="text-lg font-semibold text-mentor-text mb-1">{plan.name}</h3>
                <p className="text-sm text-mentor-text-secondary mb-4">{plan.description}</p>

                <div className="mb-5">
                  <span className="text-2xl font-bold text-mentor-text">₹—</span>
                  <span className="text-sm text-mentor-text-muted"> / month</span>
                  <p className="text-xs text-mentor-text-muted mt-0.5">Pricing coming soon</p>
                </div>

                <ul className="space-y-2 mb-6 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-mentor-text-secondary">
                      <Check size={16} className="text-mentor-success mt-0.5 shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                {isFunctional ? (
                  <button onClick={() => navigate('/setup')} className="btn btn-primary w-full justify-center">
                    {plan.cta}
                  </button>
                ) : (
                  <button
                    disabled
                    aria-disabled="true"
                    className="btn btn-secondary w-full justify-center opacity-60 cursor-not-allowed"
                  >
                    {plan.cta}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs text-mentor-text-muted mt-8">
          Pricing and billing are not yet available. Everyone currently has full access to practice interviews.
        </p>
      </div>
    </AuthenticatedLayout>
  );
};

export default PricingPage;
