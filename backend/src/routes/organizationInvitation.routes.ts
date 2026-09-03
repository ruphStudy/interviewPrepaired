import { Router } from 'express';
import { param } from 'express-validator';
import organizationInvitationController from '../controllers/OrganizationInvitationController';
import { protect } from '../middleware/auth';
import { validate } from '../middleware/validation';

const router = Router();

// Raw token, not a Mongo ID — 64 lowercase hex chars (crypto.randomBytes(32).toString('hex')).
const tokenValidation = [
  param('token').isString().trim().isLength({ min: 32, max: 128 }).matches(/^[a-f0-9]+$/).withMessage('Invalid invitation token'),
];

// GET /api/v1/organization-invitations/:token — public, no auth. Lets a
// not-yet-registered invitee preview what they're accepting.
router.get('/:token', ...tokenValidation, validate, organizationInvitationController.getInvitationByToken);

// POST /api/v1/organization-invitations/:token/accept — requires the
// invitee to be authenticated with the exact email the invite was sent to.
router.post('/:token/accept', protect, ...tokenValidation, validate, organizationInvitationController.acceptInvitation);

export default router;
