/**
 * Job-local hiring-team roles (16D). Deliberately separate from
 * OrganizationMemberRole — a hiring-team assignment is metadata about who
 * is involved with ONE job, never a change to the member's org-wide role.
 * An OWNER/ADMIN/etc. may hold any of these independently of their
 * organization role.
 */
export enum EmployerJobHiringTeamRole {
  HIRING_MANAGER = 'hiring_manager',
  RECRUITER = 'recruiter',
  INTERVIEWER = 'interviewer',
  VIEWER = 'viewer',
}
