import { Router } from 'express';
import { body, param, query } from 'express-validator';
import organizationController from '../controllers/OrganizationController';
import organizationMemberController from '../controllers/OrganizationMemberController';
import organizationInvitationController from '../controllers/OrganizationInvitationController';
import organizationDashboardController from '../controllers/OrganizationDashboardController';
import instituteBranchController from '../controllers/InstituteBranchController';
import instituteCourseController from '../controllers/InstituteCourseController';
import { protect } from '../middleware/auth';
import { requireOrganizationPermission } from '../middleware/organizationAccess';
import { validate } from '../middleware/validation';
import {
  OrganizationType,
  OrganizationStatus,
  InstituteKind,
  CompanySize,
  OrganizationDateFormat,
  OrganizationTimeFormat,
} from '../constants/organization';
import { OrganizationMemberRole, OrganizationMemberStatus } from '../constants/organizationMember';
import { OrganizationPermission } from '../constants/organizationPermissions';
import { OrganizationInvitationStatus } from '../constants/organizationInvitation';
import { InstituteBranchStatus } from '../constants/instituteBranch';
import { InstituteCourseStatus } from '../constants/instituteCourse';
import { SUPPORTED_LANGUAGE_CODES } from '../config/languages';

// Client-assignable roles — OWNER can never be assigned via this API; it
// only ever mirrors Organization.ownerUserId (see ensureOwnerMembership).
const ASSIGNABLE_MEMBER_ROLES = [
  OrganizationMemberRole.ADMIN,
  OrganizationMemberRole.TRAINER,
  OrganizationMemberRole.RECRUITER,
  OrganizationMemberRole.MEMBER,
];

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

// ============================================================================
// Settings validators (9B) — flat body, no nested `settings` wrapper (the
// endpoint itself is already /settings). Only known fields accepted; at
// least one must be present.
// ============================================================================

const SETTINGS_FIELD_KEYS = ['timezone', 'locale', 'dateFormat', 'timeFormat', 'defaultInterviewLanguage'];

const updateSettingsValidation = [
  body('timezone')
    .optional()
    .isString()
    .withMessage('timezone must be a string')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('timezone must be between 1 and 100 characters')
    .custom((value: string) => {
      try {
        // eslint-disable-next-line no-new
        new Intl.DateTimeFormat(undefined, { timeZone: value });
        return true;
      } catch {
        throw new Error('Invalid timezone');
      }
    }),
  body('locale').optional().isString().withMessage('locale must be a string').trim().isLength({ min: 1, max: 20 }).withMessage('locale must be between 1 and 20 characters'),
  body('dateFormat')
    .optional()
    .isIn(Object.values(OrganizationDateFormat))
    .withMessage(`dateFormat must be one of: ${Object.values(OrganizationDateFormat).join(', ')}`),
  body('timeFormat')
    .optional()
    .isIn(Object.values(OrganizationTimeFormat))
    .withMessage(`timeFormat must be one of: ${Object.values(OrganizationTimeFormat).join(', ')}`),
  body('defaultInterviewLanguage')
    .optional()
    .isIn(SUPPORTED_LANGUAGE_CODES)
    .withMessage(`defaultInterviewLanguage must be one of: ${SUPPORTED_LANGUAGE_CODES.join(', ')}`),
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Request body must be an object');
    }
    const keys = Object.keys(value);
    const unknownKeys = keys.filter((key) => !SETTINGS_FIELD_KEYS.includes(key));
    if (unknownKeys.length > 0) {
      throw new Error(`Unknown setting field(s): ${unknownKeys.join(', ')}`);
    }
    if (keys.length === 0) {
      throw new Error('At least one setting field is required');
    }
    return true;
  }),
];

// ============================================================================
// Institute profile validators (10A) — flat body, no nested `instituteProfile`
// wrapper (the endpoint itself is already /institute-profile). Only known
// fields accepted; at least one must be present. instituteCode is
// deliberately NOT unique — different institutions/states may reuse codes.
// ============================================================================

const INSTITUTE_PROFILE_FIELD_KEYS = [
  'instituteKind',
  'officialName',
  'instituteCode',
  'affiliation',
  'accreditation',
  'universityName',
  'establishedYear',
  'studentCount',
  'description',
  'website',
  'placementEmail',
  'placementPhone',
];

