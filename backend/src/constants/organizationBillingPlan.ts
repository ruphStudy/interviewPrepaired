import { INSTITUTE_PLANS, InstitutePlanCode } from './institutePlan';

/**
 * Unified B2B plan catalog shape (PR-B2B-BILL-1). Both institute (prepaid
 * credit) and company (seat/feature subscription) plans are exposed through
 * this SAME shape so a single billing UI/endpoint can list either without
 * bespoke per-org-type mapping. Institute plans are NEVER duplicated data —
 * `getInstituteBillingPlans()` computes this shape from the existing
 * `INSTITUTE_PLANS` catalog (constants/institutePlan.ts) on every call.
 */
export interface OrganizationBillingPlanDefinition {
  code: string;
  organizationType: 'institute' | 'company';
  name: string;
  description?: string;
  billingModel: 'prepaid_credits' | 'monthly_subscription' | 'annual_contract' | 'custom';
  /** Integer paise. Null only for a custom/negotiated (ENTERPRISE) plan. */
  priceInrPaise: number | null;
  /** Institute-only. Null/undefined for company plans (seat/feature based, not credit based). */
  interviewCredits?: number | null;
  /** Deliberately never set to an invented number for company plans — undefined means "not limited by this catalog". */
  candidateLimit?: number | null;
  jobLimit?: number | null;
  memberLimit?: number | null;
  /** Informational only — never hard-enforced anywhere in this PR. */
  features: string[];
  active: boolean;
  /** true only for a plan whose price/volume is negotiated (ENTERPRISE) — always excluded from self-service checkout. */
  customPrice: boolean;
  sortOrder: number;
}

/** Stable company plan codes — referenced by OrganizationSubscription rows and PaymentOrder rows. Never rename once shipped. */
export enum CompanyPlanCode {
  COMPANY_STARTER = 'COMPANY_STARTER',
  COMPANY_GROWTH = 'COMPANY_GROWTH',
  COMPANY_PRO = 'COMPANY_PRO',
  COMPANY_ENTERPRISE = 'COMPANY_ENTERPRISE',
}

/**
 * Company (employer) subscription catalog — MVP foundation. Illustrative
 * round INR pricing, feature/seat-based (NOT credit-based — company plans do
 * not grant interview credits in this PR). Deliberately does NOT set
 * candidateLimit/jobLimit/memberLimit to any invented number — this product
 * has no defined real-world limits yet, and the master spec forbids
 * fabricating them.
 */
export const COMPANY_PLANS: OrganizationBillingPlanDefinition[] = [
  {
    code: CompanyPlanCode.COMPANY_STARTER,
    organizationType: 'company',
    name: 'Starter',
    description: 'For a small hiring team getting started with AI-assisted interviews.',
    billingModel: 'monthly_subscription',
    priceInrPaise: 499900,
    features: ['job_management', 'candidate_management', 'interview_creation'],
    active: true,
    customPrice: false,
    sortOrder: 0,
  },
  {
    code: CompanyPlanCode.COMPANY_GROWTH,
    organizationType: 'company',
    name: 'Growth',
    description: 'For a growing hiring team collaborating across multiple roles.',
    billingModel: 'monthly_subscription',
    priceInrPaise: 999900,
    features: ['job_management', 'candidate_management', 'interview_creation', 'team_members', 'analytics'],
    active: true,
    customPrice: false,
    sortOrder: 1,
  },
  {
    code: CompanyPlanCode.COMPANY_PRO,
    organizationType: 'company',
    name: 'Pro',
    description: 'For a high-volume hiring organization needing deeper insight.',
    billingModel: 'monthly_subscription',
    priceInrPaise: 1999900,
    features: [
      'job_management',
      'candidate_management',
      'interview_creation',
      'team_members',
      'analytics',
      'advanced_reporting',
      'integrations',
    ],
    active: true,
    customPrice: false,
    sortOrder: 2,
  },
  {
    code: CompanyPlanCode.COMPANY_ENTERPRISE,
    organizationType: 'company',
    name: 'Enterprise',
    description: 'Custom seats, features and pricing for large hiring organizations.',
    billingModel: 'custom',
    priceInrPaise: null,
    features: [
      'job_management',
      'candidate_management',
      'interview_creation',
      'team_members',
      'analytics',
      'advanced_reporting',
      'integrations',
      'contact_sales',
    ],
    active: true,
    customPrice: true,
    sortOrder: 3,
  },
];

export function getCompanyPlan(code: string): OrganizationBillingPlanDefinition | undefined {
  return COMPANY_PLANS.find((plan) => plan.code === code);
}

/**
 * Maps the existing `INSTITUTE_PLANS` catalog into this shared shape,
 * computed on the fly — never a second copy of the data. `priceINR` (whole
 * INR) is converted to integer paise here; ENTERPRISE keeps
 * `priceInrPaise: null` since it has no priceINR to convert.
 */
export function getInstituteBillingPlans(): OrganizationBillingPlanDefinition[] {
  return INSTITUTE_PLANS.map((plan) => ({
    code: plan.code,
    organizationType: 'institute' as const,
    name: plan.name,
    description: plan.description,
    billingModel: 'prepaid_credits' as const,
    priceInrPaise: plan.priceINR === null ? null : plan.priceINR * 100,
    interviewCredits: plan.interviewCredits,
    features: plan.features,
    active: true,
    customPrice: plan.customPrice,
    sortOrder: plan.sortOrder,
  }));
}

export function getInstituteBillingPlan(code: string): OrganizationBillingPlanDefinition | undefined {
  return getInstituteBillingPlans().find((plan) => plan.code === code);
}

/** Combined catalog — used by a single "list all plans" endpoint/UI. */
export function getAllOrgBillingPlans(): OrganizationBillingPlanDefinition[] {
  return [...getInstituteBillingPlans(), ...COMPANY_PLANS];
}

export { InstitutePlanCode };
