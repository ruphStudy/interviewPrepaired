import { Router } from 'express';
import interviewController from '../controllers/InterviewController';
import { protect } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { body, param, query } from 'express-validator';

const router = Router();

// Validation rules
const startInterviewValidation = [
  body('topic')
    .notEmpty()
    .withMessage('Topic is required')
    .isString()
    .withMessage('Topic must be a string')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Topic must be between 2 and 100 characters'),
  body('difficulty')
    .notEmpty()
    .withMessage('Difficulty is required')
    .isIn(['beginner', 'intermediate', 'advanced', 'expert'])
    .withMessage('Invalid difficulty level'),
  body('experienceYears')
    .notEmpty()
    .withMessage('Experience years is required')
    .isInt({ min: 0, max: 50 })
    .withMessage('Experience years must be between 0 and 50'),
  body('totalQuestions')
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage('Total questions must be between 1 and 10'),
];

const submitAnswerValidation = [
  body('interviewId')
    .notEmpty()
    .withMessage('Interview ID is required')
    .isMongoId()
    .withMessage('Invalid interview ID'),
  body('answer')
    .notEmpty()
    .withMessage('Answer is required')
    .isString()
    .withMessage('Answer must be a string')
    .isLength({ min: 3, max: 5000 })
    .withMessage('Answer must be at least 3 characters'),

  body('duration')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Duration must be a positive number'),
];

const mongoIdValidation = [
  param('id')
    .notEmpty()
    .withMessage('ID is required')
    .isMongoId()
    .withMessage('Invalid ID format'),
];

const historyQueryValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('topic')
    .optional()
    .isIn([
      'Node.js',
      'Angular',
      'React',
      'MongoDB',
      'TypeScript',
      'System Design',
      'Team Lead',
      'Engineering Manager',
      'HR Interview',
    ])
    .withMessage('Invalid topic'),
  query('difficulty')
    .optional()
    .isIn(['beginner', 'intermediate', 'advanced', 'expert'])
    .withMessage('Invalid difficulty level'),
  query('status')
    .optional()
    .isIn(['created', 'in-progress', 'paused', 'completed', 'evaluated'])
    .withMessage('Invalid status'),
];

// Routes (all protected with authentication)

/**
 * POST /api/interview/start
 * Start a new interview session
 */
router.post(
  '/start',
  protect,
  ...startInterviewValidation,
  validate,
  interviewController.startInterview
);

/**
 * POST /api/interview/answer
 * Submit answer for current question
 */
router.post(
  '/answer',
  protect,
  ...submitAnswerValidation,
  validate,
  interviewController.submitAnswer
);

/**
 * GET /api/interview/report/:id
 * Get detailed interview report
 */
router.get(
  '/report/:id',
  protect,
  ...mongoIdValidation,
  validate,
  interviewController.getReport
);

/**
 * GET /api/interview/report/:id/pdf
 * Export interview report as PDF
 */
router.get(
  '/report/:id/pdf',
  protect,
  ...mongoIdValidation,
  validate,
  interviewController.exportPDF
);

/**
 * GET /api/interview/history
 * Get user's interview history with pagination and filters
 */
router.get(
  '/history',
  protect,
  ...historyQueryValidation,
  validate,
  interviewController.getHistory
);

/**
 * DELETE /api/interview/:id
 * Delete an interview
 */
router.delete(
  '/:id',
  protect,
  ...mongoIdValidation,
  validate,
  interviewController.deleteInterview
);

export default router;
