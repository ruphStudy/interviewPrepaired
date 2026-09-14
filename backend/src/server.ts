import app from './app';
import { connectDatabase } from './config/database';
import { env, validateEnv, assertProductionSafety } from './config/environment';
import { initMonitoring, captureException } from './config/monitoring';
import { logInfo, logError } from './middleware/logger';
import { subscriptionPlanService } from './services/SubscriptionPlanService';
import { creditPackService } from './services/CreditPackService';
import { emailRetryService } from './services/EmailRetryService';
import { emailVerificationService } from './services/EmailVerificationService';
import { operationalJobService } from './services/OperationalJobService';
import { recordPollSuccess } from './utils/jobPollerHealth';
import { createGracefulShutdown } from './utils/shutdown';
import { JOB_POLL_INTERVAL_MS } from './constants/operationalJob';

// Validate environment variables
validateEnv();
assertProductionSafety();
initMonitoring();

const intervalHandles: NodeJS.Timeout[] = [];
let httpServer: ReturnType<typeof app.listen> | undefined;

// Start server
const startServer = async (): Promise<void> => {
  try {
    // Connect to database
    await connectDatabase();

    // Ensure the default B2C subscription plan catalog exists
    try {
      await subscriptionPlanService.ensureDefaultPlans();
      logInfo('Default subscription plans verified');
    } catch (error: any) {
      logError('Failed to seed default subscription plans', { error: error.message });
      console.error('❌ Failed to seed default subscription plans:', error);
      process.exit(1);
    }

    // Ensure the default B2C interview-credit pack catalog exists
    try {
      await creditPackService.ensureDefaultPacks();
      logInfo('Default credit packs verified');
    } catch (error: any) {
      logError('Failed to seed default credit packs', { error: error.message });
      console.error('❌ Failed to seed default credit packs:', error);
      process.exit(1);
    }

    // Backward-compatibility backfill (PR-AUTH-1) — accounts predating the
    // email-verification rollout are treated as already verified so this
    // feature shipping never locks out existing users. Idempotent.
    try {
      const backfilled = await emailVerificationService.backfillLegacyUsersAsVerified();
      logInfo('Legacy user email-verification backfill complete', { backfilled });
    } catch (error: any) {
      logError('Failed to backfill legacy user email verification', { error: error.message });
      console.error('❌ Failed to backfill legacy user email verification:', error);
      // Non-fatal — the app still starts; legacy users simply remain
      // unverified until this succeeds on a later restart.
    }

    // In-process email retry + operational job pollers (PR-OPS-1/2/4) — the
    // DEFAULT so single-process deployments/local dev keep working exactly
    // as before. Set RUN_JOBS_IN_PROCESS=false to instead rely solely on
    // the separate `worker` process (src/worker.ts) for a split HTTP/worker
    // deployment.
    if (env.runJobsInProcess) {
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
          .then(() => recordPollSuccess())
          .catch((error) => {
            console.error('[OperationalJobService] runOnce failed', error);
          });
      }, JOB_POLL_INTERVAL_MS);
      intervalHandles.push(operationalJobInterval);
    }

    // Start Express server
    httpServer = app.listen(env.port, () => {
      logInfo(`Server running on port ${env.port}`, {
        environment: env.nodeEnv,
        port: env.port,
      });
      console.log(`🚀 Server running on port ${env.port}`);
      console.log(`📝 Environment: ${env.nodeEnv}`);
      console.log(`🔗 CORS Origin: ${env.corsOrigin}`);
    });
  } catch (error: any) {
    logError('Failed to start server', { error: error.message });
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

const gracefulShutdown = createGracefulShutdown({
  get httpServer() {
    return httpServer;
  },
  intervalHandles,
});

process.on('SIGTERM', () => {
  void gracefulShutdown('SIGTERM', 0);
});
process.on('SIGINT', () => {
  void gracefulShutdown('SIGINT', 0);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err: Error) => {
  logError('Unhandled Promise Rejection', { error: err.message, stack: err.stack });
  console.error('Unhandled Promise Rejection:', err);
  captureException(err instanceof Error ? err : new Error(String(err)));
  void gracefulShutdown('unhandledRejection', 1);
});

// Handle uncaught exceptions — never leave a process alive after a truly
// unsafe uncaught exception, but still attempt a bounded graceful shutdown
// (DB/HTTP server close) first — createGracefulShutdown's own hard timeout
// force-exits if that hangs.
process.on('uncaughtException', (err: Error) => {
  logError('Uncaught Exception', { error: err.message, stack: err.stack });
  console.error('Uncaught Exception:', err);
  captureException(err instanceof Error ? err : new Error(String(err)));
  void gracefulShutdown('uncaughtException', 1);
});

startServer();

export default app;
