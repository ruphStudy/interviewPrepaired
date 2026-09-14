import { Router, Request, Response } from 'express';
import { computeReadiness } from '../services/ReadinessService';

const router = Router();

/**
 * Readiness — reflects REAL dependency state (never hardcoded "ready").
 * 200 when the database is connected (and the process isn't mid-shutdown),
 * 503 otherwise. Never makes a live network call to a third-party provider.
 */
router.get('/ready', (_req: Request, res: Response) => {
  const result = computeReadiness();
  res.status(result.status === 'ready' ? 200 : 503).json(result);
});

export default router;
