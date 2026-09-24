import { Router } from 'express';
import { body, param } from 'express-validator';
import rateLimit from 'express-rate-limit';
import {
  register,
  login,
  logout,
  logoutAll,
  getMe,
  updateProfile,
  updatePassword,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
  verifyEmailCode,
} from '../controllers/auth.controller';
import { validate } from '../middleware/validation';
import { protect } from '../middleware/auth';
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from '../constants/authSecurity';

const router = Router();

const passwordValidation = (field: string, label: string) =>
  body(field)
    .trim()
    .isLength({ min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH })
    .withMessage(`${label} must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters`);

// Exported for focused unit testing of the consent-flag validation rules
// (PR-PRIVACY-5) without spinning up an HTTP server.
export const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Please provide a valid email'),
  passwordValidation('password', 'Password'),
  // PR-PRIVACY-4 — must be the literal boolean `true`, not merely truthy
  // ("on"/1/"true" strings are rejected), mirroring how other required-
  // boolean fields are validated elsewhere in this codebase.
  body('acceptedTerms')
    .exists({ checkFalsy: false })
    .withMessage('You must accept the Terms of Service to register')
    .isBoolean({ strict: true })
    .withMessage('acceptedTerms must be a boolean')
    .custom((value) => value === true)
    .withMessage('You must accept the Terms of Service to register'),
  body('acceptedPrivacyPolicy')
    .exists({ checkFalsy: false })
    .withMessage('You must accept the Privacy Policy to register')
    .isBoolean({ strict: true })
    .withMessage('acceptedPrivacyPolicy must be a boolean')
    .custom((value) => value === true)
    .withMessage('You must accept the Privacy Policy to register'),
];

const loginValidation = [
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password').notEmpty().withMessage('Password is required'),
];

const updatePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  passwordValidation('newPassword', 'New password'),
];

const forgotPasswordValidation = [
  body('email').isEmail().withMessage('Please provide a valid email'),
];

const resetPasswordValidation = [passwordValidation('password', 'Password')];

const verifyEmailValidation = [param('token').isString().trim().isLength({ min: 10, max: 512 }).withMessage('Invalid token')];

const verifyEmailCodeValidation = [
  body('code').isString().trim().matches(/^\d{6}$/).withMessage('Enter the 6-digit verification code'),
];

// Focused abuse protection per sensitive route — never rely on the global
// `/api` limiter alone. Every limiter here returns a generic message that
// never hints at account existence.
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many password reset requests. Please try again later.' },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please try again later.', code: 'TOO_MANY_LOGIN_ATTEMPTS' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many accounts created from this location. Please try again later.' },
});

const verifyEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many verification attempts. Please try again later.' },
});

const resendVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many verification email requests. Please try again later.' },
});

const verifyEmailCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many verification attempts. Please try again later.' },
});

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many reset attempts. Please try again later.' },
});

router.post('/register', registerLimiter, ...registerValidation, validate, register);
router.post('/login', loginLimiter, ...loginValidation, validate, login);
router.post('/logout', protect, logout);
router.post('/logout-all', protect, logoutAll);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.put(
  '/password',
  protect,
  ...updatePasswordValidation,
  validate,
  updatePassword
);
router.post('/forgot-password', forgotPasswordLimiter, ...forgotPasswordValidation, validate, forgotPassword);
router.put('/reset-password/:token', resetPasswordLimiter, resetPasswordValidation, validate, resetPassword);
router.get('/verify-email/:token', verifyEmailLimiter, verifyEmailValidation, validate, verifyEmail);
router.post('/resend-verification', resendVerificationLimiter, protect, resendVerification);
router.post('/verify-email-code', verifyEmailCodeLimiter, protect, ...verifyEmailCodeValidation, validate, verifyEmailCode);

export default router;
