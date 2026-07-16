import { Request, Response, NextFunction } from 'express';
import winston from 'winston';
import path from 'path';
import { env } from '../config/environment';

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
  transports,
});

// Express middleware for logging requests
export const logger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const message = `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`;

    if (res.statusCode >= 500) {
      winstonLogger.error(message);
    } else if (res.statusCode >= 400) {
      winstonLogger.warn(message);
    } else {
      winstonLogger.info(message);
    }
  });

  next();
};

// Utility functions
export const logInfo = (message: string, meta?: any): void => {
  winstonLogger.info(message, meta);
};

export const logError = (message: string, meta?: any): void => {
  winstonLogger.error(message, meta);
};

export const logWarn = (message: string, meta?: any): void => {
  winstonLogger.warn(message, meta);
};

export const logDebug = (message: string, meta?: any): void => {
  winstonLogger.debug(message, meta);
};
