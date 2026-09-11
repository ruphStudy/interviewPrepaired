import dotenv from 'dotenv';

dotenv.config();

interface Environment {
  nodeEnv: string;
  port: number;
  mongodbUri: string;
  jwtSecret: string;
  jwtExpire: string;
  openaiApiKey: string;
  openaiModel: string;
  corsOrigin: string;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  logLevel: string;
  logFile: string;
  paymentProvider: string;
  razorpayKeyId: string;
  razorpayKeySecret: string;
  razorpayWebhookSecret: string;
  appBaseUrl: string;
  frontendUrl: string;
  emailProvider: string;
  emailFrom: string;
  emailFromName: string;
  emailReplyTo: string;
  resendApiKey: string;
  emailWebhookSecret: string;
  /** Explicit, non-production-only opt-in for the console/dev email provider — see emails/index.ts. */
  emailDevMode: boolean;
}

export const env: Environment = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  mongodbUri:
    process.env.NODE_ENV === 'production'
      ? process.env.MONGODB_URI_PROD || ''
      : process.env.MONGODB_URI || 'mongodb://localhost:27017/interview-coach',
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
  jwtExpire: process.env.JWT_EXPIRE || '7d',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  // Matches OpenAIService.ts's own fallback exactly — that file still reads
  // process.env.OPENAI_MODEL directly (unmigrated); this is only for the new
  // ai/config.ts foundation to reference the same effective value centrally.
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  logLevel: process.env.LOG_LEVEL || 'info',
  logFile: process.env.LOG_FILE || 'logs/app.log',
  // Payment provider foundation (PR-BILL) — never defaulted to a real
  // value; an empty secret means the provider is treated as unconfigured
  // (PAYMENT_PROVIDER_UNAVAILABLE), never a silent fake-success path.
  paymentProvider: process.env.PAYMENT_PROVIDER || 'razorpay',
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  appBaseUrl: process.env.APP_BASE_URL || '',
  frontendUrl: process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:3000',
  // Transactional email foundation (PR-COMM) — leave RESEND_API_KEY blank in
  // any environment without a real provider; the send path then returns
  // EMAIL_PROVIDER_UNAVAILABLE (or uses the dev-console provider, but ONLY
  // when EMAIL_DEV_MODE=true AND NODE_ENV!=='production' — see emails/index.ts).
  emailProvider: process.env.EMAIL_PROVIDER || 'resend',
  emailFrom: process.env.EMAIL_FROM || '',
  emailFromName: process.env.EMAIL_FROM_NAME || 'EnterSkill',
  emailReplyTo: process.env.EMAIL_REPLY_TO || '',
  resendApiKey: process.env.RESEND_API_KEY || '',
  emailWebhookSecret: process.env.EMAIL_WEBHOOK_SECRET || '',
  emailDevMode: process.env.EMAIL_DEV_MODE === 'true',
};

export const validateEnv = (): void => {
  const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET', 'OPENAI_API_KEY'];

  if (env.nodeEnv === 'production') {
    requiredEnvVars.push('MONGODB_URI_PROD');
  }

  const missingEnvVars = requiredEnvVars.filter(
    (envVar) => !process.env[envVar]
  );

  if (missingEnvVars.length > 0) {
    console.error(
      `Missing required environment variables: ${missingEnvVars.join(', ')}`
    );
    if (env.nodeEnv === 'production') {
      process.exit(1);
    }
  }
};
