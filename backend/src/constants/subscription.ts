/** Stable B2C subscription plan codes — referenced by SubscriptionPlan documents and future user-subscription/credit logic. Never rename once shipped. */
export enum PlanCode {
  FREE = 'FREE',
  BASIC = 'BASIC',
  PRO = 'PRO',
  PREMIUM = 'PREMIUM',
}

export interface DefaultPlanDefinition {
  code: PlanCode;
  name: string;
  description: string;
  priceInrPaise: number;
  billingInterval: 'month' | 'none';
  includedInterviews: number;
  isDefault: boolean;
  sortOrder: number;
  features: string[];
}

/** Current B2C product plans. Amounts are integer paise — never floating-point INR. */
export const DEFAULT_B2C_PLANS: DefaultPlanDefinition[] = [
  {
    code: PlanCode.FREE,
    name: 'Free',
    description: 'Try out AI-powered mock interviews at no cost.',
    priceInrPaise: 0,
    billingInterval: 'none',
    includedInterviews: 1,
    isDefault: true,
    sortOrder: 0,
    features: ['1 mock interview'],
  },
  {
    code: PlanCode.BASIC,
    name: 'Basic',
    description: 'For candidates preparing for a handful of interviews.',
    priceInrPaise: 29900,
    billingInterval: 'month',
    includedInterviews: 4,
    isDefault: false,
    sortOrder: 1,
    features: ['4 mock interviews / month'],
  },
  {
    code: PlanCode.PRO,
    name: 'Pro',
    description: 'For active job seekers who want regular practice.',
    priceInrPaise: 59900,
    billingInterval: 'month',
    includedInterviews: 10,
    isDefault: false,
    sortOrder: 2,
    features: ['10 mock interviews / month'],
  },
  {
    code: PlanCode.PREMIUM,
    name: 'Premium',
    description: 'For serious preparation with maximum practice volume.',
    priceInrPaise: 99900,
    billingInterval: 'month',
    includedInterviews: 25,
    isDefault: false,
    sortOrder: 3,
    features: ['25 mock interviews / month'],
  },
];