const updateInstituteProfileValidation = [
  body('instituteKind').optional().isIn(Object.values(InstituteKind)).withMessage('Invalid instituteKind'),
  body('officialName')
    .optional()
    .isString()
    .withMessage('officialName must be a string')
    .trim()
    .isLength({ max: 200 })
    .withMessage('officialName must be at most 200 characters'),
  body('instituteCode')
    .optional()
    .isString()
    .withMessage('instituteCode must be a string')
    .trim()
    .isLength({ max: 50 })
    .withMessage('instituteCode must be at most 50 characters'),
  body('affiliation').optional().isString().trim().isLength({ max: 200 }).withMessage('affiliation must be at most 200 characters'),
  body('accreditation').optional().isString().trim().isLength({ max: 200 }).withMessage('accreditation must be at most 200 characters'),
  body('universityName')
    .optional()
    .isString()
    .withMessage('universityName must be a string')
    .trim()
    .isLength({ max: 200 })
    .withMessage('universityName must be at most 200 characters'),
  body('establishedYear')
    .optional()
    .isInt({ min: 1800, max: CURRENT_YEAR })
    .withMessage(`establishedYear must be between 1800 and ${CURRENT_YEAR}`),
  body('studentCount').optional().isInt({ min: 0 }).withMessage('studentCount must be a non-negative integer'),
  body('description').optional().isString().trim().isLength({ max: 1500 }).withMessage('description must be at most 1500 characters'),
  body('website').optional().isString().trim().isLength({ max: 300 }).withMessage('website must be at most 300 characters'),
  body('placementEmail').optional().isEmail().withMessage('placementEmail must be a valid email').isLength({ max: 254 }),
  body('placementPhone').optional().isString().trim().isLength({ max: 30 }).withMessage('placementPhone must be at most 30 characters'),
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Request body must be an object');
    }
    const keys = Object.keys(value);
    const unknownKeys = keys.filter((key) => !INSTITUTE_PROFILE_FIELD_KEYS.includes(key));
    if (unknownKeys.length > 0) {
      throw new Error(`Unknown institute profile field(s): ${unknownKeys.join(', ')}`);
    }
    if (keys.length === 0) {
      throw new Error('At least one institute profile field is required');
    }
    return true;
  }),
];

// ============================================================================
// Institute branch validators (10B) — institute-only sub-resource. `status`
// is never a body-mutable field (rejected explicitly on create/update) —
// DELETE is the only status transition (soft deactivate); `status` remains a
// valid list-query filter.
// ============================================================================

const branchIdValidation = [param('branchId').isMongoId().withMessage('Invalid branch ID')];

const listBranchesValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(Object.values(InstituteBranchStatus)).withMessage('Invalid status'),
];

const BRANCH_FIELD_KEYS = [
  'name',
  'code',
  'addressLine1',
  'addressLine2',
  'city',
  'state',
  'country',
  'postalCode',
  'contactEmail',
  'contactPhone',
];

const rejectBranchImmutableFieldsValidation = [
  body('organizationId').not().exists().withMessage('organizationId cannot be set'),
  body('status').not().exists().withMessage('status cannot be changed directly — use DELETE to deactivate a branch'),
];

const branchOptionalFieldValidators = [
  body('code').optional().isString().withMessage('code must be a string').trim().isLength({ max: 50 }).withMessage('code must be at most 50 characters'),
  body('addressLine1').optional().isString().trim().isLength({ max: 200 }).withMessage('addressLine1 must be at most 200 characters'),
  body('addressLine2').optional().isString().trim().isLength({ max: 200 }).withMessage('addressLine2 must be at most 200 characters'),
  body('city').optional().isString().trim().isLength({ max: 100 }).withMessage('city must be at most 100 characters'),
  body('state').optional().isString().trim().isLength({ max: 100 }).withMessage('state must be at most 100 characters'),
  body('country').optional().isString().trim().isLength({ max: 100 }).withMessage('country must be at most 100 characters'),
  body('postalCode').optional().isString().trim().isLength({ max: 20 }).withMessage('postalCode must be at most 20 characters'),
  body('contactEmail').optional().isEmail().withMessage('contactEmail must be a valid email').isLength({ max: 254 }),
  body('contactPhone').optional().isString().trim().isLength({ max: 30 }).withMessage('contactPhone must be at most 30 characters'),
];

