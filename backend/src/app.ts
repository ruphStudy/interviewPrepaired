import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './middleware/logger';
import { requestId } from './middleware/requestId';
import { protect, authorize } from './middleware/auth';
import { privacySafeAdminDeleteUser } from './controllers/privacyAdmin.controller';
import healthRoutes from './routes/health.routes';
import routes from './routes';
import { env } from './config/environment';

const app: Application = express();

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

app.use(helmet());
app.use(requestId);

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

const limiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.rateLimitMaxRequests,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

app.use('/api/v1/billing/webhooks/razorpay', express.raw({ type: '*/*', limit: '1mb' }));
app.use('/api/v1/webhooks/email/resend', express.raw({ type: '*/*', limit: '1mb' }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());

if (env.nodeEnv === 'development') {
  app.use(morgan('dev'));
}
app.use(logger);

const healthCheck = (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
  });
};
app.get('/health', healthCheck);
app.get('/live', healthCheck);
app.use(healthRoutes);

/**
 * Privacy safety shim for the existing admin contract. The historical
 * admin.routes delete handler hard-deletes users; mount the same public path
 * first so every request reaches the privacy-safe anonymization/cleanup
 * lifecycle. Keeping the URL stable avoids breaking the current admin UI.
 * The obsolete controller implementation can be removed in a later cleanup
 * after all clients have been confirmed against this route.
 */
app.delete('/api/v1/admin/users/:id', protect, authorize('admin'), privacySafeAdminDeleteUser);

app.use('/api/v1', routes);

app.use((req: Request, res: Response, _next: NextFunction) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

app.use(errorHandler);

export default app;