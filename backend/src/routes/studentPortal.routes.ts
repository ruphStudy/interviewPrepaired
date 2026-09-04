import { Router } from 'express';
import { param, query } from 'express-validator';
import { protect } from '../middleware/auth';
import { validate } from '../middleware/validation';
import studentPortalController from '../controllers/StudentPortalController';
import { InstituteStudentInterviewAssignmentStatus } from '../constants/instituteStudentInterviewAssignment';

const router = Router();

router.use(protect);

const listAssignmentsValidation = [
  query('status').optional().isIn(Object.values(InstituteStudentInterviewAssignmentStatus)).withMessage('Invalid status'),
  query('organizationId').optional().isMongoId().withMessage('Invalid organization ID'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
];

const assignmentIdValidation = [param('assignmentId').isMongoId().withMessage('Invalid assignment ID')];

const historyValidation = [
  query('organizationId').optional().isMongoId().withMessage('Invalid organization ID'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
];

const readinessValidation = [query('organizationId').optional().isMongoId().withMessage('Invalid organization ID')];

router.get('/dashboard', studentPortalController.getDashboard);

router.get('/readiness', ...readinessValidation, validate, studentPortalController.getReadiness);

router.get('/history', ...historyValidation, validate, studentPortalController.getHistory);

router.get('/assignments', ...listAssignmentsValidation, validate, studentPortalController.getAssignments);

router.get(
  '/assignments/:assignmentId',
  ...assignmentIdValidation,
  validate,
  studentPortalController.getAssignmentDetail
);

router.post(
  '/assignments/:assignmentId/start',
  ...assignmentIdValidation,
  validate,
  studentPortalController.startAssignment
);

router.get(
  '/assignments/:assignmentId/session',
  ...assignmentIdValidation,
  validate,
  studentPortalController.getAssignmentSession
);

router.get(
  '/assignments/:assignmentId/result',
  ...assignmentIdValidation,
  validate,
  studentPortalController.getAssignmentResult
);

export default router;
