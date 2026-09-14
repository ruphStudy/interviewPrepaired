import { DataCategory } from './privacyDataClassification';

/**
 * Retention policy foundation (PR-PRIVACY-1). This is a documentation/
 * decision-support config, not an automatic enforcement engine — only the
 * EXPORT-artifact cleanup sweep (PrivacyExportService) actually auto-acts
 * on a `RETAIN_DAYS` value below. Everything else is read by
 * deletion/export services to decide whether a given category can be
 * deleted/anonymized now or must be flagged for legal review.
 */
export enum RetentionStrategy {
  /** No independent retention — retained only while the owning record/account is active. */
  ACTIVE_ONLY = 'active_only',
  /** Deleted immediately as part of the owning deletion flow (e.g. a user's own practice interviews). */
  DELETE_IMMEDIATELY = 'delete_immediately',
  /** Identifying fields cleared/replaced in place; the row itself is kept. */
  ANONYMIZE = 'anonymize',
  /** Kept for a bounded number of days, then swept/deleted by an owned cleanup job. */
  RETAIN_DAYS = 'retain_days',
  /** Never auto-deleted/anonymized by this codebase — a real retention period must come from product/legal. */
  LEGAL_REVIEW_REQUIRED = 'legal_review_required',
  /** Explicitly placed on hold (e.g. active dispute/investigation) — deletion is refused until manually cleared. */
  MANUAL_LEGAL_HOLD = 'manual_legal_hold',
}

export interface RetentionPolicyEntry {
  strategy: RetentionStrategy;
  retentionDays?: number;
  notes?: string;
}

/**
 * Keyed by DataCategory. `BILLING`/`AUDIT` and anything hiring/contract-
 * related are deliberately LEGAL_REVIEW_REQUIRED — no day count is
 * fabricated for these; a real number must come from product/legal review
 * (accounting/GST/labor-law retention rules are jurisdiction-specific and
 * outside this codebase's authority to invent).
 */
export const RETENTION_POLICY_BY_CATEGORY: Record<DataCategory, RetentionPolicyEntry> = {
  [DataCategory.ACCOUNT_IDENTITY]: { strategy: RetentionStrategy.ANONYMIZE, notes: 'Account deletion anonymizes name/email in place rather than hard-deleting the row.' },
  [DataCategory.AUTHENTICATION]: { strategy: RetentionStrategy.DELETE_IMMEDIATELY, notes: 'Sessions are revoked immediately on account deletion; security events are short-lived operational data.' },
  [DataCategory.INTERVIEW_CONTENT]: { strategy: RetentionStrategy.DELETE_IMMEDIATELY, notes: 'B2C practice interviews only — personal content with no financial/audit purpose.' },
  [DataCategory.ASSESSMENT_RESULT]: { strategy: RetentionStrategy.LEGAL_REVIEW_REQUIRED, notes: 'Employer hiring-assessment results are the organization\'s own business record, not the candidate\'s to unilaterally erase.' },
  [DataCategory.CANDIDATE_PROFILE]: { strategy: RetentionStrategy.ANONYMIZE, notes: 'Candidate privacy deletion anonymizes identifying fields in place; hiring records referencing the candidate remain intact.' },
  [DataCategory.RESUME]: { strategy: RetentionStrategy.DELETE_IMMEDIATELY, notes: 'Resume file(s) are deleted on candidate privacy deletion.' },
  [DataCategory.ORGANIZATION_MEMBERSHIP]: { strategy: RetentionStrategy.ACTIVE_ONLY },
  [DataCategory.COMMUNICATION]: { strategy: RetentionStrategy.LEGAL_REVIEW_REQUIRED, notes: 'Delivery/suppression history has operational value (deliverability/compliance); no confirmed retention period exists yet.' },
  [DataCategory.BILLING]: { strategy: RetentionStrategy.LEGAL_REVIEW_REQUIRED, notes: 'Financial/GST/accounting retention rules are jurisdiction-specific — never invented here. Never hard-deleted by any flow in this codebase.' },
  [DataCategory.AUDIT]: { strategy: RetentionStrategy.LEGAL_REVIEW_REQUIRED, notes: 'Audit/operational-job history is never auto-deleted.' },
  [DataCategory.FILE]: { strategy: RetentionStrategy.RETAIN_DAYS, retentionDays: undefined, notes: 'See PRIVACY_EXPORT_RETENTION_HOURS (env, default 48h) for the concrete export-artifact TTL — expressed in hours, not days, because the window is short.' },
  [DataCategory.ANALYTICS]: { strategy: RetentionStrategy.ACTIVE_ONLY, notes: 'No standalone analytics store exists yet in this codebase.' },
};

/** Default export-artifact retention if PRIVACY_EXPORT_RETENTION_HOURS is unset — matches PrivacyExportService/env.privacyExportRetentionHours. */
export const PRIVACY_EXPORT_RETENTION_HOURS_DEFAULT = 48;
