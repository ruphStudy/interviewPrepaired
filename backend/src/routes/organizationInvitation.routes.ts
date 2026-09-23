import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { param, body } from 'express-validator';
import organizationInvitationController from '../controllers/OrganizationInvitationController';
import { protect } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from '../constants/authSecurity';

const router = Router();

// Raw token, not a Mongo ID — 64 lowercase hex chars (crypto.randomBytes(32).toString('hex')).
const tokenValidation = [
  param('token').isString().trim().isLength({ min: 32, max: 128 }).matches(/^[a-f0-9]+$/).withMessage('Invalid invitation token'),
];

const activateValidation = [
  ...tokenValidation,
  body('password')
    .isLength({ min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH })
    .withMessage(`Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters`),
];

// Sets a real password on an unauthenticated request (guarded only by the
// invitation token) — same abuse-protection posture as /auth/reset-password.
const activateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many activation attempts. Please try again later.' },
});

// GET /api/v1/organization-invitations/:token — public, no auth. Lets a
// not-yet-registered invitee preview what they're accepting.
router.get('/:token', ...tokenValidation, validate, organizationInvitationController.getInvitationByToken);

// POST /api/v1/organization-invitations/:token/accept — requires the
// invitee to be authenticated with the exact email the invite was sent to.
router.post('/:token/accept', protect, ...tokenValidation, validate, organizationInvitationController.acceptInvitation);

// POST /api/v1/organization-invitations/:token/activate — public, no auth
// (D2). Only for a NEW Super-Admin-provisioned OWNER invitation; see
// OrganizationInvitationController.activateOwnerAccount.
router.post(
  '/:token/activate',
  activateLimiter,
  ...activateValidation,
  validate,
  organizationInvitationController.activateOwnerAccount
);

export default router;
