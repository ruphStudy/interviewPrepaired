import app from './app';
import { connectDatabase } from './config/database';
import { env, validateEnv } from './config/environment';
import { logInfo, logError } from './middleware/logger';
import { subscriptionPlanService } from './services/SubscriptionPlanService';

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
