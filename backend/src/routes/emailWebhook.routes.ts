import { Router } from 'express';
import { handleResendWebhook } from '../controllers/emailWebhook.controller';

const router = Router();

// No `protect` — Resend is the caller. Signature verification (against the
// raw body) is the authentication mechanism for this route.
router.post('/resend', handleResendWebhook);

export default router;
