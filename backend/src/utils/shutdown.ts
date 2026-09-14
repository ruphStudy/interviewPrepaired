import mongoose from 'mongoose';
import { logInfo, logError } from '../middleware/logger';
import { closeMonitoring } from '../config/monitoring';
import { beginShutdown } from './shutdownState';

export interface MinimalHttpServer {
  close: (callback: (err?: Error) => void) => void;
}

export interface GracefulShutdownOptions {
  /** Absent for the worker process (no HTTP server to close). */
  httpServer?: MinimalHttpServer;
  /** setInterval handles to clear so no new poll tick starts once shutdown begins. */
  intervalHandles?: NodeJS.Timeout[];
  /** Bounded grace period to let any in-flight work settle before closing the DB connection. */
  gracePeriodMs?: number;
  /** Hard ceiling — force-exits if the graceful sequence itself hangs. Never let an unsafe process stay alive indefinitely. */
  hardTimeoutMs?: number;
}

/**
 * Shared graceful shutdown sequence (PR-OPS-4) used by both server.ts and
 * worker.ts: stop accepting new work, clear job pollers, let any brief
 * in-flight work settle (bounded), close Mongo, flush Sentry, exit. Also
 * flips the shared `isShuttingDown()` flag immediately so `/ready` starts
 * returning 503 before the HTTP server actually stops accepting
 * connections.
 */
export function createGracefulShutdown(options: GracefulShutdownOptions) {
  let alreadyShuttingDown = false;

  return async function gracefulShutdown(signal: string, exitCode: number): Promise<void> {
    if (alreadyShuttingDown) return;
    alreadyShuttingDown = true;
    beginShutdown();

    logInfo(`Received ${signal} — starting graceful shutdown`);

    const hardTimeout = setTimeout(() => {
      logError('Graceful shutdown exceeded hard timeout — forcing exit');
      process.exit(exitCode || 1);
    }, options.hardTimeoutMs ?? 10_000);
    hardTimeout.unref?.();

    try {
      (options.intervalHandles || []).forEach((handle) => clearInterval(handle));

      if (options.httpServer) {
        await new Promise<void>((resolve) => {
          options.httpServer!.close((err) => {
            if (err) logError('Error closing HTTP server during shutdown', { error: err.message });
            resolve();
          });
        });
      }

      // Bounded grace window for any brief in-flight work (e.g. a request
      // already accepted, or a job mid-processing) to settle before the DB
      // connection is torn down — never hangs indefinitely.
      await new Promise((resolve) => setTimeout(resolve, options.gracePeriodMs ?? 2_000));

      await mongoose.connection.close();
      await closeMonitoring(2000);

      logInfo('Graceful shutdown complete');
    } catch (error) {
      logError('Error during graceful shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(hardTimeout);
      process.exit(exitCode);
    }
  };
}
