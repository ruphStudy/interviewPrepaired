import { env } from './environment';
import { logInfo, logError } from '../middleware/logger';

/**
 * Optional Sentry integration (PR-OPS-3) — only active when `SENTRY_DSN` is
 * set. When it isn't, every exported function becomes a safe no-op so the
 * rest of the app never needs a scattered `if (sentryEnabled)` check.
 * `@sentry/node` is only imported (lazily) when a DSN is actually
 * configured, so environments without Sentry never pay for it.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sentryModule: any = null;
let initialized = false;

export function isMonitoringEnabled(): boolean {
  return !!process.env.SENTRY_DSN;
}

export function initMonitoring(): void {
  if (initialized) return;
  initialized = true;

  if (!process.env.SENTRY_DSN) {
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    sentryModule = require('@sentry/node');
    sentryModule.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.SENTRY_ENVIRONMENT || env.nodeEnv,
      release: process.env.SENTRY_RELEASE,
      // Strip anything resembling PII/secrets from the outgoing event —
      // only safe route/requestId/jobType/errorCode-shaped context is ever
      // passed to captureException below, but this is defense in depth
      // against Sentry's own automatic request-data capture.
      beforeSend: (event: any) => {
        if (event?.request) {
          delete event.request.cookies;
          if (event.request.headers) {
            delete event.request.headers.authorization;
            delete event.request.headers.cookie;
          }
          delete event.request.data;
        }
        return event;
      },
    });
    logInfo('Sentry monitoring initialized');
  } catch (error) {
    // Never let a missing/misconfigured Sentry dependency crash startup.
    sentryModule = null;
    logError('Failed to initialize Sentry monitoring — continuing without it', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Safe context only — route, requestId, jobType, errorCode. Never a full request body or PII. */
export function captureException(error: Error, context?: Record<string, unknown>): void {
  if (!sentryModule) return;
  try {
    sentryModule.captureException(error, context ? { extra: context } : undefined);
  } catch {
    // Never let a monitoring failure mask/replace the original error handling.
  }
}

export async function closeMonitoring(timeoutMs = 2000): Promise<void> {
  if (!sentryModule) return;
  try {
    await sentryModule.close(timeoutMs);
  } catch {
    // Best-effort flush only.
  }
}