const createBranchValidation = [
  ...rejectBranchImmutableFieldsValidation,
  body('name')
    .notEmpty()
    .withMessage('name is required')
    .isString()
    .withMessage('name must be a string')
    .trim()
    .isLength({ min: 1, max: 150 })
    .withMessage('name must be between 1 and 150 characters'),
  ...branchOptionalFieldValidators,
];

const updateBranchValidation = [
  ...rejectBranchImmutableFieldsValidation,
  body('name')
    .optional()
    .isString()
    .withMessage('name must be a string')
    .trim()
    .isLength({ min: 1, max: 150 })
    .withMessage('name must be between 1 and 150 characters'),
  ...branchOptionalFieldValidators,
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Request body must be an object');
    }
    const keys = Object.keys(value);
    const unknownKeys = keys.filter((key) => !BRANCH_FIELD_KEYS.includes(key));
    if (unknownKeys.length > 0) {
      throw new Error(`Unknown branch field(s): ${unknownKeys.join(', ')}`);
    }
    if (keys.length === 0) {
      throw new Error('At least one field is required');
    }
    return true;
  }),
];

// ============================================================================
// Institute course validators (10C) — institute-only sub-resource, mirrors
// the branch validators. `status` is never body-mutable (DELETE is the only
// status transition); `branchId` accepts `null` to clear the association —
// service-side revalidates any non-null branchId against the same organization.
// ============================================================================

const courseIdValidation = [param('courseId').isMongoId().withMessage('Invalid course ID')];

const listCoursesValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(Object.values(InstituteCourseStatus)).withMessage('Invalid status'),
  query('branchId').optional().isMongoId().withMessage('Invalid branch ID'),
];

const COURSE_FIELD_KEYS = ['name', 'branchId', 'code', 'description', 'durationMonths'];

const rejectCourseImmutableFieldsValidation = [
  body('organizationId').not().exists().withMessage('organizationId cannot be set'),
  body('status').not().exists().withMessage('status cannot be changed directly — use DELETE to deactivate a course'),
];

const courseOptionalFieldValidators = [
  body('branchId').optional({ nullable: true }).isMongoId().withMessage('branchId must be a valid ID'),
  body('code').optional().isString().withMessage('code must be a string').trim().isLength({ max: 50 }).withMessage('code must be at most 50 characters'),
  body('description').optional().isString().trim().isLength({ max: 1000 }).withMessage('description must be at most 1000 characters'),
  body('durationMonths').optional().isInt({ min: 1 }).withMessage('durationMonths must be a positive integer'),
];

const createCourseValidation = [
  ...rejectCourseImmutableFieldsValidation,
  body('name')
    .notEmpty()
    .withMessage('name is required')
    .isString()
    .withMessage('name must be a string')
    .trim()
    .isLength({ min: 1, max: 150 })
    .withMessage('name must be between 1 and 150 characters'),
  ...courseOptionalFieldValidators,
];

const updateCourseValidation = [
  ...rejectCourseImmutableFieldsValidation,
  body('name')
    .optional()
    .isString()
    .withMessage('name must be a string')
    .trim()
    .isLength({ min: 1, max: 150 })
    .withMessage('name must be between 1 and 150 characters'),
  ...courseOptionalFieldValidators,
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Request body must be an object');
    }
    const keys = Object.keys(value);
    const unknownKeys = keys.filter((key) => !COURSE_FIELD_KEYS.includes(key));
    if (unknownKeys.length > 0) {
      throw new Error(`Unknown course field(s): ${unknownKeys.join(', ')}`);
    }
    if (keys.length === 0) {
      throw new Error('At least one field is required');
    }
    return true;
  }),
];

const listValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('type').optional().isIn(Object.values(OrganizationType)).withMessage('Invalid organization type'),
  query('status').optional().isIn(Object.values(OrganizationStatus)).withMessage('Invalid organization status'),
];

// ============================================================================
// Member validators (8B) — owner-only management, no invitations/RBAC yet
// ============================================================================

