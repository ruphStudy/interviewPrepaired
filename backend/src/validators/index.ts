import { body, param, ValidationChain } from 'express-validator';

export const createInterviewValidation: ValidationChain[] = [
  body('type')
    .isIn([
      'technical',
      'behavioral',
      'leadership',
      'managerial',
      'system-design',
      'coding',
      'product',
      'general',
    ])
    .withMessage('Invalid interview type'),
  body('difficulty')
    .isIn(['beginner', 'intermediate', 'advanced', 'expert'])
    .withMessage('Invalid difficulty level'),
  body('topic').trim().notEmpty().withMessage('Topic is required'),
  body('customInstructions').optional().isString(),
];

export const submitAnswerValidation: ValidationChain[] = [
  param('id').isMongoId().withMessage('Invalid interview ID'),
  body('questionId').notEmpty().withMessage('Question ID is required'),
  body('answer').trim().notEmpty().withMessage('Answer is required'),
  body('transcriptionConfidence')
    .isFloat({ min: 0, max: 1 })
    .withMessage('Transcription confidence must be between 0 and 1'),
  body('duration')
    .isInt({ min: 0 })
    .withMessage('Duration must be a positive integer'),
  body('audioUrl').optional().isURL().withMessage('Invalid audio URL'),
];

export const registerValidation: ValidationChain[] = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    ),
];

export const loginValidation: ValidationChain[] = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

export const updatePasswordValidation: ValidationChain[] = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      'New password must contain at least one uppercase letter, one lowercase letter, and one number'
    ),
];

export const mongoIdValidation: ValidationChain[] = [
  param('id').isMongoId().withMessage('Invalid ID'),
];
