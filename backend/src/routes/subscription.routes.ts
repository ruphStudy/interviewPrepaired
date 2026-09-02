import { Router } from 'express';
import { body, query } from 'express-validator';
import {
  getActivePlans,
  getMySubscription,
  getMyCredits,
  getMyCreditHistory,
  cancelMySubscription,
} from '../controllers/subscription.controller';
import { protect } from '../middleware/auth';
import { validate } from '../middleware/validation';

const router = Router();

router.get('/plans', getActivePlans);

router.get('/me', protect, getMySubscription);

router.get('/credits', protect, getMyCredits);

router.get(
  '/credits/history',
  protect,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
  ],
  validate,
  getMyCreditHistory
);

router.post(
  '/cancel',
  protect,
  [body('cancelAtPeriodEnd').optional().isBoolean().withMessage('cancelAtPeriodEnd must be a boolean')],
  validate,
  cancelMySubscription
);

export default router;
