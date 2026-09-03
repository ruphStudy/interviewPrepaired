/** Organization-scoped role — separate from the global User.role ('user' | 'admin'). */
export enum OrganizationMemberRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  TRAINER = 'trainer',
  RECRUITER = 'recruiter',
  MEMBER = 'member',
}

/** Intentionally minimal — invited/pending/expired belong to the later invitation lifecycle (Prompt 8E). */
export enum OrganizationMemberStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}
