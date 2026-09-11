/** Stable B2C interview-credit pack codes — referenced by CreditPack documents and PaymentOrder rows. Never rename once shipped. */
export enum CreditPackCode {
  SINGLE = 'SINGLE',
  SMALL = 'SMALL',
  MEDIUM = 'MEDIUM',
  LARGE = 'LARGE',
}

export interface DefaultCreditPackDefinition {
  code: CreditPackCode;
  name: string;
  description: string;
  credits: number;
  priceInrPaise: number;
  sortOrder: number;
}

/**
 * Starter B2C top-up catalog. Priced at a modest per-credit premium over the
 * cheapest subscription's per-credit cost (a la carte convenience, no
 * monthly commitment) — centralized here so pricing never needs to be
 * duplicated in frontend code. Amounts are integer paise.
 */
export const DEFAULT_CREDIT_PACKS: DefaultCreditPackDefinition[] = [
  {
    code: CreditPackCode.SINGLE,
    name: 'Single Credit',
    description: '1 interview credit — top up as you go.',
    credits: 1,
    priceInrPaise: 9900,
    sortOrder: 0,
  },
  {
    code: CreditPackCode.SMALL,
    name: 'Starter Pack',
    description: '5 interview credits.',
    credits: 5,
    priceInrPaise: 39900,
    sortOrder: 1,
  },
  {
    code: CreditPackCode.MEDIUM,
    name: 'Value Pack',
    description: '10 interview credits.',
    credits: 10,
    priceInrPaise: 69900,
    sortOrder: 2,
  },
  {
    code: CreditPackCode.LARGE,
    name: 'Pro Pack',
    description: '25 interview credits.',
    credits: 25,
    priceInrPaise: 149900,
    sortOrder: 3,
  },
];

/** Stable machine-readable billing error codes surfaced via ApiError's optional `code`. */
export enum BillingErrorCode {
  PAYMENT_PROVIDER_UNAVAILABLE = 'PAYMENT_PROVIDER_UNAVAILABLE',
  INVALID_PLAN = 'INVALID_PLAN',
  INVALID_CREDIT_PACK = 'INVALID_CREDIT_PACK',
  IDEMPOTENCY_KEY_CONFLICT = 'IDEMPOTENCY_KEY_CONFLICT',
  PAYMENT_ORDER_NOT_FOUND = 'PAYMENT_ORDER_NOT_FOUND',
  PAYMENT_ORDER_MISMATCH = 'PAYMENT_ORDER_MISMATCH',
  PAYMENT_SIGNATURE_INVALID = 'PAYMENT_SIGNATURE_INVALID',
  PAYMENT_VERIFICATION_FAILED = 'PAYMENT_VERIFICATION_FAILED',
  PAYMENT_ALREADY_SETTLED = 'PAYMENT_ALREADY_SETTLED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  SUBSCRIPTION_ALREADY_ACTIVE = 'SUBSCRIPTION_ALREADY_ACTIVE',
  REFUND_NOT_ALLOWED = 'REFUND_NOT_ALLOWED',
}
