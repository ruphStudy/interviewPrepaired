import dotenv from 'dotenv';

dotenv.config();

interface Environment {
  nodeEnv: string;
  port: number;
  mongodbUri: string;
  jwtSecret: string;
  jwtExpire: string;
  openaiApiKey: string;
  corsOrigin: string;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  logLevel: string;
  logFile: string;
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
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  logLevel: process.env.LOG_LEVEL || 'info',
  logFile: process.env.LOG_FILE || 'logs/app.log',
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
