/** How a candidate entered the system (18A) — no resume upload/parsing exists yet, so every source here is manual-entry metadata. */
export enum EmployerCandidateSource {
  MANUAL = 'manual',
  REFERRAL = 'referral',
  CAREERS = 'careers',
  AGENCY = 'agency',
  JOB_PORTAL = 'job_portal',
  IMPORT = 'import',
  OTHER = 'other',
}

/** Candidate lifecycle status. */
export enum EmployerCandidateStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ARCHIVED = 'archived',
}

/**
 * Explicit allow-list of valid next statuses — the ONLY place candidate
 * status transitions are defined. Enforced by EmployerCandidateService's
 * dedicated status endpoint; never changeable through the generic
 * create/update endpoints.
 */
export const EMPLOYER_CANDIDATE_STATUS_TRANSITIONS: Record<EmployerCandidateStatus, EmployerCandidateStatus[]> = {
  [EmployerCandidateStatus.ACTIVE]: [EmployerCandidateStatus.INACTIVE, EmployerCandidateStatus.ARCHIVED],
  [EmployerCandidateStatus.INACTIVE]: [EmployerCandidateStatus.ACTIVE, EmployerCandidateStatus.ARCHIVED],
  [EmployerCandidateStatus.ARCHIVED]: [EmployerCandidateStatus.ACTIVE],
};
