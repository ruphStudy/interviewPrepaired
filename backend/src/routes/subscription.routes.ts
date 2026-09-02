import { Router } from 'express';
import { body } from 'express-validator';
import { getActivePlans, getMySubscription, cancelMySubscription } from '../controllers/subscription.controller';
import { protect } from '../middleware/auth';
import { validate } from '../middleware/validation';

const router = Router();

router.get('/plans', getActivePlans);

router.get('/me', protect, getMySubscription);

router.post(
  '/cancel',
  protect,
  [body('cancelAtPeriodEnd').optional().isBoolean().withMessage('cancelAtPeriodEnd must be a boolean')],
  validate,
  cancelMySubscription
);

export default router;