const organizationIdValidation = [param('organizationId').isMongoId().withMessage('Invalid organization ID')];
const memberIdValidation = [param('memberId').isMongoId().withMessage('Invalid member ID')];

const listMembersValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  // Full role enum (including owner) is fine for filtering a list.
  query('role').optional().isIn(Object.values(OrganizationMemberRole)).withMessage('Invalid role'),
  query('status').optional().isIn(Object.values(OrganizationMemberStatus)).withMessage('Invalid status'),
];

const addMemberValidation = [
  body('userId').notEmpty().withMessage('userId is required').isMongoId().withMessage('userId must be a valid ID'),
  body('role')
    .notEmpty()
    .withMessage('role is required')
    .isIn(ASSIGNABLE_MEMBER_ROLES)
    .withMessage(`role must be one of: ${ASSIGNABLE_MEMBER_ROLES.join(', ')}`),
];

const updateMemberValidation = [
  // Identity fields are never accepted on update — reject, don't silently ignore.
  body('userId').not().exists().withMessage('userId cannot be changed'),
  body('organizationId').not().exists().withMessage('organizationId cannot be changed'),
  body('joinedAt').not().exists().withMessage('joinedAt cannot be set directly'),
  body('role')
    .optional()
    .isIn(ASSIGNABLE_MEMBER_ROLES)
    .withMessage(`role must be one of: ${ASSIGNABLE_MEMBER_ROLES.join(', ')}`),
  body('status')
    .optional()
    .isIn(Object.values(OrganizationMemberStatus))
    .withMessage(`status must be one of: ${Object.values(OrganizationMemberStatus).join(', ')}`),
  body().custom((value) => {
    if (value?.role === undefined && value?.status === undefined) {
      throw new Error('At least one of role or status is required');
    }
    return true;
  }),
];

// ============================================================================
// Invitation validators (8E) — MEMBERS_MANAGE-gated, same as member mutation.
// ============================================================================

const invitationIdValidation = [param('invitationId').isMongoId().withMessage('Invalid invitation ID')];

const createInvitationValidation = [
  body('email').notEmpty().withMessage('email is required').isEmail().withMessage('email must be valid').isLength({ max: 254 }),
  body('role')
    .notEmpty()
    .withMessage('role is required')
    .isIn(ASSIGNABLE_MEMBER_ROLES)
    .withMessage(`role must be one of: ${ASSIGNABLE_MEMBER_ROLES.join(', ')}`),
];

const listInvitationsValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(Object.values(OrganizationInvitationStatus)).withMessage('Invalid status'),
  // Owner is deliberately excluded — invitations can never target the owner role.
  query('role').optional().isIn(ASSIGNABLE_MEMBER_ROLES).withMessage(`role must be one of: ${ASSIGNABLE_MEMBER_ROLES.join(', ')}`),
];

// ============================================================================
// Routes — POST/GET (list) stay owner-created-only (unchanged from 7D/8B).
// GET/PUT :id and all member routes are RBAC-protected (8D): trusted
// organization context is resolved from the route param only, never
// body/query/header. DELETE :id stays owner-only on purpose (archival is an
// owner lifecycle action, not covered by ORGANIZATION_UPDATE).
// ============================================================================

router.post('/', protect, ...createValidation, validate, organizationController.createOrganization);

router.get('/', protect, ...listValidation, validate, organizationController.getOrganizations);

router.get(
  '/:id',
  protect,
  ...idValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW, { paramName: 'id' }),
  organizationController.getOrganization
);

router.put(
  '/:id',
  protect,
  ...idValidation,
  ...updateValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_UPDATE, { paramName: 'id' }),
  organizationController.updateOrganization
);

router.delete('/:id', protect, ...idValidation, validate, organizationController.deleteOrganization);

// ---- Dashboard (9A) — read-only, persisted-data snapshot. Any active member with ORGANIZATION_VIEW. ----

router.get(
  '/:organizationId/dashboard',
  protect,
  ...organizationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  organizationDashboardController.getDashboard
);

// ---- Settings (9B) — generic, foundational only. GET = view, PUT = update. ----

router.get(
  '/:organizationId/settings',
  protect,
  ...organizationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  organizationController.getOrganizationSettings
);

