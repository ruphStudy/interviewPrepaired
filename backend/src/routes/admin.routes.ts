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
} from '../controllers/admin.controller';
import { protect, authorize } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { PlanCode } from '../constants/subscription';

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

export default router;
