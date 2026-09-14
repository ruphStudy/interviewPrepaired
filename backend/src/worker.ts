/**
 * Separate worker process entry point (PR-OPS-4) — connects to the
 * database and runs ONLY the job pollers (email retry + OperationalJob),
 * no HTTP server. Used for a split HTTP/worker deployment where the HTTP
 * process sets RUN_JOBS_IN_PROCESS=false and this process is started
 * separately (`npm run worker` / `npm run worker:dev`). Not required for
 * single-process deployments/local dev — server.ts keeps running its own
 * in-process pollers by default.
 */
import { connectDatabase } from './config/database';
import { validateEnv, assertProductionSafety } from './config/environment';
import { initMonitoring, captureException } from './config/monitoring';
import { logInfo, logError } from './middleware/logger';
import { emailRetryService } from './services/EmailRetryService';
import { operationalJobService } from './services/OperationalJobService';
import { recordPollSuccess } from './utils/jobPollerHealth';
import { createGracefulShutdown } from './utils/shutdown';
import { JOB_POLL_INTERVAL_MS } from './constants/operationalJob';

validateEnv();
assertProductionSafety();
initMonitoring();

const intervalHandles: NodeJS.Timeout[] = [];

const start = async (): Promise<void> => {
  try {
    await connectDatabase();
    logInfo('Worker process connected to database');

    const emailRetryInterval = setInterval(() => {
      emailRetryService
        .runOnce()
        .then(() => recordPollSuccess())
        .catch((error) => {
          console.error('[EmailRetryService] runOnce failed', error);
        });
    }, JOB_POLL_INTERVAL_MS);
    intervalHandles.push(emailRetryInterval);

    const operationalJobInterval = setInterval(() => {
      operationalJobService
        .runOnce()
        .then(() => operationalJobService.scanForExpiredSubscriptions())
        .then(() => operationalJobService.cleanupExpiredPrivacyExports())
        .then(() => recordPollSuccess())
        .catch((error) => {
          console.error('[OperationalJobService] runOnce failed', error);
        });
    }, JOB_POLL_INTERVAL_MS);
    intervalHandles.push(operationalJobInterval);

    logInfo('Worker process job pollers started');
    console.log('🛠️  Worker process running (job pollers only, no HTTP server)');
  } catch (error: any) {
    logError('Failed to start worker process', { error: error.message });
    console.error('❌ Failed to start worker process:', error);
    process.exit(1);
  }
};

const gracefulShutdown = createGracefulShutdown({ intervalHandles });

process.on('SIGTERM', () => {
  void gracefulShutdown('SIGTERM', 0);
});
process.on('SIGINT', () => {
  void gracefulShutdown('SIGINT', 0);
});

process.on('unhandledRejection', (err: Error) => {
  logError('Worker: Unhandled Promise Rejection', { error: err.message, stack: err.stack });
  captureException(err instanceof Error ? err : new Error(String(err)));
  void gracefulShutdown('unhandledRejection', 1);
});

process.on('uncaughtException', (err: Error) => {
  logError('Worker: Uncaught Exception', { error: err.message, stack: err.stack });
  captureException(err instanceof Error ? err : new Error(String(err)));
  void gracefulShutdown('uncaughtException', 1);
});

start();
