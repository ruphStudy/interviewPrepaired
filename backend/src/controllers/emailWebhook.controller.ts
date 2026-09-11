import { Request, Response } from 'express';
import { catchAsync } from '../utils/catchAsync';
import { emailWebhookService } from '../services/EmailWebhookService';

/**
 * No `protect` middleware — Resend itself is the caller. `req.body` here is
 * the raw request Buffer (see app.ts's route-scoped express.raw() mounted
 * before the global JSON body parser), never the parsed JSON, so the
 * signature is always verified against the exact bytes Resend signed.
 */
export const handleResendWebhook = catchAsync(async (req: Request, res: Response) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
  const outcome = await emailWebhookService.handleWebhook(rawBody, {
    id: req.headers['svix-id'] as string | undefined,
    timestamp: req.headers['svix-timestamp'] as string | undefined,
    signature: req.headers['svix-signature'] as string | undefined,
  });
  res.status(outcome.httpStatus).json(outcome.body);
});
