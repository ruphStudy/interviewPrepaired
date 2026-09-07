import { Router } from 'express';
import { param, body } from 'express-validator';
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

// (21B) Never trusts interviewId/questionId from the body — questionIndex is
// resolved against THIS session's own questions array server-side.
const submitAnswerValidation = [
  body('questionIndex').isInt({ min: 0 }).withMessage('questionIndex must be a non-negative integer'),
  body('answerText').isString().trim().isLength({ min: 1, max: 5000 }).withMessage('answerText is required (max 5000 characters)'),
  body('duration').optional().isFloat({ min: 0, max: 3600 }).withMessage('duration must be between 0 and 3600 seconds'),
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

// GET /api/v1/public/employer-interview-invitations/:token/session/assessment
// (21B) — candidate-safe progress + question list (own saved answers only).
router.get(
  '/:token/session/assessment',
  ...tokenValidation,
  validate,
  publicEmployerInterviewInvitationController.getAssessment
);

// POST /api/v1/public/employer-interview-invitations/:token/session/answers
// (21B) — saves exactly one answer. Fully public, no auth, no org RBAC.
router.post(
  '/:token/session/answers',
  ...tokenValidation,
  ...submitAnswerValidation,
  validate,
  publicEmployerInterviewInvitationController.submitAnswer
);

// POST /api/v1/public/employer-interview-invitations/:token/session/complete
// (21C) — explicit, hiring-specific completion (status-only, no evaluation).
router.post(
  '/:token/session/complete',
  ...tokenValidation,
  validate,
  publicEmployerInterviewInvitationController.completeSession
);

// (28D) Raw token, base64url — never a Mongo ID. Scenario execution is
// isolated from the standard Interview.questions flow entirely.
const scenarioIdValidation = [param('scenarioId').isMongoId().withMessage('Invalid scenario ID')];
const submitScenarioResponseValidation = [
  body('answerText').isString().trim().isLength({ min: 1, max: 5000 }).withMessage('answerText is required (max 5000 characters)'),
];

// GET /api/v1/public/employer-interview-invitations/:token/session/scenarios
// (28D) — candidate-safe list of READY scenarios for this exact interview.
router.get(
  '/:token/session/scenarios',
  ...tokenValidation,
  validate,
  publicEmployerInterviewInvitationController.getReadyScenarios
);

// GET /api/v1/public/employer-interview-invitations/:token/session/scenarios/:scenarioId
// (28D) — candidate-safe current scenario step. Starts the session idempotently.
router.get(
  '/:token/session/scenarios/:scenarioId',
  ...tokenValidation,
  ...scenarioIdValidation,
  validate,
  publicEmployerInterviewInvitationController.getCurrentScenarioStep
);

// POST /api/v1/public/employer-interview-invitations/:token/session/scenarios/:scenarioId
// (28D) — submits the candidate's response to the CURRENT step only. No AI runs here.
router.post(
  '/:token/session/scenarios/:scenarioId',
  ...tokenValidation,
  ...scenarioIdValidation,
  ...submitScenarioResponseValidation,
  validate,
  publicEmployerInterviewInvitationController.submitScenarioResponse
);

// (30B) Coding assessment session — NO execution. `codingQuestionId` is a
// Mongo ID; source code is opaque untrusted text bounded server-side.
const codingQuestionIdValidation = [param('codingQuestionId').isMongoId().withMessage('Invalid coding question ID')];
const codingSourceValidation = [
  body('language').isString().trim().isLength({ min: 1, max: 30 }).withMessage('language is required'),
  body('sourceCode').isString().isLength({ min: 1, max: 50_000 }).withMessage('sourceCode is required (max 50000 characters)'),
];

// GET /api/v1/public/employer-interview-invitations/:token/session/coding
// (30B) — candidate-safe coding question list + progress. Starts the
// session idempotently on first access. Fully public.
router.get('/:token/session/coding', ...tokenValidation, validate, publicEmployerInterviewInvitationController.getCodingSession);

// PUT /api/v1/public/employer-interview-invitations/:token/session/coding/:codingQuestionId/draft
// (30B) — saves/upserts the candidate's current draft. NO execution.
router.put(
  '/:token/session/coding/:codingQuestionId/draft',
  ...tokenValidation,
  ...codingQuestionIdValidation,
  ...codingSourceValidation,
  validate,
  publicEmployerInterviewInvitationController.saveCodingDraft
);

// POST /api/v1/public/employer-interview-invitations/:token/session/coding/:codingQuestionId/submit
// (30B) — persists an immutable submitted attempt. NO execution yet (30C).
router.post(
  '/:token/session/coding/:codingQuestionId/submit',
  ...tokenValidation,
  ...codingQuestionIdValidation,
  ...codingSourceValidation,
  validate,
  publicEmployerInterviewInvitationController.submitCodingSubmission
);

export default router;
