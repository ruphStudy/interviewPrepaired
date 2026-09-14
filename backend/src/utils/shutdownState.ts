/**
 * A single in-memory flag flipped at the top of gracefulShutdown() (see
 * server.ts/worker.ts) so `/ready` starts returning 503/not_ready
 * IMMEDIATELY when shutdown begins — before the HTTP server actually stops
 * accepting connections — so a load balancer stops routing new traffic
 * before the process exits.
 */
let shuttingDown = false;

export function beginShutdown(): void {
  shuttingDown = true;
}

export function isShuttingDown(): boolean {
  return shuttingDown;
}
