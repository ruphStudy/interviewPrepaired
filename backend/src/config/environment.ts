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
  /** Optional merchant display fields for receipts (PR-B2B-BILL) — never fabricated; blank unless genuinely configured. */
  billingLegalName: string;
  billingAddress: string;
  billingGstin: string;
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
  storageProvider: string;
  storageBucket: string;
  awsRegion: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  storageEndpoint: string;
  storageForcePathStyle: boolean;
  storageSignedUrlTtlSeconds: number;
  localStoragePath: string;
  /** Express `trust proxy` setting (PR-OPS-6) — blank means "not set" (Express default: disabled). Only ever applied when explicitly configured; never forced on unconditionally. */
  trustProxy: string;
  /** When 'false', server.ts does NOT start the in-process email/job pollers — a separate `worker` process (src/worker.ts) is expected to run them instead. Defaults to true so single-process deployments/local dev are unchanged. */
  runJobsInProcess: boolean;
  /** Consent version labels (PR-PRIVACY-4) — just labels, never fabricated legal text. Bump when the actual Terms/Privacy Policy document changes. */
  termsVersion: string;
  privacyPolicyVersion: string;
  /** Real legal document URLs — MUST stay blank unless genuinely configured; never fabricated. The frontend renders "not yet configured" rather than a broken/placeholder link when blank. */
  termsUrl: string;
  privacyPolicyUrl: string;
  /** Hours a completed privacy data-export archive remains downloadable before the cleanup sweep deletes it (PR-PRIVACY-2). */
  privacyExportRetentionHours: number;
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
  // Optional merchant display fields for organization billing receipts —
  // left blank unless a real, non-fabricated value is configured.
  billingLegalName: process.env.BILLING_LEGAL_NAME || '',
  billingAddress: process.env.BILLING_ADDRESS || '',
  billingGstin: process.env.BILLING_GSTIN || '',
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
  // Object storage foundation (PR-STORAGE) — 'local' writes under
  // LOCAL_STORAGE_PATH and is refused outright in production (see
  // storage/index.ts); a real deployment must set STORAGE_PROVIDER=s3 with
  // genuine bucket/credentials, or durable-file endpoints return
  // STORAGE_PROVIDER_UNAVAILABLE rather than silently falling back to disk.
  storageProvider: process.env.STORAGE_PROVIDER || 'local',
  storageBucket: process.env.STORAGE_BUCKET || '',
  awsRegion: process.env.AWS_REGION || '',
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  storageEndpoint: process.env.STORAGE_ENDPOINT || '',
  storageForcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === 'true',
  storageSignedUrlTtlSeconds: parseInt(process.env.STORAGE_SIGNED_URL_TTL_SECONDS || '600', 10),
  localStoragePath: process.env.LOCAL_STORAGE_PATH || './storage-dev',
  trustProxy: process.env.TRUST_PROXY || '',
  runJobsInProcess: process.env.RUN_JOBS_IN_PROCESS !== 'false',
  // Consent/privacy foundation (PR-PRIVACY-4) — versions are just labels
  // (default '1.0' is fine, it is not legal text); URLs are left blank
  // unless a real, non-fabricated value is configured.
  termsVersion: process.env.TERMS_VERSION || '1.0',
  privacyPolicyVersion: process.env.PRIVACY_POLICY_VERSION || '1.0',
  termsUrl: process.env.TERMS_URL || '',
  privacyPolicyUrl: process.env.PRIVACY_POLICY_URL || '',
  privacyExportRetentionHours: parseInt(process.env.PRIVACY_EXPORT_RETENTION_HOURS || '48', 10),
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

/** Known-insecure JWT secret defaults/placeholders that must never be used in production. */
const WEAK_JWT_SECRETS = new Set(['your-secret-key', 'secret', 'changeme', 'change-me']);
const MIN_JWT_SECRET_LENGTH = 32;

export interface ProductionSafetyCheckInput {
  nodeEnv: string;
  jwtSecret: string;
  storageProvider: string;
  emailDevMode: boolean;
  corsOrigin: string;
}

/**
 * Pure validation logic (PR-OPS-6) — extracted from any `process.exit` side
 * effect so it can be unit tested with a mocked env-shaped object. Returns
 * an empty array for a safe config (or any non-production nodeEnv, which
 * this validator never blocks — `npm run dev` must never be affected).
 */
export function getProductionConfigProblems(input: ProductionSafetyCheckInput): string[] {
  const problems: string[] = [];
  if (input.nodeEnv !== 'production') {
    return problems;
  }

  const secret = input.jwtSecret || '';
  if (!secret || WEAK_JWT_SECRETS.has(secret.toLowerCase()) || secret.length < MIN_JWT_SECRET_LENGTH) {
    problems.push(
      `JWT_SECRET is missing, a known-weak default, or shorter than ${MIN_JWT_SECRET_LENGTH} characters`
    );
  }

  if (input.storageProvider === 'local') {
    problems.push('STORAGE_PROVIDER=local is not permitted in production — configure a real object storage provider');
  }

  if (input.emailDevMode) {
    problems.push('EMAIL_DEV_MODE must not be true in production');
  }

  const corsOrigins = (input.corsOrigin || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (corsOrigins.includes('*')) {
    problems.push('CORS_ORIGIN=* is not permitted in production (invalid combined with credentials:true)');
  }

  return problems;
}

/**
 * Upgrades `validateEnv()`'s baseline "required vars present" check into a
 * production safety gate — called right after `validateEnv()` from
 * server.ts/worker.ts, before anything else starts. Never blocks
 * development/test.
 */
export const assertProductionSafety = (input: ProductionSafetyCheckInput = env): void => {
  const problems = getProductionConfigProblems(input);
  if (problems.length > 0) {
    console.error('Refusing to start — unsafe production configuration:');
    problems.forEach((problem) => console.error(`  - ${problem}`));
    process.exit(1);
  }
};
