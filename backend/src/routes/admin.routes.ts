import { Router } from 'express';
import { query, body, param } from 'express-validator';
import {
  getDashboardStats,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  getAllInterviews,
  deleteInterview,
  getAnalytics,
  getInterviewAIUsage,
  getUserAIUsage,
  getGlobalAIUsage,
  getUserSubscriptionAdmin,
  changeUserPlanAdmin,
  adjustUserCreditsAdmin,
  getUserCreditsAdmin,
  cancelUserSubscriptionAdmin,
  listPaymentOrdersAdmin,
  getPaymentOrderAdmin,
  reconcilePaymentOrderAdmin,
  refundPaymentOrderAdmin,
  listEmailDeliveriesAdmin,
  getEmailDeliveryAdmin,
  runStorageOrphanScanAdmin,
  listPrivacyAuditAdmin,
  getConversationEventCountsAdmin,
  getInterviewPathSummaryAdmin,
} from '../controllers/admin.controller';
import {
  listOperationalJobsAdmin,
  getOperationalJobAdmin,
  retryOperationalJobAdmin,
  getOpsDiagnosticsAdmin,
} from '../controllers/operationalJob.controller';
import {
  createContractAdmin,
  listContractsAdmin,
  getContractAdmin,
  activateContractAdmin,
  expireContractAdmin,
  cancelContractAdmin,
  recordManualPaymentAdmin,
  listManualPaymentsAdmin,
} from '../controllers/organizationContract.controller';
import { protect, authorize } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { PlanCode } from '../constants/subscription';
import { OperationalJobType } from '../constants/operationalJob';

const router = Router();

// All admin routes require authentication and admin role
router.use(protect, authorize('admin'));

// Dashboard
router.get('/dashboard', getDashboardStats);

// Analytics
router.get('/analytics', getAnalytics);

// AI Usage / Cost Tracking
const usageDateRangeValidation = [
  query('from').optional().isISO8601().withMessage('from must be a valid ISO 8601 date'),
  query('to').optional().isISO8601().withMessage('to must be a valid ISO 8601 date'),
];

router.get(
  '/usage/interview/:interviewId',
  [param('interviewId').isMongoId().withMessage('Invalid interview ID')],
  validate,
  getInterviewAIUsage
);

router.get(
  '/usage/user/:userId',
  [param('userId').isMongoId().withMessage('Invalid user ID'), ...usageDateRangeValidation],
  validate,
  getUserAIUsage
);

router.get('/usage', usageDateRangeValidation, validate, getGlobalAIUsage);

// Phase 13 (13A/13B) — read-only interview-conversation/client-telemetry
// analytics. Gated by this router's own existing `protect, authorize('admin')`
// guard above — never a new/weaker auth check.
router.get(
  '/conversation-analytics/event-counts',
  [query('days').optional().isInt({ min: 1, max: 90 }).withMessage('days must be between 1 and 90')],
  validate,
  getConversationEventCountsAdmin
);

router.get(
  '/conversation-analytics/interviews/:interviewId',
  [param('interviewId').isMongoId().withMessage('Invalid interview ID')],
  validate,
  getInterviewPathSummaryAdmin
);

// User Management
router.get(
  '/users',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('search').optional().isString().trim(),
    query('role').optional().isIn(['user', 'admin']).withMessage('Invalid role'),
  ],
  validate,
  getAllUsers
);

router.get(
  '/users/:id',
  [param('id').isMongoId().withMessage('Invalid user ID')],
  validate,
  getUserById
);

router.put(
  '/users/:id',
  [
    param('id').isMongoId().withMessage('Invalid user ID'),
    body('name').optional().isString().trim().notEmpty().withMessage('Name cannot be empty'),
    body('email').optional().isEmail().withMessage('Invalid email'),
    body('role').optional().isIn(['user', 'admin']).withMessage('Invalid role'),
    body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  ],
  validate,
  updateUser
);

router.delete(
  '/users/:id',
  [param('id').isMongoId().withMessage('Invalid user ID')],
  validate,
  deleteUser
);

// Interview Management
router.get(
  '/interviews',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('status')
      .optional()
      .isIn(['created', 'in-progress', 'paused', 'completed', 'evaluated'])
      .withMessage('Invalid status'),
    query('topic').optional().isString().trim(),
  ],
  validate,
  getAllInterviews
);

