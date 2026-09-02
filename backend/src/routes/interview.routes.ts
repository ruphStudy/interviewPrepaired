import { Router } from 'express';
import multer from 'multer';
import interviewController from '../controllers/InterviewController';
import { protect } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { body, param, query } from 'express-validator';
import { SUPPORTED_LANGUAGE_CODES } from '../config/languages';
import { InterviewStyle } from '../services/OpenAIService';
import { InterviewStatus } from '../constants/interview';

const router = Router();

// Uploaded question-file parsing — memory storage only, file is parsed and
// discarded, never written to disk.
const questionFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.txt', '.csv', '.docx', '.pdf'];
    const ext = file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase();
    if (!allowed.includes(ext)) {
      cb(new Error(`Unsupported file type "${ext}". Supported types: .txt, .csv, .docx, .pdf`));
      return;
    }
    cb(null, true);
  },
});

// Validation rules
const isUploadedMode = (_value: unknown, { req }: { req: any }) => req.body.interviewMode !== 'uploaded';

const startInterviewValidation = [
  body('topic')
    .if(isUploadedMode)
    .notEmpty()
    .withMessage('Topic is required')
    .isString()
    .withMessage('Topic must be a string')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Topic must be between 2 and 100 characters'),
  body('difficulty')
    .if(isUploadedMode)
    .notEmpty()
    .withMessage('Difficulty is required')
    .isIn(['beginner', 'intermediate', 'advanced', 'expert'])
    .withMessage('Invalid difficulty level'),
  body('experienceYears')
    .if(isUploadedMode)
    .notEmpty()
    .withMessage('Experience years is required')
    .isInt({ min: 0, max: 50 })
    .withMessage('Experience years must be between 0 and 50'),
  body('questions')
    .if((_value, { req }) => req.body.interviewMode === 'uploaded')
    .isArray({ min: 1 })
    .withMessage('At least 1 question is required for uploaded interview mode'),
  body('totalQuestions')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Total questions must be a positive integer')
    .custom((value, { req }) => {
      // AI-generated interviews stay capped at 10; uploaded-mode interviews
      // may use up to MAX_UPLOADED_QUESTIONS (kept in sync with
      // InterviewService's own limit) since the candidate may want to
      // practice a full uploaded set larger than 10 questions.
      const max = req.body.interviewMode === 'uploaded' ? 200 : 10;
      if (Number(value) > max) {
        throw new Error(`Total questions must be at most ${max}`);
      }
      return true;
    }),
  body('shuffleQuestions')
    .optional()
    .isBoolean()
    .withMessage('shuffleQuestions must be a boolean'),
  body('interviewLanguage')
    .optional()
    .isIn(SUPPORTED_LANGUAGE_CODES)
    .withMessage(`Interview language must be one of: ${SUPPORTED_LANGUAGE_CODES.join(', ')}`),
  body('interviewStyle')
    .optional()
    .isIn(Object.values(InterviewStyle))
    .withMessage(`Interview style must be one of: ${Object.values(InterviewStyle).join(', ')}`),
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
    .isIn(Object.values(InterviewStatus))
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
 * GET /api/interview/:id/session
 * Backend recovery — resume an existing IN_PROGRESS interview after a
 * refresh/reopen. Reads persisted state only; no AI calls, no credit activity.
 */
router.get(
  '/:id/session',
  protect,
  ...mongoIdValidation,
  validate,
  interviewController.getSession
);

/**
 * POST /api/interview/parse-question-file
 * Parse an uploaded question file (TXT/CSV/DOCX/PDF) into a preview list.
 * Preview only — does NOT create an interview.
 */
router.post(
  '/parse-question-file',
  protect,
  questionFileUpload.single('file'),
  interviewController.parseQuestionFile
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
 * GET /api/interview/stats
 * Get user's interview statistics
 */
router.get(
  '/stats',
  protect,
  interviewController.getStats
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
