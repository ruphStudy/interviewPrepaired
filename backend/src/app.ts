import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './middleware/logger';
import { requestId } from './middleware/requestId';
import healthRoutes from './routes/health.routes';
import routes from './routes';
import { env } from './config/environment';

const app: Application = express();

// Only applied when explicitly configured — never forced on unconditionally
// (accepts 'true'/'false'/a number-of-hops string/a comma-separated subnet
// list, matching Express's own `trust proxy` setting semantics).
if (env.trustProxy) {
  if (env.trustProxy === 'true') {
    app.set('trust proxy', true);
  } else if (env.trustProxy === 'false') {
    app.set('trust proxy', false);
  } else if (/^\d+$/.test(env.trustProxy)) {
    app.set('trust proxy', parseInt(env.trustProxy, 10));
  } else {
    app.set(
      'trust proxy',
      env.trustProxy.split(',').map((entry) => entry.trim()).filter(Boolean)
    );
  }
}

// Security middleware
app.use(helmet());

// Request correlation ID — mounted before logging/error handling so both can read it.
app.use(requestId);

// CORS — CORS_ORIGIN stays backward-compatible as a single origin string,
// but also accepts a comma-separated list of origins.
const corsOrigins = env.corsOrigin
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: corsOrigins.length > 1 ? corsOrigins : corsOrigins[0],
    credentials: true,
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.rateLimitMaxRequests,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// Razorpay webhook signature verification needs the EXACT raw request
// bytes — mounting this raw-body parser on the exact webhook path, before
// the global JSON parser below, means body-parser's own "already parsed"
// guard makes express.json() a no-op for this one path without disturbing
// any other route.
app.use('/api/v1/billing/webhooks/razorpay', express.raw({ type: '*/*', limit: '1mb' }));
// Resend webhook signature verification (Svix format) also needs the exact raw bytes.
app.use('/api/v1/webhooks/email/resend', express.raw({ type: '*/*', limit: '1mb' }));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
app.use(compression());

// Logging
if (env.nodeEnv === 'development') {
  app.use(morgan('dev'));
}
app.use(logger);

// Health check — cheap liveness only (process is alive, no DB/dependency
// check, always 200 unless the process itself can't respond). `/live` is a
// plain alias of the same handler.
const healthCheck = (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
  });
};
app.get('/health', healthCheck);
app.get('/live', healthCheck);

// Readiness — reflects real dependency state (DB connection, job poller,
// provider configuration). See routes/health.routes.ts.
app.use(healthRoutes);

// API routes
app.use('/api/v1', routes);

// 404 handler
app.use((req: Request, res: Response, _next: NextFunction) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

export default app;
