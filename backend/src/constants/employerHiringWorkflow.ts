import { EmployerJobApplicationStatus } from './employerJobApplication';

/**
 * `move_pipeline_stage` workflow actions may target ONLY these NON-TERMINAL
 * operational stages (31C section 16) — hired/rejected/withdrawn/archived
 * (every terminal/decision-like state) are explicitly excluded so a
 * workflow rule can never automate a hiring decision.
 */
export const ALLOWED_WORKFLOW_PIPELINE_STATUSES: EmployerJobApplicationStatus[] = [
  EmployerJobApplicationStatus.APPLIED,
  EmployerJobApplicationStatus.SCREENING,
  EmployerJobApplicationStatus.SHORTLISTED,
  EmployerJobApplicationStatus.INTERVIEW,
  EmployerJobApplicationStatus.OFFER,
];
