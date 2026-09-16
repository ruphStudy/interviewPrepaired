import { Router } from 'express';
import multer from 'multer';
import interviewController from '../controllers/InterviewController';
import { protect, requireVerifiedEmail } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { body, param, query } from 'express-validator';
import { SUPPORTED_LANGUAGE_CODES } from '../config/languages';
import { InterviewStyle } from '../services/OpenAIService';
import { InterviewStatus, MAX_UPLOADED_QUESTIONS } from '../constants/interview';

const router = Router();

const questionFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
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
    .if((_value, { req }) => req.body.interviewMode === 'uploaded' && !req.body.questionSetId)
    .isArray({ min: 1 })
    .withMessage('At least 1 question is required when questionSetId is not provided'),
  body('questionSetId')
    .optional()
    .isMongoId()
    .withMessage('Invalid questionSetId')
    .custom((_value, { req }) => {
      if (req.body.interviewMode !== 'uploaded') throw new Error('questionSetId is only supported for uploaded interview mode');
      if (Array.isArray(req.body.questions) && req.body.questions.length > 0) {
        throw new Error('Provide either questions or questionSetId, not both');
      }
      return true;
    }),
  body('totalQuestions')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Total questions must be a positive integer')
    .custom((value, { req }) => {
      const max = req.body.interviewMode === 'uploaded' ? MAX_UPLOADED_QUESTIONS : 10;
      if (Number(value) > max) throw new Error(`Total questions must be at most ${max}`);
      return true;
    }),
  body('shuffleQuestions').optional().isBoolean().withMessage('shuffleQuestions must be a boolean'),
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
    .withMessage('Answer must be between 3 and 5000 characters'),
  body('duration').optional().isInt({ min: 0 }).withMessage('Duration must be a positive number'),
  // New clients send the displayed question number so retries after a lost
  // response can be matched to the exact persisted question. Optional keeps
  // old clients/backward compatibility working through the existing path.
  body('questionNumber')
    .optional()
    .isInt({ min: 1, max: MAX_UPLOADED_QUESTIONS })
    .withMessage('Question number must be a valid positive integer'),
];

const mongoIdValidation = [
  param('id').notEmpty().withMessage('ID is required').isMongoId().withMessage('Invalid ID format'),
];

const historyQueryValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
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
  query('status').optional().isIn(Object.values(InterviewStatus)).withMessage('Invalid status'),
];

router.post('/start', protect, requireVerifiedEmail, ...startInterviewValidation, validate, interviewController.startInterview);

router.get('/:id/session', protect, ...mongoIdValidation, validate, interviewController.getSession);

router.post('/parse-question-file', protect, questionFileUpload.single('file'), interviewController.parseQuestionFile);

router.post('/answer', protect, ...submitAnswerValidation, validate, interviewController.submitAnswer);

router.get('/report/:id', protect, ...mongoIdValidation, validate, interviewController.getReport);

router.get('/report/:id/pdf', protect, ...mongoIdValidation, validate, interviewController.exportPDF);

router.get('/history', protect, ...historyQueryValidation, validate, interviewController.getHistory);

router.get('/stats', protect, interviewController.getStats);

router.delete('/:id', protect, ...mongoIdValidation, validate, interviewController.deleteInterview);

export default router;
