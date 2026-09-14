import mongoose from 'mongoose';
import { env } from '../config/environment';
import { isPollerHealthy } from '../utils/jobPollerHealth';
import { isShuttingDown } from '../utils/shutdownState';
import { JOB_POLL_INTERVAL_MS } from '../constants/operationalJob';

export type ConfiguredStatus = 'configured' | 'not-configured';
export type OkStatus = 'ok' | 'unavailable';

export interface ReadinessDependencies {
  database: OkStatus;
  queue: OkStatus;
  storage: ConfiguredStatus;
  email: ConfiguredStatus;
  payments: ConfiguredStatus;
  sentry: ConfiguredStatus;
}

export interface ReadinessResult {
  status: 'ready' | 'not_ready';
  dependencies: ReadinessDependencies;
}

/**
 * Pure(ish) readiness computation (PR-OPS-4) — takes the DB readyState as a
 * parameter so it's unit-testable without a real Mongo connection. NEVER
 * makes a live network call to OpenAI/Razorpay/Resend/S3/Sentry — every
 * provider field below is purely "are its env vars present", never an
 * actual reachability check.
 */
export function computeReadiness(databaseReadyState: number = mongoose.connection.readyState): ReadinessResult {
  const databaseOk = databaseReadyState === 1;
  // Shutting down => never "ready", even if the DB connection is still up —
  // a load balancer should stop routing new traffic immediately.
  const database: OkStatus = databaseOk && !isShuttingDown() ? 'ok' : 'unavailable';

  // When jobs are split out to a separate `worker` process
  // (RUN_JOBS_IN_PROCESS=false), this HTTP process intentionally never runs
  // the poller — that isn't a degraded state for the HTTP process itself.
  const queue: OkStatus = !env.runJobsInProcess || isPollerHealthy(JOB_POLL_INTERVAL_MS) ? 'ok' : 'unavailable';

  const storage: ConfiguredStatus =
    env.storageProvider !== 'local' || (env.storageBucket && env.awsRegion && env.awsAccessKeyId && env.awsSecretAccessKey)
      ? 'configured'
      : 'not-configured';
  const email: ConfiguredStatus = env.resendApiKey ? 'configured' : 'not-configured';
  const payments: ConfiguredStatus = env.razorpayKeyId && env.razorpayKeySecret ? 'configured' : 'not-configured';
  const sentry: ConfiguredStatus = process.env.SENTRY_DSN ? 'configured' : 'not-configured';

  return {
    status: database === 'ok' ? 'ready' : 'not_ready',
    dependencies: { database, queue, storage, email, payments, sentry },
  };
}