router.delete(
  '/interviews/:id',
  [param('id').isMongoId().withMessage('Invalid interview ID')],
  validate,
  deleteInterview
);

// User Subscription / Interview Credit Admin Controls
const userIdParamValidation = [param('userId').isMongoId().withMessage('Invalid user ID')];
const creditHistoryQueryValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
];

router.get(
  '/users/:userId/subscription',
  userIdParamValidation,
  validate,
  getUserSubscriptionAdmin
);

router.post(
  '/users/:userId/subscription/plan',
  [
    ...userIdParamValidation,
    body('planCode')
      .notEmpty()
      .withMessage('planCode is required')
      .isIn(Object.values(PlanCode))
      .withMessage(`planCode must be one of: ${Object.values(PlanCode).join(', ')}`),
  ],
  validate,
  changeUserPlanAdmin
);

router.post(
  '/users/:userId/subscription/cancel',
  [
    ...userIdParamValidation,
    body('cancelAtPeriodEnd').optional().isBoolean().withMessage('cancelAtPeriodEnd must be a boolean'),
  ],
  validate,
  cancelUserSubscriptionAdmin
);

router.post(
  '/users/:userId/credits/adjust',
  [
    ...userIdParamValidation,
    body('amount')
      .isInt()
      .withMessage('amount must be an integer')
      .custom((value) => Number(value) !== 0)
      .withMessage('amount must not be zero'),
    body('reason')
      .trim()
      .notEmpty()
      .withMessage('reason is required')
      .isLength({ max: 300 })
      .withMessage('reason must be at most 300 characters'),
    body('idempotencyKey').optional().isString().trim().isLength({ max: 200 }),
  ],
  validate,
  adjustUserCreditsAdmin
);

router.get(
  '/users/:userId/credits',
  [...userIdParamValidation, ...creditHistoryQueryValidation],
  validate,
  getUserCreditsAdmin
);

// B2C Billing troubleshooting (PR-BILL-8) — minimal admin-safe visibility + refund. No secrets, no raw webhook payload.
const orderIdParamValidation = [param('orderId').isMongoId().withMessage('Invalid order ID')];

router.get(
  '/payment-orders',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
    query('userId').optional().isMongoId().withMessage('userId must be a valid id'),
    query('status').optional().isString().trim(),
  ],
  validate,
  listPaymentOrdersAdmin
);

router.get('/payment-orders/:orderId', orderIdParamValidation, validate, getPaymentOrderAdmin);

router.get('/payment-orders/:orderId/reconcile', orderIdParamValidation, validate, reconcilePaymentOrderAdmin);

router.post(
  '/payment-orders/:orderId/refund',
  [
    ...orderIdParamValidation,
    body('amountPaise').optional().isInt({ min: 1 }).withMessage('amountPaise must be a positive integer'),
    body('reason').trim().notEmpty().withMessage('reason is required').isLength({ max: 300 }),
  ],
  validate,
  refundPaymentOrderAdmin
);

// Transactional email delivery visibility (PR-COMM-6) — masked recipient only.
const deliveryIdParamValidation = [param('deliveryId').isMongoId().withMessage('Invalid delivery ID')];

router.get(
  '/email-deliveries',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
    query('status').optional().isString().trim(),
    query('templateCode').optional().isString().trim(),
  ],
  validate,
  listEmailDeliveriesAdmin
);

router.get('/email-deliveries/:deliveryId', deliveryIdParamValidation, validate, getEmailDeliveryAdmin);

// Object storage orphan-metadata diagnostic (PR-STORAGE-5) — read-only, bounded, never deletes.
router.get('/storage/orphan-scan', runStorageOrphanScanAdmin);

// Organization (B2B) enterprise contracts + manual payments (PR-B2B-BILL-5) — global-admin-only, mirrors this
// router's existing `protect, authorize('admin')` guard above. Never deletes a contract/manual-payment row — status
// only ever flips (draft -> active -> expired/cancelled). Contract activation is idempotent: activating an
// already-active contract is rejected (CONTRACT_ALREADY_ACTIVE) rather than double-granting credits/subscription.
const orgIdParamValidation = [param('organizationId').isMongoId().withMessage('Invalid organization ID')];
const contractIdParamValidation = [param('contractId').isMongoId().withMessage('Invalid contract ID')];

