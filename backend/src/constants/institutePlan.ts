/**
 * Institute interview-credit plan catalog (15E) — MVP foundation only.
 * Mirrors DEFAULT_B2C_PLANS's shape for style/reference, but is entirely
 * separate: institute plans price in whole INR (not paise) and grant a
 * fixed pool of interview credits rather than a recurring monthly
 * allowance. No payment gateway/subscription billing is wired up yet —
 * these are just the catalog definitions consumed by the (currently
 * admin/owner-triggered, foundation-only) grant endpoint.
 */
export enum InstitutePlanCode {
  STARTER = 'STARTER',
  GROWTH = 'GROWTH',
  PRO = 'PRO',
  ENTERPRISE = 'ENTERPRISE',
}

export interface InstitutePlanDefinition {
  code: InstitutePlanCode;
  name: string;
  description: string;
  /** Whole INR, not paise. Null for ENTERPRISE — priced by custom negotiation. */
  priceINR: number | null;
  /** true only for ENTERPRISE — signals price/credits are negotiated, never auto-granted. */
  customPrice: boolean;
  /** Interview credits granted by this plan. Null for ENTERPRISE — volume is custom, never auto-granted. */
  interviewCredits: number | null;
  sortOrder: number;
  features: string[];
}

export const INSTITUTE_PLANS: InstitutePlanDefinition[] = [
  {
    code: InstitutePlanCode.STARTER,
    name: 'Starter',
    description: 'For a single institute or small batch getting started with AI mock interviews.',
    priceINR: 2999,
    customPrice: false,
    interviewCredits: 100,
    sortOrder: 0,
    features: ['100 interview credits'],
  },
  {
    code: InstitutePlanCode.GROWTH,
    name: 'Growth',
    description: 'For an institute running mock interviews across multiple batches.',
    priceINR: 6999,
    customPrice: false,
    interviewCredits: 300,
    sortOrder: 1,
    features: ['300 interview credits'],
  },
  {
    code: InstitutePlanCode.PRO,
    name: 'Pro',
    description: 'For an institute placing a large volume of students each cycle.',
    priceINR: 14999,
    customPrice: false,
    interviewCredits: 750,
    sortOrder: 2,
    features: ['750 interview credits'],
  },
  {
    code: InstitutePlanCode.ENTERPRISE,
    name: 'Enterprise',
    description: 'Custom volume and pricing for large institutes and placement networks.',
    priceINR: null,
    customPrice: true,
    interviewCredits: null,
    sortOrder: 3,
    features: ['Custom interview credit volume', 'Custom pricing — contact sales'],
  },
];

export function getInstitutePlan(code: string): InstitutePlanDefinition | undefined {
  return INSTITUTE_PLANS.find((plan) => plan.code === code);
}
