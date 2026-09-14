import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import { logError, logWarn } from './logger';
import { captureException } from '../config/monitoring';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const requestId = req.requestId;

  if (err instanceof ApiError) {
    // Expected 4xx client/business errors are noisy at error level — log at
    // warn (still server-side only, full detail never goes to production
    // JSON), reserve error level for genuine 5xx failures.
    const logMeta = { requestId, statusCode: err.statusCode, code: err.code, route: req.originalUrl };
    if (err.statusCode >= 500) {
      logError(err.message, { ...logMeta, stack: err.stack });
      captureException(err, { route: req.originalUrl, requestId, errorCode: err.code });
    } else {
      logWarn(err.message, logMeta);
    }

    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.code !== undefined ? { code: err.code } : {}),
      ...(err.errors !== undefined ? { errors: err.errors } : {}),
      ...(requestId ? { requestId } : {}),
    });
    return;
  }

  // Mongoose validation/cast errors are client input errors (bad shape/type,
  // or a value that fails a schema `match`/`enum`/length rule) — never a
  // server fault, so they must not surface as a 500. Logged at warn, same as
  // any other expected 4xx.
  if (err.name === 'ValidationError' || err.name === 'CastError') {
    logWarn(err.message, { requestId, route: req.originalUrl, errorName: err.name });
    res.status(400).json({
      success: false,
      message: err.message,
      ...(requestId ? { requestId } : {}),
    });
    return;
  }

  // Unexpected error — full stack logged server-side only, never in the
  // production JSON response.
  logError('Unhandled error', { requestId, route: req.originalUrl, message: err.message, stack: err.stack });
  captureException(err, { route: req.originalUrl, requestId });

  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? undefined : err.message,
    ...(requestId ? { requestId } : {}),
  });
};