router.post(
  '/organizations/:organizationId/contracts',
  [
    ...orgIdParamValidation,
    body('startDate').isISO8601().withMessage('startDate must be a valid date'),
    body('endDate').optional().isISO8601().withMessage('endDate must be a valid date'),
    body('billingModel').isIn(['prepaid', 'monthly', 'annual', 'custom']).withMessage('Invalid billingModel'),
    body('planCode').optional().isString().trim(),
    body('contractValueInrPaise').optional().isInt({ min: 0 }),
    body('creditAllowance').optional().isInt({ min: 0 }),
    body('renewalTerms').optional().isString().trim().isLength({ max: 1000 }),
    body('externalReference').optional().isString().trim().isLength({ max: 200 }),
  ],
  validate,
  createContractAdmin
);

router.get(
  '/organizations/:organizationId/contracts',
  [
    ...orgIdParamValidation,
    query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
  ],
  validate,
  listContractsAdmin
);

router.get(
  '/organizations/:organizationId/contracts/:contractId',
  [...orgIdParamValidation, ...contractIdParamValidation],
  validate,
  getContractAdmin
);

router.post(
  '/organizations/:organizationId/contracts/:contractId/activate',
  [...orgIdParamValidation, ...contractIdParamValidation],
  validate,
  activateContractAdmin
);

router.post(
  '/organizations/:organizationId/contracts/:contractId/expire',
  [...orgIdParamValidation, ...contractIdParamValidation],
  validate,
  expireContractAdmin
);

router.post(
  '/organizations/:organizationId/contracts/:contractId/cancel',
  [...orgIdParamValidation, ...contractIdParamValidation],
  validate,
  cancelContractAdmin
);

router.post(
  '/organizations/:organizationId/manual-payments',
  [
    ...orgIdParamValidation,
    body('method').isIn(['bank_transfer', 'invoice', 'offline', 'other']).withMessage('Invalid method'),
    body('amountPaise').isInt({ min: 1 }).withMessage('amountPaise must be a positive integer'),
    body('referenceNote').optional().isString().trim().isLength({ max: 300 }),
    body('paymentDate').isISO8601().withMessage('paymentDate must be a valid date'),
    body('contractId').optional().isMongoId().withMessage('Invalid contract ID'),
    body('notes').optional().isString().trim().isLength({ max: 1000 }),
  ],
  validate,
  recordManualPaymentAdmin
);

router.get(
  '/organizations/:organizationId/manual-payments',
  [
    ...orgIdParamValidation,
    query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
  ],
  validate,
  listManualPaymentsAdmin
);

// Generic persistent operational job visibility + manual retry (PR-OPS-1/2)
// — global-admin-only, mirrors this router's existing guard above. Retry
// only ever re-runs the SAME job row's existing type/payload — never
// accepts an arbitrary job type/payload from the request body.
const jobIdParamValidation = [param('jobId').isMongoId().withMessage('Invalid job ID')];

router.get(
  '/operational-jobs',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
    query('status')
      .optional()
      .isIn(['pending', 'active', 'completed', 'dead_letter', 'cancelled'])
      .withMessage('Invalid status'),
    query('jobType').optional().isIn(Object.values(OperationalJobType)).withMessage('Invalid jobType'),
  ],
  validate,
  listOperationalJobsAdmin
);

router.get('/operational-jobs/:jobId', jobIdParamValidation, validate, getOperationalJobAdmin);

router.post(
  '/operational-jobs/:jobId/retry',
  [...jobIdParamValidation, body('reason').optional().isString().trim().isLength({ max: 300 })],
  validate,
  retryOperationalJobAdmin
);

// Read-only privacy action audit visibility (PR-PRIVACY-5) — safe fields only.
router.get(
  '/privacy-audit',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
    query('action').optional().isString().trim(),
    query('status').optional().isString().trim(),
  ],
  validate,
  listPrivacyAuditAdmin
);

// Deeper ops diagnostics (PR-OPS-4) — DB ping + job-poller health + provider
// configured/not-configured flags. Never makes a live third-party network call.
router.get('/ops/diagnostics', getOpsDiagnosticsAdmin);

export default router;
