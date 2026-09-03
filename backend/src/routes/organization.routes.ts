import { Router } from 'express';
import { body, param, query } from 'express-validator';
import organizationController from '../controllers/OrganizationController';
import { protect } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { OrganizationType, OrganizationStatus, InstituteKind, CompanySize } from '../constants/organization';

const router = Router();

const CURRENT_YEAR = new Date().getFullYear();

// ============================================================================
// Shared field validators
// ============================================================================

const nameValidation = (optional: boolean) => {
  const chain = body('name');
  return (optional ? chain.optional() : chain.notEmpty().withMessage('Name is required'))
    .isString()
    .withMessage('Name must be a string')
    .trim()
    .isLength({ min: 1, max: 120 })
    .withMessage('Name must be between 1 and 120 characters');
};

const descriptionValidation = [
  body('description').optional().isString().trim().isLength({ max: 1000 }).withMessage('Description must be at most 1000 characters'),
];

const websiteValidation = [
  body('website').optional().isString().trim().isLength({ max: 300 }).withMessage('Website must be at most 300 characters'),
];

const logoUrlValidation = [
  body('logoUrl').optional().isString().trim().isLength({ max: 500 }).withMessage('logoUrl must be at most 500 characters'),
];

const contactValidation = [
  body('contactEmail').optional().isEmail().withMessage('contactEmail must be a valid email').isLength({ max: 254 }),
  body('contactPhone').optional().isString().trim().isLength({ max: 30 }).withMessage('contactPhone must be at most 30 characters'),
];

const settingsValidation = [
  body('settings').optional().isObject().withMessage('settings must be an object'),
  body('settings.timezone').optional().isString().trim().isLength({ max: 100 }).withMessage('settings.timezone must be at most 100 characters'),
];

const instituteProfileValidation = [
  body('instituteProfile').optional().isObject().withMessage('instituteProfile must be an object'),
  body('instituteProfile.instituteKind').optional().isIn(Object.values(InstituteKind)).withMessage('Invalid instituteKind'),
  body('instituteProfile.affiliation').optional().isString().trim().isLength({ max: 200 }),
  body('instituteProfile.accreditation').optional().isString().trim().isLength({ max: 200 }),
  body('instituteProfile.establishedYear')
    .optional()
    .isInt({ min: 1800, max: CURRENT_YEAR })
    .withMessage(`establishedYear must be between 1800 and ${CURRENT_YEAR}`),
  body('instituteProfile.studentCount').optional().isInt({ min: 0 }).withMessage('studentCount must be a non-negative integer'),
  // Cross-field: only meaningful on create, where `type` is in the same body.
  body('instituteProfile').custom((value, { req }) => {
    if (value !== undefined && req.body.type === OrganizationType.COMPANY) {
      throw new Error('instituteProfile is not allowed when type is "company"');
    }
    return true;
  }),
];

const companyProfileValidation = [
  body('companyProfile').optional().isObject().withMessage('companyProfile must be an object'),
  body('companyProfile.industry').optional().isString().trim().isLength({ max: 120 }),
  body('companyProfile.companySize').optional().isIn(Object.values(CompanySize)).withMessage('Invalid companySize'),
  body('companyProfile.establishedYear')
    .optional()
    .isInt({ min: 1800, max: CURRENT_YEAR })
    .withMessage(`establishedYear must be between 1800 and ${CURRENT_YEAR}`),
  body('companyProfile').custom((value, { req }) => {
    if (value !== undefined && req.body.type === OrganizationType.INSTITUTE) {
      throw new Error('companyProfile is not allowed when type is "institute"');
    }
    return true;
  }),
];

// Sensitive/immutable fields must never be silently ignored on update — an
// explicit attempt to send them is rejected, not dropped.
const rejectImmutableFieldsValidation = [
  body('ownerUserId').not().exists().withMessage('ownerUserId cannot be set'),
  body('slug').not().exists().withMessage('slug cannot be set directly'),
  body('type').not().exists().withMessage('type cannot be changed after creation'),
  body('status').not().exists().withMessage('status cannot be changed via this endpoint'),
];

const createValidation = [
  nameValidation(false),
  body('type').notEmpty().withMessage('type is required').isIn(Object.values(OrganizationType)).withMessage('Invalid organization type'),
  ...descriptionValidation,
  ...websiteValidation,
  ...logoUrlValidation,
  ...contactValidation,
  ...settingsValidation,
  ...instituteProfileValidation,
  ...companyProfileValidation,
];

const updateValidation = [
  ...rejectImmutableFieldsValidation,
  nameValidation(true),
  ...descriptionValidation,
  ...websiteValidation,
  ...logoUrlValidation,
  ...contactValidation,
  ...settingsValidation,
  // Profile/type cross-check for update is enforced service-side (against
  // the org's existing, immutable type) rather than here — `type` is never
  // present in an update body for these to compare against.
  body('instituteProfile').optional().isObject().withMessage('instituteProfile must be an object'),
  body('instituteProfile.instituteKind').optional().isIn(Object.values(InstituteKind)).withMessage('Invalid instituteKind'),
  body('instituteProfile.affiliation').optional().isString().trim().isLength({ max: 200 }),
  body('instituteProfile.accreditation').optional().isString().trim().isLength({ max: 200 }),
  body('instituteProfile.establishedYear').optional().isInt({ min: 1800, max: CURRENT_YEAR }),
  body('instituteProfile.studentCount').optional().isInt({ min: 0 }),
  body('companyProfile').optional().isObject().withMessage('companyProfile must be an object'),
  body('companyProfile.industry').optional().isString().trim().isLength({ max: 120 }),
  body('companyProfile.companySize').optional().isIn(Object.values(CompanySize)).withMessage('Invalid companySize'),
  body('companyProfile.establishedYear').optional().isInt({ min: 1800, max: CURRENT_YEAR }),
];

const idValidation = [param('id').isMongoId().withMessage('Invalid organization ID')];

const listValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('type').optional().isIn(Object.values(OrganizationType)).withMessage('Invalid organization type'),
  query('status').optional().isIn(Object.values(OrganizationStatus)).withMessage('Invalid organization status'),
];

// ============================================================================
// Routes — all owner-scoped; no membership/RBAC yet (Sprint 8)
// ============================================================================

router.post('/', protect, ...createValidation, validate, organizationController.createOrganization);

router.get('/', protect, ...listValidation, validate, organizationController.getOrganizations);

router.get('/:id', protect, ...idValidation, validate, organizationController.getOrganization);

router.put('/:id', protect, ...idValidation, ...updateValidation, validate, organizationController.updateOrganization);

router.delete('/:id', protect, ...idValidation, validate, organizationController.deleteOrganization);

export default router;
