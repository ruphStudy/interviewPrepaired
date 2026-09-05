/** Collaboration metadata only — never an RBAC permission, never overrides OrganizationPermission checks. */
export enum EmployerJobApplicationCollaborationRole {
  OWNER = 'owner',
  INTERVIEWER = 'interviewer',
  REVIEWER = 'reviewer',
  OBSERVER = 'observer',
}
