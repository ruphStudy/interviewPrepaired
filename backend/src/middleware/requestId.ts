import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/** Bounded, safe format for a client-supplied X-Request-Id — anything else is replaced with a freshly generated UUID rather than trusted verbatim. */
const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

/**
 * Request correlation ID (PR-OPS-3) — mounted before the request-logging
 * middleware (and before errorHandler) so every log line/error response for
 * a request can be tied together and reported back to support. Uses Node's
 * built-in `crypto.randomUUID()` — no new dependency. `req.requestId` is
 * typed via the global Express.Request augmentation in types/express.d.ts.
 */
export const requestId = (req: Request, res: Response, next: NextFunction): void => {
  const incoming = req.headers['x-request-id'];
  const incomingValue = Array.isArray(incoming) ? incoming[0] : incoming;

  const id = incomingValue && SAFE_REQUEST_ID_PATTERN.test(incomingValue) ? incomingValue : crypto.randomUUID();

  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
};
