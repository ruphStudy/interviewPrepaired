/** Organization lifecycle status — generic, not tied to any specific organization type. */
export enum OrganizationStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  ARCHIVED = 'archived',
}

/** Every organization must be exactly one of these — chosen intentionally at creation, no default. */
export enum OrganizationType {
  INSTITUTE = 'institute',
  COMPANY = 'company',
}

export enum InstituteKind {
  COLLEGE = 'college',
  UNIVERSITY = 'university',
  TRAINING_INSTITUTE = 'training-institute',
  COACHING_INSTITUTE = 'coaching-institute',
  BOOTCAMP = 'bootcamp',
  OTHER = 'other',
}

export enum CompanySize {
  MICRO = '1-10',
  SMALL = '11-50',
  MEDIUM = '51-200',
  LARGE = '201-1000',
  ENTERPRISE = '1000+',
}
