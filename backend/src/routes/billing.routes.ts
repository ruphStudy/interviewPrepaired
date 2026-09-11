import { Router } from 'express';
import { body, param, query } from 'express-validator';
import {
  getCreditPacks,
  checkoutSubscription,
  checkoutCreditPack,
  verifyPayment,
  handleRazorpayWebhook,
  listMyOrders,
  getMyOrder,
  getMyOrderReceipt,
  scheduleDowngrade,
  cancelScheduledDowngrade,
} from '../controllers/billing.controller';
import { protect } from '../middleware/auth';
import { validate } from '../middleware/validation';

const router = Router();

// Public catalog — mirrors GET /subscription/plans.
router.get('/credit-packs', getCreditPacks);

const idempotencyKeyValidation = body('idempotencyKey')
  .isString()
  .trim()
  .isLength({ min: 8, max: 200 })
  .withMessage('idempotencyKey is required (8-200 characters)');

router.post(
  '/checkout/subscription',
  protect,
  [body('planCode').isString().trim().notEmpty().withMessage('planCode is required'), idempotencyKeyValidation],
  validate,
  checkoutSubscription
);

router.post(
  '/checkout/credit-pack',
  protect,
  [body('creditPackCode').isString().trim().notEmpty().withMessage('creditPackCode is required'), idempotencyKeyValidation],
  validate,
  checkoutCreditPack
);

router.post(
  '/payments/verify',
  protect,
  [
    body('paymentOrderId').isMongoId().withMessage('paymentOrderId must be a valid id'),
    body('razorpay_order_id').isString().trim().notEmpty().withMessage('razorpay_order_id is required'),
    body('razorpay_payment_id').isString().trim().notEmpty().withMessage('razorpay_payment_id is required'),
    body('razorpay_signature').isString().trim().notEmpty().withMessage('razorpay_signature is required'),
  ],
  validate,
  verifyPayment
);

// No `protect` — Razorpay is the caller. Signature verification (against
// the raw body) is the authentication mechanism for this route.
router.post('/webhooks/razorpay', handleRazorpayWebhook);

router.get(
  '/orders',
  protect,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
  ],
  validate,
  listMyOrders
);

router.get('/orders/:id', protect, [param('id').isMongoId().withMessage('Invalid order id')], validate, getMyOrder);

router.get(
  '/orders/:id/receipt',
  protect,
  [param('id').isMongoId().withMessage('Invalid order id')],
  validate,
  getMyOrderReceipt
);

router.post(
  '/subscription/downgrade',
  protect,
  [body('planCode').isString().trim().notEmpty().withMessage('planCode is required')],
  validate,
  scheduleDowngrade
);

router.post('/subscription/downgrade/cancel', protect, cancelScheduledDowngrade);

export default router;
