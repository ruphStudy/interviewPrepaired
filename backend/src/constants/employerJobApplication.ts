import { EmployerJobStatus } from './employerJob';

/** How a candidate ended up applied to a job (18D). */
export enum EmployerJobApplicationSource {
  MANUAL = 'manual',
  CAREERS = 'careers',
  REFERRAL = 'referral',
  AGENCY = 'agency',
  JOB_PORTAL = 'job_portal',
  IMPORT = 'import',
  OTHER = 'other',
}

/** Focused hiring-pipeline lifecycle (18D) — no screening scores/ranking, no interview scheduling; those are later sprints. */
export enum EmployerJobApplicationStatus {
  APPLIED = 'applied',
  SCREENING = 'screening',
  SHORTLISTED = 'shortlisted',
  INTERVIEW = 'interview',
  OFFER = 'offer',
  HIRED = 'hired',
  REJECTED = 'rejected',
  WITHDRAWN = 'withdrawn',
  ARCHIVED = 'archived',
}

/**
 * Explicit allow-list of valid next statuses — the ONLY place application
 * status transitions are defined. `archived` is a terminal state with no
 * outgoing transitions; `hired`/`rejected`/`withdrawn` can only move to
 * `archived` — no reopening in 18D. Enforced by
 * EmployerJobApplicationService.updateApplicationStatus(); never changeable
 * through the generic create/update endpoints.
 */
export const EMPLOYER_JOB_APPLICATION_STATUS_TRANSITIONS: Record<EmployerJobApplicationStatus, EmployerJobApplicationStatus[]> = {
  [EmployerJobApplicationStatus.APPLIED]: [
    EmployerJobApplicationStatus.SCREENING,
    EmployerJobApplicationStatus.REJECTED,
    EmployerJobApplicationStatus.WITHDRAWN,
    EmployerJobApplicationStatus.ARCHIVED,
  ],
  [EmployerJobApplicationStatus.SCREENING]: [
    EmployerJobApplicationStatus.SHORTLISTED,
    EmployerJobApplicationStatus.REJECTED,
    EmployerJobApplicationStatus.WITHDRAWN,
    EmployerJobApplicationStatus.ARCHIVED,
  ],
  [EmployerJobApplicationStatus.SHORTLISTED]: [
    EmployerJobApplicationStatus.INTERVIEW,
    EmployerJobApplicationStatus.REJECTED,
    EmployerJobApplicationStatus.WITHDRAWN,
    EmployerJobApplicationStatus.ARCHIVED,
  ],
  [EmployerJobApplicationStatus.INTERVIEW]: [
    EmployerJobApplicationStatus.OFFER,
    EmployerJobApplicationStatus.REJECTED,
    EmployerJobApplicationStatus.WITHDRAWN,
    EmployerJobApplicationStatus.ARCHIVED,
  ],
  [EmployerJobApplicationStatus.OFFER]: [
    EmployerJobApplicationStatus.HIRED,
    EmployerJobApplicationStatus.REJECTED,
    EmployerJobApplicationStatus.WITHDRAWN,
    EmployerJobApplicationStatus.ARCHIVED,
  ],
  [EmployerJobApplicationStatus.HIRED]: [EmployerJobApplicationStatus.ARCHIVED],
  [EmployerJobApplicationStatus.REJECTED]: [EmployerJobApplicationStatus.ARCHIVED],
  [EmployerJobApplicationStatus.WITHDRAWN]: [EmployerJobApplicationStatus.ARCHIVED],
  [EmployerJobApplicationStatus.ARCHIVED]: [],
};

/** Jobs open to NEW applications — draft/paused/open. A closed or archived job rejects a new application with 409 (existing applications remain manageable; see EmployerJobApplicationService). */
export const APPLICATION_ELIGIBLE_JOB_STATUSES: EmployerJobStatus[] = [
  EmployerJobStatus.DRAFT,
  EmployerJobStatus.OPEN,
  EmployerJobStatus.PAUSED,
];
