/** Branch lifecycle status — intentionally minimal, mirrors OrganizationMemberStatus's shape but is its own domain enum (a branch is not a membership). */
export enum InstituteBranchStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}