router.put(
  '/:organizationId/settings',
  protect,
  ...organizationIdValidation,
  ...updateSettingsValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_UPDATE),
  organizationController.updateOrganizationSettings
);

// ---- Institute Profile (10A) — institute-only (400 for a company org). GET = view, PUT = update (PATCH-like merge). ----

router.get(
  '/:organizationId/institute-profile',
  protect,
  ...organizationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  organizationController.getInstituteProfile
);

router.put(
  '/:organizationId/institute-profile',
  protect,
  ...organizationIdValidation,
  ...updateInstituteProfileValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_UPDATE),
  organizationController.updateInstituteProfile
);

// ---- Institute Branches (10B) — institute-only (400 for a company org). DELETE is soft/idempotent. ----

router.get(
  '/:organizationId/branches',
  protect,
  ...organizationIdValidation,
  ...listBranchesValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  instituteBranchController.getBranches
);

router.post(
  '/:organizationId/branches',
  protect,
  ...organizationIdValidation,
  ...createBranchValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_UPDATE),
  instituteBranchController.createBranch
);

router.get(
  '/:organizationId/branches/:branchId',
  protect,
  ...organizationIdValidation,
  ...branchIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  instituteBranchController.getBranch
);

router.put(
  '/:organizationId/branches/:branchId',
  protect,
  ...organizationIdValidation,
  ...branchIdValidation,
  ...updateBranchValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_UPDATE),
  instituteBranchController.updateBranch
);

router.delete(
  '/:organizationId/branches/:branchId',
  protect,
  ...organizationIdValidation,
  ...branchIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_UPDATE),
  instituteBranchController.removeBranch
);

// ---- Institute Courses (10C) — institute-only (400 for a company org). DELETE is soft/idempotent. ----

router.get(
  '/:organizationId/courses',
  protect,
  ...organizationIdValidation,
  ...listCoursesValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  instituteCourseController.getCourses
);

router.post(
  '/:organizationId/courses',
  protect,
  ...organizationIdValidation,
  ...createCourseValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_UPDATE),
  instituteCourseController.createCourse
);

router.get(
  '/:organizationId/courses/:courseId',
  protect,
  ...organizationIdValidation,
  ...courseIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  instituteCourseController.getCourse
);

router.put(
  '/:organizationId/courses/:courseId',
  protect,
  ...organizationIdValidation,
  ...courseIdValidation,
  ...updateCourseValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_UPDATE),
  instituteCourseController.updateCourse
);

router.delete(
  '/:organizationId/courses/:courseId',
  protect,
  ...organizationIdValidation,
  ...courseIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_UPDATE),
  instituteCourseController.removeCourse
);

// ---- Members (8B API, 8D RBAC) ----

router.get(
  '/:organizationId/members',
  protect,
  ...organizationIdValidation,
  ...listMembersValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.MEMBERS_VIEW),
  organizationMemberController.getMembers
);

router.post(
  '/:organizationId/members',
  protect,
  ...organizationIdValidation,
  ...addMemberValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.MEMBERS_MANAGE),
  organizationMemberController.addMember
);

router.put(
  '/:organizationId/members/:memberId',
  protect,
  ...organizationIdValidation,
  ...memberIdValidation,
  ...updateMemberValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.MEMBERS_MANAGE),
  organizationMemberController.updateMember
);

router.delete(
  '/:organizationId/members/:memberId',
  protect,
  ...organizationIdValidation,
  ...memberIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.MEMBERS_MANAGE),
  organizationMemberController.removeMember
);

// ---- Invitations (8E) — administrative, so MEMBERS_MANAGE for reads too (not MEMBERS_VIEW). ----

router.post(
  '/:organizationId/invitations',
  protect,
  ...organizationIdValidation,
  ...createInvitationValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.MEMBERS_MANAGE),
  organizationInvitationController.createInvitation
);

router.get(
  '/:organizationId/invitations',
  protect,
  ...organizationIdValidation,
  ...listInvitationsValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.MEMBERS_MANAGE),
  organizationInvitationController.getInvitations
);

router.delete(
  '/:organizationId/invitations/:invitationId',
  protect,
  ...organizationIdValidation,
  ...invitationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.MEMBERS_MANAGE),
  organizationInvitationController.revokeInvitation
);

export default router;
