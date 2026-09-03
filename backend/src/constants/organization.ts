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

/** Generic organization settings (9B) — foundational only, not institute/company-specific. */
export enum OrganizationDateFormat {
  DMY = 'DD/MM/YYYY',
  MDY = 'MM/DD/YYYY',
  ISO = 'YYYY-MM-DD',
}

export enum OrganizationTimeFormat {
  H12 = '12h',
  H24 = '24h',
}

// Single source of truth for settings defaults — the schema (new docs) and
// the service's effective-settings computation (old docs missing fields)
// both read from here, so they can never drift apart.
export const DEFAULT_ORGANIZATION_TIMEZONE = 'Asia/Kolkata';
export const DEFAULT_ORGANIZATION_LOCALE = 'en-IN';
export const DEFAULT_ORGANIZATION_DATE_FORMAT = OrganizationDateFormat.DMY;
export const DEFAULT_ORGANIZATION_TIME_FORMAT = OrganizationTimeFormat.H12;
