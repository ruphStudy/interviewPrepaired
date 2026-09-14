/**
 * Data classification foundation (PR-PRIVACY-1). Documentation-grade
 * metadata used by the retention policy (retentionPolicy.ts) and by audit
 * code — NOT a runtime gate re-checked on every query. Only the models
 * actually touched by the privacy-hardening work are classified here; this
 * is deliberately not an exhaustive catalog of every model in the codebase.
 */
export enum DataCategory {
  ACCOUNT_IDENTITY = 'account_identity',
  AUTHENTICATION = 'authentication',
  INTERVIEW_CONTENT = 'interview_content',
  ASSESSMENT_RESULT = 'assessment_result',
  CANDIDATE_PROFILE = 'candidate_profile',
  RESUME = 'resume',
  ORGANIZATION_MEMBERSHIP = 'organization_membership',
  COMMUNICATION = 'communication',
  BILLING = 'billing',
  AUDIT = 'audit',
  FILE = 'file',
  ANALYTICS = 'analytics',
}

export enum DataSensitivity {
  NORMAL = 'normal',
  PERSONAL = 'personal',
  SENSITIVE = 'sensitive',
  FINANCIAL = 'financial',
  SECURITY = 'security',
}

export interface DataClassificationEntry {
  model: string;
  category: DataCategory;
  sensitivity: DataSensitivity;
  notes?: string;
}

/**
 * Lookup table keyed by the actual Mongoose model name (as passed to
 * `mongoose.model(...)`) — only the models this task's deletion/export
 * flows actually read or write.
 */
export const DATA_CLASSIFICATION: readonly DataClassificationEntry[] = [
  { model: 'User', category: DataCategory.ACCOUNT_IDENTITY, sensitivity: DataSensitivity.PERSONAL },
  { model: 'AuthSession', category: DataCategory.AUTHENTICATION, sensitivity: DataSensitivity.SECURITY },
  { model: 'AuthSecurityEvent', category: DataCategory.AUTHENTICATION, sensitivity: DataSensitivity.SECURITY },
  { model: 'UserConsent', category: DataCategory.ACCOUNT_IDENTITY, sensitivity: DataSensitivity.PERSONAL },
  {
    model: 'Interview',
    category: DataCategory.INTERVIEW_CONTENT,
    sensitivity: DataSensitivity.PERSONAL,
    notes: 'The evaluation/rubric portion is ASSESSMENT_RESULT-shaped but stored on the same document — classified together, no separate model exists.',
  },
  { model: 'EmployerCandidate', category: DataCategory.CANDIDATE_PROFILE, sensitivity: DataSensitivity.PERSONAL },
  { model: 'EmployerCandidateResumeSource', category: DataCategory.RESUME, sensitivity: DataSensitivity.PERSONAL },
  { model: 'OrganizationMember', category: DataCategory.ORGANIZATION_MEMBERSHIP, sensitivity: DataSensitivity.NORMAL },
  { model: 'EmailDelivery', category: DataCategory.COMMUNICATION, sensitivity: DataSensitivity.PERSONAL },
  { model: 'EmailSuppression', category: DataCategory.COMMUNICATION, sensitivity: DataSensitivity.PERSONAL },
  { model: 'PaymentOrder', category: DataCategory.BILLING, sensitivity: DataSensitivity.FINANCIAL },
  { model: 'UserSubscription', category: DataCategory.BILLING, sensitivity: DataSensitivity.FINANCIAL },
  { model: 'PrivacyActionAudit', category: DataCategory.AUDIT, sensitivity: DataSensitivity.SECURITY },
  { model: 'PrivacyExportRequest', category: DataCategory.FILE, sensitivity: DataSensitivity.PERSONAL },
  { model: 'OperationalJob', category: DataCategory.AUDIT, sensitivity: DataSensitivity.NORMAL },
];
