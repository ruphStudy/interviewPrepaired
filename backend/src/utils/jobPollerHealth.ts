/**
 * Tracks whether the in-process job poller (email retry + operational job
 * poller, see server.ts/worker.ts) is completing ticks successfully — used
 * by /ready and /ops/diagnostics. There is no real external queue to ping,
 * so "queue health" here means "is our own Mongo-backed poller loop still
 * making progress", approximated by comparing the last successful tick's
 * timestamp against the expected polling interval.
 */
let lastSuccessfulPollAt: Date | null = null;

export function recordPollSuccess(): void {
  lastSuccessfulPollAt = new Date();
}

export function getLastSuccessfulPollAt(): Date | null {
  return lastSuccessfulPollAt;
}

/** Unhealthy if it has never completed a tick, or the last successful tick is older than `expectedIntervalMs * graceMultiplier`. */
export function isPollerHealthy(expectedIntervalMs: number, graceMultiplier = 3): boolean {
  if (!lastSuccessfulPollAt) return false;
  return Date.now() - lastSuccessfulPollAt.getTime() < expectedIntervalMs * graceMultiplier;
}

/** Test-only reset hook. */
export function _resetForTests(): void {
  lastSuccessfulPollAt = null;
}
