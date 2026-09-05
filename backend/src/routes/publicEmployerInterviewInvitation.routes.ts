import { Router } from 'express';
import { param } from 'express-validator';
import publicEmployerInterviewInvitationController from '../controllers/PublicEmployerInterviewInvitationController';
import { validate } from '../middleware/validation';

const router = Router();

// Raw token, base64url-encoded (crypto.randomBytes(32).toString('base64url'))
// — not a Mongo ID. Mirrors the existing organization-invitation token
// validator's shape (length bounds + charset), adjusted for base64url.
const tokenValidation = [
  param('token')
    .isString()
    .trim()
    .isLength({ min: 32, max: 128 })
    .matches(/^[A-Za-z0-9_-]+$/)
    .withMessage('Invalid invitation token'),
];

// GET /api/v1/public/employer-interview-invitations/:token — fully public,
// no auth, no organization RBAC. Never requires organization membership/JWT.
router.get('/:token', ...tokenValidation, validate, publicEmployerInterviewInvitationController.getInvitation);

// POST /api/v1/public/employer-interview-invitations/:token/accept — fully
// public, no auth, no organization RBAC.
router.post('/:token/accept', ...tokenValidation, validate, publicEmployerInterviewInvitationController.acceptInvitation);

// POST /api/v1/public/employer-interview-invitations/:token/session (20E)
// — creates exactly ONE hiring-assessment interview session for an
// ACCEPTED invitation. Fully public, no auth, no organization RBAC.
router.post('/:token/session', ...tokenValidation, validate, publicEmployerInterviewInvitationController.createSession);

// GET /api/v1/public/employer-interview-invitations/:token/session (20E)
// — returns the existing session summary, or null. Fully public.
router.get('/:token/session', ...tokenValidation, validate, publicEmployerInterviewInvitationController.getSession);

// POST /api/v1/public/employer-interview-invitations/:token/session/questions
// (21A) — materializes the session's final candidate-facing questions.
// Fully public, no auth, no organization RBAC.
router.post(
  '/:token/session/questions',
  ...tokenValidation,
  validate,
  publicEmployerInterviewInvitationController.createSessionQuestions
);

// GET /api/v1/public/employer-interview-invitations/:token/session/questions
// (21A) — returns the candidate-safe question list, or null. Fully public.
router.get(
  '/:token/session/questions',
  ...tokenValidation,
  validate,
  publicEmployerInterviewInvitationController.getSessionQuestions
);

export default router;
