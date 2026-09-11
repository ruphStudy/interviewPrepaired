/**
 * Receipt display configuration (PR-BILL-7). No GST/tax registration is
 * configured for this product yet, so every receipt is explicitly labelled
 * a "Payment Receipt" — never a "Tax Invoice" — and never fabricates
 * GSTIN/tax-breakup/HSN-SAC fields. Swap these constants (and add the tax
 * fields once genuinely registered) when proper tax invoicing is added.
 */
export const BILLING_MERCHANT_DISPLAY_NAME = 'EnterSkill';
export const BILLING_RECEIPT_DOCUMENT_LABEL = 'Payment Receipt';
export const BILLING_GST_CONFIGURED = false;
