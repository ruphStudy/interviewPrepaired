import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './middleware/logger';
import routes from './routes';
import { env } from './config/environment';

const app: Application = express();

// Security middleware
app.use(helmet());

// CORS
app.use(
  cors({
    origin: env.corsOrigin,
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

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
  });
});

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
