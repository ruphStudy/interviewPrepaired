import app from './app';
import { connectDatabase } from './config/database';
import { env, validateEnv } from './config/environment';
import { logInfo, logError } from './middleware/logger';
import { subscriptionPlanService } from './services/SubscriptionPlanService';
import { creditPackService } from './services/CreditPackService';
import { emailRetryService } from './services/EmailRetryService';

const EMAIL_RETRY_INTERVAL_MS = 30 * 1000;

// Validate environment variables
validateEnv();

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

    // Minimal persistent email retry/outbox worker (PR-COMM-6) — polls for
    // queued EmailDelivery rows whose nextAttemptAt has passed. Atomic
    // per-row claiming makes this safe to run in more than one process.
    setInterval(() => {
      emailRetryService.runOnce().catch((error) => {
        console.error('[EmailRetryService] runOnce failed', error);
      });
    }, EMAIL_RETRY_INTERVAL_MS);

    // Start Express server
    app.listen(env.port, () => {
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

// Handle unhandled promise rejections
process.on('unhandledRejection', (err: Error) => {
  logError('Unhandled Promise Rejection', { error: err.message });
  console.error('Unhandled Promise Rejection:', err);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err: Error) => {
  logError('Uncaught Exception', { error: err.message });
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

startServer();

export default app;
