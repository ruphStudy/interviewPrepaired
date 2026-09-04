/** Job posting lifecycle status (16B). */
export enum EmployerJobStatus {
  DRAFT = 'draft',
  OPEN = 'open',
  PAUSED = 'paused',
  CLOSED = 'closed',
  ARCHIVED = 'archived',
}

export enum EmployerJobWorkplaceType {
  ONSITE = 'onsite',
  HYBRID = 'hybrid',
  REMOTE = 'remote',
}

export enum EmployerJobEmploymentType {
  FULL_TIME = 'full_time',
  PART_TIME = 'part_time',
  CONTRACT = 'contract',
  INTERNSHIP = 'internship',
  TEMPORARY = 'temporary',
  OTHER = 'other',
}

/**
 * Explicit allow-list of valid next statuses — the ONLY place job status
 * transitions are defined. `archived` is a terminal state with no outgoing
 * transitions. Enforced by EmployerJobService.updateJobStatus(); never
 * changeable through the generic create/update endpoints.
 */
export const EMPLOYER_JOB_STATUS_TRANSITIONS: Record<EmployerJobStatus, EmployerJobStatus[]> = {
  [EmployerJobStatus.DRAFT]: [EmployerJobStatus.OPEN, EmployerJobStatus.ARCHIVED],
  [EmployerJobStatus.OPEN]: [EmployerJobStatus.PAUSED, EmployerJobStatus.CLOSED, EmployerJobStatus.ARCHIVED],
  [EmployerJobStatus.PAUSED]: [EmployerJobStatus.OPEN, EmployerJobStatus.CLOSED, EmployerJobStatus.ARCHIVED],
  [EmployerJobStatus.CLOSED]: [EmployerJobStatus.ARCHIVED],
  [EmployerJobStatus.ARCHIVED]: [],
};
