import { Router } from 'express';
import { body, param, query } from 'express-validator';
import questionSetController from '../controllers/QuestionSetController';
import { protect } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { MAX_UPLOADED_QUESTIONS } from '../constants/interview';

const router = Router();

// Applies to whichever "questions" field is present in the body — a no-op
// wildcard match when the field is absent (e.g. a name-only update).
const questionItemsValidation = [
  body('questions.*.questionText')
    .isString()
    .withMessage('Each question requires questionText as a string')
    .notEmpty()
    .withMessage('Each question requires non-empty questionText'),
  body('questions.*.referenceAnswer')
    .optional()
    .isString()
    .withMessage('referenceAnswer must be a string'),
];

const nameValidation = (optional: boolean) => {
  const chain = body('name');
  return (optional ? chain.optional() : chain.notEmpty().withMessage('Name is required'))
    .isString()
    .withMessage('Name must be a string')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters');
};

const descriptionValidation = [
  body('description')
    .optional()
    .isString()
    .withMessage('Description must be a string')
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be at most 500 characters'),
];

const createValidation = [
  nameValidation(false),
  ...descriptionValidation,
  body('questions')
    .isArray({ min: 1, max: MAX_UPLOADED_QUESTIONS })
    .withMessage(`questions must be an array of 1 to ${MAX_UPLOADED_QUESTIONS} items`),
  ...questionItemsValidation,
];

const updateValidation = [
  nameValidation(true),
  ...descriptionValidation,
  body('questions')
    .optional()
    .isArray({ min: 1, max: MAX_UPLOADED_QUESTIONS })
    .withMessage(`questions must be an array of 1 to ${MAX_UPLOADED_QUESTIONS} items`),
  ...questionItemsValidation,
];

const idValidation = [param('id').isMongoId().withMessage('Invalid question set ID')];

const listValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
];

/**
 * POST /api/v1/question-sets
 * Create a reusable manual question set.
 */
router.post('/', protect, ...createValidation, validate, questionSetController.createQuestionSet);

/**
 * GET /api/v1/question-sets
 * List the authenticated user's own question sets.
 */
router.get('/', protect, ...listValidation, validate, questionSetController.getQuestionSets);

/**
 * GET /api/v1/question-sets/:id
 */
router.get('/:id', protect, ...idValidation, validate, questionSetController.getQuestionSet);

/**
 * PUT /api/v1/question-sets/:id
 */
router.put('/:id', protect, ...idValidation, ...updateValidation, validate, questionSetController.updateQuestionSet);

/**
 * DELETE /api/v1/question-sets/:id
 */
router.delete('/:id', protect, ...idValidation, validate, questionSetController.deleteQuestionSet);

export default router;
