/**
 * Object storage foundation (PR-STORAGE). Stable category/status vocabulary
 * and centralized retention policy — never duplicated per-feature.
 */
export enum StoredFileCategory {
  RESUME = 'resume',
  KNOWLEDGE_BASE = 'knowledge_base',
  CANDIDATE_ATTACHMENT = 'candidate_attachment',
  GENERATED_REPORT = 'generated_report',
  EXPORT = 'export',
  OTHER = 'other',
}

export type StorageProviderName = 's3' | 'local';

export type StoredFileStatus = 'uploading' | 'available' | 'processing' | 'failed' | 'deleted' | 'quarantined';

/** Bounded default retention per category, in days — `null` means "retain while the owning record exists" (no independent TTL). Centralized so no feature invents its own ad hoc rule. */
export const RETENTION_DAYS_BY_CATEGORY: Record<StoredFileCategory, number | null> = {
  [StoredFileCategory.RESUME]: null,
  [StoredFileCategory.KNOWLEDGE_BASE]: null,
  [StoredFileCategory.CANDIDATE_ATTACHMENT]: null,
  [StoredFileCategory.GENERATED_REPORT]: 30,
  [StoredFileCategory.EXPORT]: 7,
  [StoredFileCategory.OTHER]: 30,
};

export const DEFAULT_SIGNED_URL_TTL_SECONDS = 600; // 10 minutes
export const MAX_SIGNED_URL_TTL_SECONDS = 900; // 15 minutes — spec's suggested upper bound
