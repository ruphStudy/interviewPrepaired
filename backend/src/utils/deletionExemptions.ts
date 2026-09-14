/**
 * Small, pure helper (PR-PRIVACY-1) — turns a handful of booleans the
 * caller already knows into a bounded list of exemption reason strings for
 * `PrivacyActionAudit.retainedCategories`. Deliberately NOT a rules
 * engine — just a couple of checks so a partial/blocked deletion always
 * records WHY something was retained instead of silently skipping it.
 */
export interface DeletionExemptionContext {
  /** The subject has at least one PaymentOrder that isn't fully refunded/void. */
  hasNonRefundedFinancialRecords?: boolean;
  /** An audit/compliance record exists that this codebase never hard-deletes. */
  hasAuditRecords?: boolean;
  /** An active OrganizationContract (or equivalent) references this subject/organization. */
  hasActiveContract?: boolean;
  /** An explicit manual legal hold has been placed on this subject. */
  hasLegalHold?: boolean;
}

export type DeletionExemptionReason = 'financial_record' | 'audit_record' | 'active_contract' | 'legal_hold';

export function getDeletionExemptions(context: DeletionExemptionContext): DeletionExemptionReason[] {
  const reasons: DeletionExemptionReason[] = [];
  if (context.hasNonRefundedFinancialRecords) reasons.push('financial_record');
  if (context.hasAuditRecords) reasons.push('audit_record');
  if (context.hasActiveContract) reasons.push('active_contract');
  if (context.hasLegalHold) reasons.push('legal_hold');
  return reasons;
}
