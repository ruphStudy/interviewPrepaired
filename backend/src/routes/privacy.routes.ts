import { Router } from 'express';
import { body, param } from 'express-validator';
import rateLimit from 'express-rate-limit';
import {
  requestExport,
  listExports,
  getExport,
  deleteAccount,
  getConsent,
  getPolicyConfig,
} from '../controllers/privacy.controller';
import { protect } from '../middleware/auth';
import { validate } from '../middleware/validation';

const router = Router();

const requestIdValidation = [param('requestId').isMongoId().withMessage('Invalid export request ID')];

const deleteAccountValidation = [
  body('confirmation').equals('DELETE').withMessage('Type DELETE to confirm account deletion'),
  body('currentPassword').notEmpty().withMessage('Current password is required'),
];

// Focused abuse protection — account deletion is a highly sensitive,
// re-auth-gated mutation.
const deleteAccountLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many account deletion attempts. Please try again later.' },
});

const exportRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many data export requests. Please try again later.' },
});

// Fully public — used by the registration page and privacy settings page
// to render Terms/Privacy Policy links without leaking anything sensitive.
router.get('/policy-config', getPolicyConfig);

router.use(protect);

router.post('/export', exportRequestLimiter, requestExport);
router.get('/export', listExports);
router.get('/export/:requestId', ...requestIdValidation, validate, getExport);

router.get('/consent', getConsent);

router.post('/delete-account', deleteAccountLimiter, ...deleteAccountValidation, validate, deleteAccount);

export default router;
