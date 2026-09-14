/**
 * Operations/reliability error codes (PR-OPS). Additive — follows the same
 * `ApiError(status, message, details, code)` convention used by
 * constants/billing.ts's BillingErrorCode; never a rewrite of ApiError
 * itself.
 */
export enum OpsErrorCode {
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  DATABASE_UNAVAILABLE = 'DATABASE_UNAVAILABLE',
  JOB_SYSTEM_UNAVAILABLE = 'JOB_SYSTEM_UNAVAILABLE',
  JOB_FAILED = 'JOB_FAILED',
  JOB_NOT_FOUND = 'JOB_NOT_FOUND',
  JOB_RETRY_NOT_ALLOWED = 'JOB_RETRY_NOT_ALLOWED',
  DEPENDENCY_UNAVAILABLE = 'DEPENDENCY_UNAVAILABLE',
  PRODUCTION_CONFIG_INVALID = 'PRODUCTION_CONFIG_INVALID',
}
