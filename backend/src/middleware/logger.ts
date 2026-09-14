import { Request, Response, NextFunction } from 'express';
import winston from 'winston';
import path from 'path';
import { env } from '../config/environment';
import { redactSensitive } from '../utils/logRedaction';

// Configure winston logger
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const transports: winston.transport[] = [
  new winston.transports.File({
    filename: path.join(process.cwd(), 'logs', 'error.log'),
    level: 'error',
  }),
  new winston.transports.File({
    filename: path.join(process.cwd(), 'logs', 'combined.log'),
  }),
];

if (env.nodeEnv === 'development') {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

export const winstonLogger = winston.createLogger({
  level: env.logLevel,
  format: logFormat,
  defaultMeta: {
    service: 'entryskill-backend',
    environment: env.nodeEnv,
  },
  transports,
});

// Express middleware for logging requests
export const logger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const authReq = req as Request & { user?: { id?: string } };
    const entry = redactSensitive({
      message: 'request',
      method: req.method,
      route: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: duration,
      requestId: req.requestId,
      ...(authReq.user?.id ? { userId: authReq.user.id } : {}),
      ...((req.params as Record<string, unknown> | undefined)?.organizationId
        ? { organizationId: (req.params as Record<string, unknown>).organizationId }
        : {}),
    });

    if (res.statusCode >= 500) {
      winstonLogger.error(entry);
    } else if (res.statusCode >= 400) {
      winstonLogger.warn(entry);
    } else {
      winstonLogger.info(entry);
    }
  });

  next();
};

// Utility functions
export const logInfo = (message: string, meta?: any): void => {
  winstonLogger.info(message, meta ? redactSensitive(meta) : meta);
};

export const logError = (message: string, meta?: any): void => {
  winstonLogger.error(message, meta ? redactSensitive(meta) : meta);
};

export const logWarn = (message: string, meta?: any): void => {
  winstonLogger.warn(message, meta ? redactSensitive(meta) : meta);
};

export const logDebug = (message: string, meta?: any): void => {
  winstonLogger.debug(message, meta ? redactSensitive(meta) : meta);
};
