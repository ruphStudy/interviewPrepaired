import { Router } from 'express';
import { param, query } from 'express-validator';
import { protect } from '../middleware/auth';
import { validate } from '../middleware/validation';
import candidatePortalController from '../controllers/CandidatePortalController';

const router = Router();

router.use(protect);

const CANDIDATE_PORTAL_STATUSES = ['invited', 'in_progress', 'completed', 'expired', 'closed'];

const listAssessmentsValidation = [
  query('organizationId').optional().isMongoId().withMessage('Invalid organization ID'),
  query('status').optional().isIn(CANDIDATE_PORTAL_STATUSES).withMessage('Invalid status'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
];

const historyValidation = [
  query('organizationId').optional().isMongoId().withMessage('Invalid organization ID'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
];

const invitationIdValidation = [param('invitationId').isMongoId().withMessage('Invalid assessment ID')];

router.get('/dashboard', candidatePortalController.getDashboard);

router.get('/assessments', ...listAssessmentsValidation, validate, candidatePortalController.listAssessments);

router.get('/assessments/:invitationId', ...invitationIdValidation, validate, candidatePortalController.getAssessmentDetail);

router.get('/history', ...historyValidation, validate, candidatePortalController.getHistory);

export default router;
