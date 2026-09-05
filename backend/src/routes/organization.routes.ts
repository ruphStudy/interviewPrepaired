import { Router } from 'express';
import multer from 'multer';
import { body, param, query } from 'express-validator';
import organizationController from '../controllers/OrganizationController';
import organizationMemberController from '../controllers/OrganizationMemberController';
import organizationInvitationController from '../controllers/OrganizationInvitationController';
import organizationDashboardController from '../controllers/OrganizationDashboardController';
import instituteBranchController from '../controllers/InstituteBranchController';
import instituteCourseController from '../controllers/InstituteCourseController';
import instituteOverviewController from '../controllers/InstituteOverviewController';
import instituteBatchController from '../controllers/InstituteBatchController';
import instituteStudentController from '../controllers/InstituteStudentController';
import instituteTrainerController from '../controllers/InstituteTrainerController';
import instituteTrainerAssignmentController from '../controllers/InstituteTrainerAssignmentController';
import instituteInterviewTemplateController from '../controllers/InstituteInterviewTemplateController';
import instituteQuestionSetController from '../controllers/InstituteQuestionSetController';
import instituteStudentInterviewAssignmentController from '../controllers/InstituteStudentInterviewAssignmentController';
import instituteTrainerDashboardController from '../controllers/InstituteTrainerDashboardController';
import instituteTrainerStudentReportController from '../controllers/InstituteTrainerStudentReportController';
import instituteTrainerBatchAnalyticsController from '../controllers/InstituteTrainerBatchAnalyticsController';
import instituteTrainerSkillGapController from '../controllers/InstituteTrainerSkillGapController';
import instituteTrainerBatchReadinessController from '../controllers/InstituteTrainerBatchReadinessController';
import instituteInterviewCreditController from '../controllers/InstituteInterviewCreditController';
import instituteBatchReadinessController from '../controllers/InstituteBatchReadinessController';
import employerJobController from '../controllers/EmployerJobController';
import employerJobHiringTeamController from '../controllers/EmployerJobHiringTeamController';
import employerJobDescriptionController from '../controllers/EmployerJobDescriptionController';
import employerJobDescriptionAnalysisController from '../controllers/EmployerJobDescriptionAnalysisController';
import employerJobDescriptionSkillsController from '../controllers/EmployerJobDescriptionSkillsController';
import employerJobDescriptionCompetencyController from '../controllers/EmployerJobDescriptionCompetencyController';
import employerJobIntelligenceSnapshotController from '../controllers/EmployerJobIntelligenceSnapshotController';
import employerCandidateController from '../controllers/EmployerCandidateController';
import employerCandidateSourceAttributionController from '../controllers/EmployerCandidateSourceAttributionController';
import employerCandidateResumeController from '../controllers/EmployerCandidateResumeController';
import employerCandidateResumeAnalysisController from '../controllers/EmployerCandidateResumeAnalysisController';
import employerJobApplicationController from '../controllers/EmployerJobApplicationController';
import employerCandidateScreeningController from '../controllers/EmployerCandidateScreeningController';
import employerCandidateScreeningScoreController from '../controllers/EmployerCandidateScreeningScoreController';
import employerCandidateScreeningGapController from '../controllers/EmployerCandidateScreeningGapController';
import employerCandidateRankingController from '../controllers/EmployerCandidateRankingController';
import employerHiringCandidateComparisonController from '../controllers/EmployerHiringCandidateComparisonController';
import employerHiringPipelineController from '../controllers/EmployerHiringPipelineController';
import employerJobApplicationTimelineController from '../controllers/EmployerJobApplicationTimelineController';
import employerHiringPipelineAnalyticsController from '../controllers/EmployerHiringPipelineAnalyticsController';
import employerJobApplicationDecisionController from '../controllers/EmployerJobApplicationDecisionController';
import employerJobApplicationNoteController from '../controllers/EmployerJobApplicationNoteController';
import employerJobApplicationCollaborationController from '../controllers/EmployerJobApplicationCollaborationController';
import employerCollaborationMentionsController from '../controllers/EmployerCollaborationMentionsController';
import employerCollaborationNotificationController from '../controllers/EmployerCollaborationNotificationController';
import { EmployerJobApplicationCollaborationRole } from '../constants/employerJobApplicationCollaboration';
import {
  EMPLOYER_JOB_APPLICATION_DECISION_TYPES,
  EMPLOYER_JOB_APPLICATION_DECISION_REASON_CODES,
} from '../models/EmployerJobApplicationDecision.model';
import employerCandidateShortlistController from '../controllers/EmployerCandidateShortlistController';
import employerInterviewBlueprintController from '../controllers/EmployerInterviewBlueprintController';
import employerInterviewCompetencyRubricController from '../controllers/EmployerInterviewCompetencyRubricController';
import employerInterviewInvitationController from '../controllers/EmployerInterviewInvitationController';
import employerInterviewSessionController from '../controllers/EmployerInterviewSessionController';
import employerHiringAssessmentResultController from '../controllers/EmployerHiringAssessmentResultController';
import employerHiringEvidenceMatrixController from '../controllers/EmployerHiringEvidenceMatrixController';
import employerHiringFollowUpPlanController from '../controllers/EmployerHiringFollowUpPlanController';
import employerHiringAssessmentReportController from '../controllers/EmployerHiringAssessmentReportController';
import employerHiringReportReviewController from '../controllers/EmployerHiringReportReviewController';
import employerHiringAssessmentFinalizationController from '../controllers/EmployerHiringAssessmentFinalizationController';
import { InstitutePlanCode } from '../constants/institutePlan';
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
import { MAX_UPLOADED_QUESTIONS } from '../constants/interview';
import { InstituteBranchStatus } from '../constants/instituteBranch';
import { InstituteCourseStatus } from '../constants/instituteCourse';
import { EmployerJobStatus, EmployerJobWorkplaceType, EmployerJobEmploymentType } from '../constants/employerJob';
import { EmployerJobHiringTeamRole } from '../constants/employerJobHiringTeam';
import { EmployerJobDescriptionSourceType, JD_RAW_TEXT_MIN_LENGTH, JD_RAW_TEXT_MAX_LENGTH } from '../constants/employerJobDescription';
import { EmployerCandidateSource, EmployerCandidateStatus } from '../constants/employerCandidate';
import { ALLOWED_RESUME_EXTENSIONS, MAX_RESUME_FILE_SIZE_BYTES, isAllowedResumeFile } from '../constants/employerCandidateResume';
import { EmployerJobApplicationSource, EmployerJobApplicationStatus } from '../constants/employerJobApplication';
import { InstituteBatchStatus } from '../constants/instituteBatch';
import { InstituteInterviewTemplateStatus } from '../constants/instituteInterviewTemplate';
import { InstituteStudentInterviewAssignmentStatus } from '../constants/instituteStudentInterviewAssignment';
import { DifficultyLevel } from '../services/OpenAIService';
import { InstituteStudentStatus } from '../constants/instituteStudent';
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
// Company profile validators (16A) — flat body, no nested `companyProfile`
// wrapper (the endpoint itself is already /company-profile). Only known
// fields accepted; at least one must be present. companyCode is
// deliberately NOT unique — different companies/subsidiaries may reuse
// codes, same as instituteCode.
// ============================================================================

const COMPANY_PROFILE_FIELD_KEYS = [
  'industry',
  'companySize',
  'establishedYear',
  'officialName',
  'companyCode',
  'description',
  'website',
  'careersUrl',
  'headquarters',
  'linkedinUrl',
  'hiringEmail',
  'hiringPhone',
];

const updateCompanyProfileValidation = [
  body('industry').optional().isString().withMessage('industry must be a string').trim().isLength({ max: 120 }).withMessage('industry must be at most 120 characters'),
  body('companySize').optional().isIn(Object.values(CompanySize)).withMessage('Invalid companySize'),
  body('establishedYear')
    .optional()
    .isInt({ min: 1800, max: CURRENT_YEAR })
    .withMessage(`establishedYear must be between 1800 and ${CURRENT_YEAR}`),
  body('officialName')
    .optional()
    .isString()
    .withMessage('officialName must be a string')
    .trim()
    .isLength({ max: 200 })
    .withMessage('officialName must be at most 200 characters'),
  body('companyCode')
    .optional()
    .isString()
    .withMessage('companyCode must be a string')
    .trim()
    .isLength({ max: 50 })
    .withMessage('companyCode must be at most 50 characters'),
  body('description').optional().isString().trim().isLength({ max: 1500 }).withMessage('description must be at most 1500 characters'),
  body('website').optional().isString().trim().isLength({ max: 300 }).withMessage('website must be at most 300 characters').isURL().withMessage('website must be a valid URL'),
  body('careersUrl').optional().isString().trim().isLength({ max: 300 }).withMessage('careersUrl must be at most 300 characters').isURL().withMessage('careersUrl must be a valid URL'),
  body('headquarters').optional().isString().trim().isLength({ max: 200 }).withMessage('headquarters must be at most 200 characters'),
  body('linkedinUrl').optional().isString().trim().isLength({ max: 300 }).withMessage('linkedinUrl must be at most 300 characters').isURL().withMessage('linkedinUrl must be a valid URL'),
  body('hiringEmail').optional().isEmail().withMessage('hiringEmail must be a valid email').isLength({ max: 254 }),
  body('hiringPhone').optional().isString().trim().isLength({ max: 30 }).withMessage('hiringPhone must be at most 30 characters'),
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Request body must be an object');
    }
    const keys = Object.keys(value);
    const unknownKeys = keys.filter((key) => !COMPANY_PROFILE_FIELD_KEYS.includes(key));
    if (unknownKeys.length > 0) {
      throw new Error(`Unknown company profile field(s): ${unknownKeys.join(', ')}`);
    }
    if (keys.length === 0) {
      throw new Error('At least one company profile field is required');
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

// ============================================================================
// Institute batch validators (11A) — institute-only sub-resource, mirrors
// the course validators. `status` is never body-mutable (DELETE is the only
// status transition); `branchId` accepts `null` to clear the association.
// courseId/branchId relationship consistency (same-org, and branch must
// match a branch-scoped course) is enforced service-side, not here.
// ============================================================================

const batchIdValidation = [param('batchId').isMongoId().withMessage('Invalid batch ID')];

const listBatchesValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(Object.values(InstituteBatchStatus)).withMessage('Invalid status'),
  query('courseId').optional().isMongoId().withMessage('Invalid course ID'),
  query('branchId').optional().isMongoId().withMessage('Invalid branch ID'),
];

const BATCH_FIELD_KEYS = ['name', 'courseId', 'branchId', 'code', 'academicYear', 'startDate', 'endDate', 'capacity'];

const rejectBatchImmutableFieldsValidation = [
  body('organizationId').not().exists().withMessage('organizationId cannot be set'),
  body('status').not().exists().withMessage('status cannot be changed directly — use DELETE to deactivate a batch'),
];

const batchOptionalFieldValidators = [
  body('branchId').optional({ nullable: true }).isMongoId().withMessage('branchId must be a valid ID'),
  body('code').optional().isString().withMessage('code must be a string').trim().isLength({ max: 50 }).withMessage('code must be at most 50 characters'),
  body('academicYear').optional().isString().withMessage('academicYear must be a string').trim().isLength({ max: 20 }).withMessage('academicYear must be at most 20 characters'),
  body('startDate').optional({ nullable: true }).isISO8601().withMessage('startDate must be a valid date').toDate(),
  body('endDate').optional({ nullable: true }).isISO8601().withMessage('endDate must be a valid date').toDate(),
  body('capacity').optional().isInt({ min: 1 }).withMessage('capacity must be a positive integer'),
];

const createBatchValidation = [
  ...rejectBatchImmutableFieldsValidation,
  body('name')
    .notEmpty()
    .withMessage('name is required')
    .isString()
    .withMessage('name must be a string')
    .trim()
    .isLength({ min: 1, max: 150 })
    .withMessage('name must be between 1 and 150 characters'),
  body('courseId').notEmpty().withMessage('courseId is required').isMongoId().withMessage('courseId must be a valid ID'),
  ...batchOptionalFieldValidators,
];

const updateBatchValidation = [
  ...rejectBatchImmutableFieldsValidation,
  body('name')
    .optional()
    .isString()
    .withMessage('name must be a string')
    .trim()
    .isLength({ min: 1, max: 150 })
    .withMessage('name must be between 1 and 150 characters'),
  body('courseId').optional().isMongoId().withMessage('courseId must be a valid ID'),
  ...batchOptionalFieldValidators,
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Request body must be an object');
    }
    const keys = Object.keys(value);
    const unknownKeys = keys.filter((key) => !BATCH_FIELD_KEYS.includes(key));
    if (unknownKeys.length > 0) {
      throw new Error(`Unknown batch field(s): ${unknownKeys.join(', ')}`);
    }
    if (keys.length === 0) {
      throw new Error('At least one field is required');
    }
    return true;
  }),
];

// ============================================================================
// Institute student validators (11B) — institute-only sub-resource, mirrors
// the batch validators. `status` is never body-mutable (DELETE is the only
// status transition); `batchId`/`courseId`/`branchId` each accept `null` to
// clear. Cross-reference consistency (same-org, and batch-derived
// course/branch matching) is enforced service-side, not here.
// ============================================================================

const studentIdValidation = [param('studentId').isMongoId().withMessage('Invalid student ID')];

const listStudentsValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(Object.values(InstituteStudentStatus)).withMessage('Invalid status'),
  query('batchId').optional().isMongoId().withMessage('Invalid batch ID'),
  query('courseId').optional().isMongoId().withMessage('Invalid course ID'),
  query('branchId').optional().isMongoId().withMessage('Invalid branch ID'),
  query('search').optional().isString().trim().isLength({ max: 150 }).withMessage('search must be at most 150 characters'),
];

const STUDENT_FIELD_KEYS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'enrollmentNumber',
  'graduationYear',
  'batchId',
  'courseId',
  'branchId',
];

const rejectStudentImmutableFieldsValidation = [
  body('organizationId').not().exists().withMessage('organizationId cannot be set'),
  body('status').not().exists().withMessage('status cannot be changed directly — use DELETE to deactivate a student'),
];

const studentOptionalFieldValidators = [
  body('lastName').optional().isString().trim().isLength({ max: 100 }).withMessage('lastName must be at most 100 characters'),
  body('email').optional().isEmail().withMessage('email must be a valid email').isLength({ max: 254 }),
  body('phone').optional().isString().trim().isLength({ max: 30 }).withMessage('phone must be at most 30 characters'),
  body('enrollmentNumber').optional().isString().withMessage('enrollmentNumber must be a string').trim().isLength({ max: 100 }).withMessage('enrollmentNumber must be at most 100 characters'),
  body('graduationYear')
    .optional()
    .isInt({ min: 1900, max: CURRENT_YEAR + 10 })
    .withMessage(`graduationYear must be between 1900 and ${CURRENT_YEAR + 10}`),
  body('batchId').optional({ nullable: true }).isMongoId().withMessage('batchId must be a valid ID'),
  body('courseId').optional({ nullable: true }).isMongoId().withMessage('courseId must be a valid ID'),
  body('branchId').optional({ nullable: true }).isMongoId().withMessage('branchId must be a valid ID'),
];

const createStudentValidation = [
  ...rejectStudentImmutableFieldsValidation,
  body('firstName')
    .notEmpty()
    .withMessage('firstName is required')
    .isString()
    .withMessage('firstName must be a string')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('firstName must be between 1 and 100 characters'),
  ...studentOptionalFieldValidators,
];

const updateStudentValidation = [
  ...rejectStudentImmutableFieldsValidation,
  body('firstName')
    .optional()
    .isString()
    .withMessage('firstName must be a string')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('firstName must be between 1 and 100 characters'),
  ...studentOptionalFieldValidators,
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Request body must be an object');
    }
    const keys = Object.keys(value);
    const unknownKeys = keys.filter((key) => !STUDENT_FIELD_KEYS.includes(key));
    if (unknownKeys.length > 0) {
      throw new Error(`Unknown student field(s): ${unknownKeys.join(', ')}`);
    }
    if (keys.length === 0) {
      throw new Error('At least one field is required');
    }
    return true;
  }),
];

// ============================================================================
// Bulk student import validators (11D) — a lightweight, type/format-only
// outer layer; the real relationship resolution, normalization, and
// duplicate handling all happen service-side per row (reused from the
// single-create path), so this deliberately doesn't re-derive that logic.
// ============================================================================

const BULK_STUDENTS_MAX = 200;

const bulkCreateStudentsValidation = [
  body('students')
    .isArray({ min: 1, max: BULK_STUDENTS_MAX })
    .withMessage(`students must be an array of 1 to ${BULK_STUDENTS_MAX} items`),
  body('students.*.organizationId').not().exists().withMessage('organizationId cannot be set'),
  body('students.*.status').not().exists().withMessage('status cannot be set'),
  body('students.*.userId').not().exists().withMessage('userId cannot be set via bulk import'),
  body('students.*.firstName')
    .exists({ checkFalsy: true })
    .withMessage('firstName is required')
    .isString()
    .withMessage('firstName must be a string')
    .isLength({ max: 100 })
    .withMessage('firstName must be at most 100 characters'),
  body('students.*.lastName').optional().isString().isLength({ max: 100 }).withMessage('lastName must be at most 100 characters'),
  body('students.*.email').optional().isEmail().withMessage('email must be a valid email').isLength({ max: 254 }),
  body('students.*.phone').optional().isString().isLength({ max: 30 }).withMessage('phone must be at most 30 characters'),
  body('students.*.enrollmentNumber')
    .optional()
    .isString()
    .isLength({ max: 100 })
    .withMessage('enrollmentNumber must be at most 100 characters'),
  body('students.*.graduationYear')
    .optional()
    .isInt({ min: 1900, max: CURRENT_YEAR + 10 })
    .withMessage(`graduationYear must be between 1900 and ${CURRENT_YEAR + 10}`),
  body('students.*.batchId').optional().isMongoId().withMessage('batchId must be a valid ID'),
  body('students.*.courseId').optional().isMongoId().withMessage('courseId must be a valid ID'),
  body('students.*.branchId').optional().isMongoId().withMessage('branchId must be a valid ID'),
];

// ============================================================================
// Bulk student assignment validators (11E) — one target batch/course/branch
// applied to many students. `studentIds` uniqueness is handled service-side
// (deduped, not rejected) — only array shape/format is checked here.
// ============================================================================

const BULK_ASSIGN_MAX = 200;
const ASSIGN_FIELD_KEYS = ['studentIds', 'batchId', 'courseId', 'branchId'];

const bulkAssignStudentsValidation = [
  body('studentIds')
    .isArray({ min: 1, max: BULK_ASSIGN_MAX })
    .withMessage(`studentIds must be an array of 1 to ${BULK_ASSIGN_MAX} items`),
  body('studentIds.*').isMongoId().withMessage('Each studentId must be a valid ID'),
  body('batchId').optional({ nullable: true }).isMongoId().withMessage('batchId must be a valid ID'),
  body('courseId').optional({ nullable: true }).isMongoId().withMessage('courseId must be a valid ID'),
  body('branchId').optional({ nullable: true }).isMongoId().withMessage('branchId must be a valid ID'),
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Request body must be an object');
    }
    const keys = Object.keys(value);
    const unknownKeys = keys.filter((key) => !ASSIGN_FIELD_KEYS.includes(key));
    if (unknownKeys.length > 0) {
      throw new Error(`Unknown field(s): ${unknownKeys.join(', ')}`);
    }
    if (value.batchId === undefined && value.courseId === undefined && value.branchId === undefined) {
      throw new Error('At least one of batchId, courseId, or branchId is required');
    }
    return true;
  }),
];

// ============================================================================
// Institute trainer validators (12A) — trainer identity is the EXISTING
// OrganizationMember (role TRAINER); only the optional profile metadata is
// mutable here. Membership role/status are never accepted on this profile
// endpoint — that stays the members API's job (8B/8D), not duplicated here.
// ============================================================================

const trainerMembershipIdValidation = [param('membershipId').isMongoId().withMessage('Invalid membership ID')];

const listTrainersValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(Object.values(OrganizationMemberStatus)).withMessage('Invalid status'),
  query('search').optional().isString().trim().isLength({ max: 150 }).withMessage('search must be at most 150 characters'),
];

const TRAINER_PROFILE_FIELD_KEYS = ['employeeCode', 'designation', 'department', 'specialization', 'bio'];

const updateTrainerProfileValidation = [
  body('employeeCode')
    .optional()
    .isString()
    .withMessage('employeeCode must be a string')
    .trim()
    .isLength({ max: 50 })
    .withMessage('employeeCode must be at most 50 characters'),
  body('designation').optional().isString().trim().isLength({ max: 150 }).withMessage('designation must be at most 150 characters'),
  body('department').optional().isString().trim().isLength({ max: 150 }).withMessage('department must be at most 150 characters'),
  body('specialization').optional().isArray({ max: 30 }).withMessage('specialization must be an array of at most 30 items'),
  body('specialization.*')
    .isString()
    .withMessage('Each specialization must be a string')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Each specialization must be between 1 and 100 characters'),
  body('bio').optional().isString().trim().isLength({ max: 1000 }).withMessage('bio must be at most 1000 characters'),
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Request body must be an object');
    }
    const keys = Object.keys(value);
    const unknownKeys = keys.filter((key) => !TRAINER_PROFILE_FIELD_KEYS.includes(key));
    if (unknownKeys.length > 0) {
      throw new Error(`Unknown field(s): ${unknownKeys.join(', ')}`);
    }
    if (keys.length === 0) {
      throw new Error('At least one field is required');
    }
    return true;
  }),
];

// ============================================================================
// Trainer assignment validators (12B) — links a trainer to exactly one
// target (courseId XOR batchId). Same-org ownership of the target and the
// trainer's ACTIVE status are enforced service-side, not here.
// ============================================================================

const trainerAssignmentIdValidation = [param('assignmentId').isMongoId().withMessage('Invalid assignment ID')];

const listTrainerAssignmentsValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
];

const createTrainerAssignmentValidation = [
  body('courseId').optional().isMongoId().withMessage('courseId must be a valid ID'),
  body('batchId').optional().isMongoId().withMessage('batchId must be a valid ID'),
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Request body must be an object');
    }
    const hasCourse = value.courseId !== undefined && value.courseId !== null;
    const hasBatch = value.batchId !== undefined && value.batchId !== null;
    if (hasCourse === hasBatch) {
      throw new Error('Provide exactly one of courseId or batchId');
    }
    return true;
  }),
];

// ============================================================================
// Institute interview template validators (12C) — references an EXISTING
// QuestionSet by id only; question content is never accepted here.
// courseId/batchId relationship consistency (same-org, batch's own courseId
// authoritative) is enforced service-side, not here. `status` is never
// body-mutable (DELETE is the only status transition).
// ============================================================================

// ============================================================================
// Organization-scoped Question Set validators (UI-05 unblock) — separate
// surface from the personal /question-sets routes; mirrors that route's own
// validation exactly (name/description/questions) so both surfaces agree on
// one content contract.
// ============================================================================

const questionSetIdValidation = [param('questionSetId').isMongoId().withMessage('Invalid question set ID')];

const listOrgQuestionSetsValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
];

const orgQuestionSetNameValidation = (optional: boolean) => {
  const chain = body('name');
  return (optional ? chain.optional() : chain.notEmpty().withMessage('Name is required'))
    .isString()
    .withMessage('Name must be a string')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters');
};

const orgQuestionSetDescriptionValidation = [
  body('description')
    .optional()
    .isString()
    .withMessage('Description must be a string')
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be at most 500 characters'),
];

const orgQuestionSetItemsValidation = [
  body('questions.*.questionText')
    .isString()
    .withMessage('Each question requires questionText as a string')
    .notEmpty()
    .withMessage('Each question requires non-empty questionText'),
  body('questions.*.referenceAnswer').optional().isString().withMessage('referenceAnswer must be a string'),
];

const createOrgQuestionSetValidation = [
  orgQuestionSetNameValidation(false),
  ...orgQuestionSetDescriptionValidation,
  body('questions')
    .isArray({ min: 1, max: MAX_UPLOADED_QUESTIONS })
    .withMessage(`questions must be an array of 1 to ${MAX_UPLOADED_QUESTIONS} items`),
  ...orgQuestionSetItemsValidation,
];

const updateOrgQuestionSetValidation = [
  orgQuestionSetNameValidation(true),
  ...orgQuestionSetDescriptionValidation,
  body('questions')
    .optional()
    .isArray({ min: 1, max: MAX_UPLOADED_QUESTIONS })
    .withMessage(`questions must be an array of 1 to ${MAX_UPLOADED_QUESTIONS} items`),
  ...orgQuestionSetItemsValidation,
];

const templateIdValidation = [param('templateId').isMongoId().withMessage('Invalid template ID')];

const listTemplatesValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(Object.values(InstituteInterviewTemplateStatus)).withMessage('Invalid status'),
  query('courseId').optional().isMongoId().withMessage('Invalid course ID'),
  query('batchId').optional().isMongoId().withMessage('Invalid batch ID'),
];

const TEMPLATE_FIELD_KEYS = ['name', 'description', 'questionSetId', 'courseId', 'batchId', 'interviewConfig'];

const rejectTemplateImmutableFieldsValidation = [
  body('organizationId').not().exists().withMessage('organizationId cannot be set'),
  body('status').not().exists().withMessage('status cannot be changed directly — use DELETE to deactivate a template'),
];

const templateOptionalFieldValidators = [
  body('description').optional().isString().trim().isLength({ max: 1000 }).withMessage('description must be at most 1000 characters'),
  body('courseId').optional({ nullable: true }).isMongoId().withMessage('courseId must be a valid ID'),
  body('batchId').optional({ nullable: true }).isMongoId().withMessage('batchId must be a valid ID'),
  body('interviewConfig').optional({ nullable: true }).isObject().withMessage('interviewConfig must be an object'),
  body('interviewConfig.difficulty').optional().isIn(Object.values(DifficultyLevel)).withMessage('Invalid difficulty'),
  body('interviewConfig.style').optional().isString().trim().isLength({ max: 100 }).withMessage('style must be at most 100 characters'),
  body('interviewConfig.language').optional().isIn(SUPPORTED_LANGUAGE_CODES).withMessage('Invalid language'),
  body('interviewConfig.questionLimit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('questionLimit must be between 1 and 50'),
];

const createTemplateValidation = [
  ...rejectTemplateImmutableFieldsValidation,
  body('name')
    .notEmpty()
    .withMessage('name is required')
    .isString()
    .withMessage('name must be a string')
    .trim()
    .isLength({ min: 1, max: 150 })
    .withMessage('name must be between 1 and 150 characters'),
  body('questionSetId')
    .notEmpty()
    .withMessage('questionSetId is required')
    .isMongoId()
    .withMessage('questionSetId must be a valid ID'),
  ...templateOptionalFieldValidators,
];

const updateTemplateValidation = [
  ...rejectTemplateImmutableFieldsValidation,
  body('name')
    .optional()
    .isString()
    .withMessage('name must be a string')
    .trim()
    .isLength({ min: 1, max: 150 })
    .withMessage('name must be between 1 and 150 characters'),
  body('questionSetId').optional().isMongoId().withMessage('questionSetId must be a valid ID'),
  ...templateOptionalFieldValidators,
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Request body must be an object');
    }
    const keys = Object.keys(value);
    const unknownKeys = keys.filter((key) => !TEMPLATE_FIELD_KEYS.includes(key));
    if (unknownKeys.length > 0) {
      throw new Error(`Unknown field(s): ${unknownKeys.join(', ')}`);
    }
    if (keys.length === 0) {
      throw new Error('At least one field is required');
    }
    return true;
  }),
];

// ============================================================================
// Student interview assignment validators (12D) — assigns an EXISTING
// active template to EXISTING active students. `assignedByMembershipId` is
// never accepted here — it's always the trusted caller's own membership id
// (organizationContext.member._id), set service-side. Template/student
// scope-compatibility is enforced service-side, not here.
// ============================================================================

const ASSIGN_INTERVIEW_MAX_STUDENTS = 200;

const assignInterviewValidation = [
  body('organizationId').not().exists().withMessage('organizationId cannot be set'),
  body('assignedByMembershipId').not().exists().withMessage('assignedByMembershipId cannot be set'),
  body('status').not().exists().withMessage('status cannot be set'),
  body('templateId').notEmpty().withMessage('templateId is required').isMongoId().withMessage('templateId must be a valid ID'),
  body('studentIds')
    .isArray({ min: 1, max: ASSIGN_INTERVIEW_MAX_STUDENTS })
    .withMessage(`studentIds must be an array of 1 to ${ASSIGN_INTERVIEW_MAX_STUDENTS} items`),
  body('studentIds.*').isMongoId().withMessage('Each studentId must be a valid ID'),
  body('dueAt').optional({ nullable: true }).isISO8601().withMessage('dueAt must be a valid date').toDate(),
  body('instructions').optional().isString().trim().isLength({ max: 1000 }).withMessage('instructions must be at most 1000 characters'),
];

const listInterviewAssignmentsValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('studentId').optional().isMongoId().withMessage('Invalid student ID'),
  query('templateId').optional().isMongoId().withMessage('Invalid template ID'),
  query('status').optional().isIn(Object.values(InstituteStudentInterviewAssignmentStatus)).withMessage('Invalid status'),
];

const assignmentIdValidation = [param('assignmentId').isMongoId().withMessage('Invalid assignment ID')];

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

// ---- Company Profile (16A) — company-only (400 for an institute org). GET = view, PUT = update (PATCH-like merge). ----

router.get(
  '/:organizationId/company-profile',
  protect,
  ...organizationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  organizationController.getCompanyProfile
);

router.put(
  '/:organizationId/company-profile',
  protect,
  ...organizationIdValidation,
  ...updateCompanyProfileValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_UPDATE),
  organizationController.updateCompanyProfile
);

// ============================================================================
// Employer Jobs (16B) — company-only (400 for an institute org). Reads use
// ORGANIZATION_VIEW; mutations (including the dedicated status endpoint) use
// INTERVIEWS_MANAGE — the existing hiring/interview-management permission,
// not the generic profile-update permission. `status`/`organizationId`/
// `createdByMembershipId`/timestamps are rejected on create/update; status
// only ever changes through POST .../status.
// ============================================================================

const jobIdValidation = [param('jobId').isMongoId().withMessage('Invalid job ID')];

const listJobsValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(Object.values(EmployerJobStatus)).withMessage('Invalid status'),
  query('department').optional().isString().trim().isLength({ max: 150 }),
  query('workplaceType').optional().isIn(Object.values(EmployerJobWorkplaceType)).withMessage('Invalid workplaceType'),
  query('employmentType').optional().isIn(Object.values(EmployerJobEmploymentType)).withMessage('Invalid employmentType'),
  query('search').optional().isString().trim().isLength({ max: 200 }),
];

const JOB_FIELD_KEYS = [
  'title',
  'jobCode',
  'department',
  'location',
  'workplaceType',
  'employmentType',
  'experienceMinYears',
  'experienceMaxYears',
  'openings',
  'description',
  'responsibilities',
  'requiredSkills',
  'preferredSkills',
  'salaryMin',
  'salaryMax',
  'salaryCurrency',
  'applicationDeadline',
];

const rejectJobImmutableFieldsValidation = [
  body('organizationId').not().exists().withMessage('organizationId cannot be set'),
  body('createdByMembershipId').not().exists().withMessage('createdByMembershipId cannot be set'),
  body('status').not().exists().withMessage('status cannot be changed directly — use POST .../status'),
  body('createdAt').not().exists().withMessage('createdAt cannot be set'),
  body('updatedAt').not().exists().withMessage('updatedAt cannot be set'),
];

const jobOptionalFieldValidators = [
  body('jobCode').optional().isString().withMessage('jobCode must be a string').trim().isLength({ max: 50 }).withMessage('jobCode must be at most 50 characters'),
  body('department').optional().isString().trim().isLength({ max: 150 }).withMessage('department must be at most 150 characters'),
  body('location').optional().isString().trim().isLength({ max: 200 }).withMessage('location must be at most 200 characters'),
  body('workplaceType').optional().isIn(Object.values(EmployerJobWorkplaceType)).withMessage('Invalid workplaceType'),
  body('employmentType').optional().isIn(Object.values(EmployerJobEmploymentType)).withMessage('Invalid employmentType'),
  body('experienceMinYears').optional().isInt({ min: 0 }).withMessage('experienceMinYears must be a non-negative integer'),
  body('experienceMaxYears').optional().isInt({ min: 0 }).withMessage('experienceMaxYears must be a non-negative integer'),
  body('openings').optional().isInt({ min: 1 }).withMessage('openings must be a positive integer'),
  body('description').optional().isString().trim().isLength({ max: 5000 }).withMessage('description must be at most 5000 characters'),
  body('responsibilities').optional().isArray({ max: 50 }).withMessage('responsibilities must be an array of at most 50 items'),
  body('requiredSkills').optional().isArray({ max: 50 }).withMessage('requiredSkills must be an array of at most 50 items'),
  body('preferredSkills').optional().isArray({ max: 50 }).withMessage('preferredSkills must be an array of at most 50 items'),
  body('salaryMin').optional().isFloat({ min: 0 }).withMessage('salaryMin must be a non-negative number'),
  body('salaryMax').optional().isFloat({ min: 0 }).withMessage('salaryMax must be a non-negative number'),
  body('salaryCurrency').optional().isString().trim().isLength({ max: 10 }).withMessage('salaryCurrency must be at most 10 characters'),
  body('applicationDeadline').optional().isISO8601().withMessage('applicationDeadline must be a valid date'),
];

const createJobValidation = [
  ...rejectJobImmutableFieldsValidation,
  body('title')
    .notEmpty()
    .withMessage('title is required')
    .isString()
    .withMessage('title must be a string')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('title must be between 1 and 200 characters'),
  ...jobOptionalFieldValidators,
];

const updateJobValidation = [
  ...rejectJobImmutableFieldsValidation,
  body('title')
    .optional()
    .isString()
    .withMessage('title must be a string')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('title must be between 1 and 200 characters'),
  ...jobOptionalFieldValidators,
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Request body must be an object');
    }
    const keys = Object.keys(value);
    const unknownKeys = keys.filter((key) => !JOB_FIELD_KEYS.includes(key));
    if (unknownKeys.length > 0) {
      throw new Error(`Unknown job field(s): ${unknownKeys.join(', ')}`);
    }
    if (keys.length === 0) {
      throw new Error('At least one job field is required');
    }
    return true;
  }),
];

const updateJobStatusValidation = [
  body('status').notEmpty().withMessage('status is required').isIn(Object.values(EmployerJobStatus)).withMessage('Invalid status'),
];

router.get(
  '/:organizationId/jobs',
  protect,
  ...organizationIdValidation,
  ...listJobsValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerJobController.getJobs
);

router.post(
  '/:organizationId/jobs',
  protect,
  ...organizationIdValidation,
  ...createJobValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerJobController.createJob
);

router.get(
  '/:organizationId/jobs/:jobId',
  protect,
  ...organizationIdValidation,
  ...jobIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerJobController.getJob
);

router.put(
  '/:organizationId/jobs/:jobId',
  protect,
  ...organizationIdValidation,
  ...jobIdValidation,
  ...updateJobValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerJobController.updateJob
);

router.post(
  '/:organizationId/jobs/:jobId/status',
  protect,
  ...organizationIdValidation,
  ...jobIdValidation,
  ...updateJobStatusValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerJobController.updateJobStatus
);

const listJobStatusHistoryValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
];

router.get(
  '/:organizationId/jobs/:jobId/status-history',
  protect,
  ...organizationIdValidation,
  ...jobIdValidation,
  ...listJobStatusHistoryValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerJobController.getJobStatusHistory
);

// ============================================================================
// Job Hiring Team (16D) — job-LOCAL role assignments over EXISTING, ACTIVE,
// same-organization OrganizationMember rows. Never creates a member, never
// changes OrganizationMember.role/status. Reads use ORGANIZATION_VIEW;
// mutations (add/update/remove) and the available-members lookup use
// INTERVIEWS_MANAGE. Archived organization: reads allowed, mutations
// blocked (409, enforced service-side); an archived JOB additionally blocks
// mutations regardless of organization status.
// ============================================================================

const teamMemberIdValidation = [param('teamMemberId').isMongoId().withMessage('Invalid team member ID')];

const HIRING_TEAM_ADD_FIELD_KEYS = ['membershipId', 'role'];
const HIRING_TEAM_UPDATE_FIELD_KEYS = ['role'];

const addHiringTeamMemberValidation = [
  body('membershipId').notEmpty().withMessage('membershipId is required').isMongoId().withMessage('Invalid membershipId'),
  body('role')
    .notEmpty()
    .withMessage('role is required')
    .isIn(Object.values(EmployerJobHiringTeamRole))
    .withMessage('Invalid role'),
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Request body must be an object');
    }
    const unknownKeys = Object.keys(value).filter((key) => !HIRING_TEAM_ADD_FIELD_KEYS.includes(key));
    if (unknownKeys.length > 0) {
      throw new Error(`Unknown field(s): ${unknownKeys.join(', ')}`);
    }
    return true;
  }),
];

const updateHiringTeamMemberValidation = [
  body('role')
    .notEmpty()
    .withMessage('role is required')
    .isIn(Object.values(EmployerJobHiringTeamRole))
    .withMessage('Invalid role'),
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Request body must be an object');
    }
    const unknownKeys = Object.keys(value).filter((key) => !HIRING_TEAM_UPDATE_FIELD_KEYS.includes(key));
    if (unknownKeys.length > 0) {
      throw new Error(`Unknown field(s): ${unknownKeys.join(', ')}`);
    }
    return true;
  }),
];

router.get(
  '/:organizationId/jobs/:jobId/hiring-team',
  protect,
  ...organizationIdValidation,
  ...jobIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerJobHiringTeamController.getHiringTeam
);

router.get(
  '/:organizationId/jobs/:jobId/hiring-team/available-members',
  protect,
  ...organizationIdValidation,
  ...jobIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerJobHiringTeamController.getAvailableMembers
);

router.post(
  '/:organizationId/jobs/:jobId/hiring-team',
  protect,
  ...organizationIdValidation,
  ...jobIdValidation,
  ...addHiringTeamMemberValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerJobHiringTeamController.addHiringTeamMember
);

router.put(
  '/:organizationId/jobs/:jobId/hiring-team/:teamMemberId',
  protect,
  ...organizationIdValidation,
  ...jobIdValidation,
  ...teamMemberIdValidation,
  ...updateHiringTeamMemberValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerJobHiringTeamController.updateHiringTeamMember
);

router.delete(
  '/:organizationId/jobs/:jobId/hiring-team/:teamMemberId',
  protect,
  ...organizationIdValidation,
  ...jobIdValidation,
  ...teamMemberIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerJobHiringTeamController.removeHiringTeamMember
);

// ============================================================================
// Job Description Intake (17A) — raw JD text + versioning ONLY. No AI
// parsing/skill extraction/competency generation (later sprints). Reads use
// ORGANIZATION_VIEW; creating a new version uses INTERVIEWS_MANAGE.
// Archived organization or archived job: reads allowed, mutation blocked
// (enforced service-side). Every create is a NEW version — never an
// overwrite; organizationId/jobId/createdByMembershipId/version/isCurrent
// can never be set from the request body.
// ============================================================================

const jdSourceIdValidation = [param('jdSourceId').isMongoId().withMessage('Invalid job description version ID')];

const JD_FIELD_KEYS = ['rawText', 'sourceType'];

const createJobDescriptionValidation = [
  body('organizationId').not().exists().withMessage('organizationId cannot be set'),
  body('jobId').not().exists().withMessage('jobId cannot be set'),
  body('createdByMembershipId').not().exists().withMessage('createdByMembershipId cannot be set'),
  body('version').not().exists().withMessage('version cannot be set'),
  body('isCurrent').not().exists().withMessage('isCurrent cannot be set'),
  body('rawText')
    .notEmpty()
    .withMessage('rawText is required')
    .isString()
    .withMessage('rawText must be a string')
    .trim()
    .isLength({ min: JD_RAW_TEXT_MIN_LENGTH, max: JD_RAW_TEXT_MAX_LENGTH })
    .withMessage(`rawText must be between ${JD_RAW_TEXT_MIN_LENGTH} and ${JD_RAW_TEXT_MAX_LENGTH} characters`),
  body('sourceType')
    .notEmpty()
    .withMessage('sourceType is required')
    .isIn(Object.values(EmployerJobDescriptionSourceType))
    .withMessage('Invalid sourceType'),
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Request body must be an object');
    }
    const unknownKeys = Object.keys(value).filter((key) => !JD_FIELD_KEYS.includes(key));
    if (unknownKeys.length > 0) {
      throw new Error(`Unknown field(s): ${unknownKeys.join(', ')}`);
    }
    return true;
  }),
];

router.get(
  '/:organizationId/jobs/:jobId/jd',
  protect,
  ...organizationIdValidation,
  ...jobIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerJobDescriptionController.getJobDescription
);

router.post(
  '/:organizationId/jobs/:jobId/jd',
  protect,
  ...organizationIdValidation,
  ...jobIdValidation,
  ...createJobDescriptionValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerJobDescriptionController.createJobDescriptionSource
);

// ============================================================================
// Job Description Analysis (17B) — AI-parsed structured understanding of the
// CURRENT JD source only, via the EXISTING AI Gateway (no provider SDK
// touched here). Reads use ORGANIZATION_VIEW; triggering a parse uses
// INTERVIEWS_MANAGE. Archived organization or archived job: reads allowed,
// parsing blocked (enforced service-side). NOTE: `GET .../jd/analysis` is
// registered BEFORE `GET .../jd/:jdSourceId` (above it in this file only
// because it was added later) so the literal "analysis" segment is matched
// before it could ever fall through to the `:jdSourceId` wildcard route.
// ============================================================================

router.get(
  '/:organizationId/jobs/:jobId/jd/analysis',
  protect,
  ...organizationIdValidation,
  ...jobIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerJobDescriptionAnalysisController.getCurrentAnalysis
);

router.post(
  '/:organizationId/jobs/:jobId/jd/analyze',
  protect,
  ...organizationIdValidation,
  ...jobIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerJobDescriptionAnalysisController.analyzeCurrentJobDescription
);

// ============================================================================
// Job Description Skill Extraction (17C) — normalized, JD-version-local
// skill set derived from the CURRENT JD's already-COMPLETED 17B analysis
// (never re-parses raw JD text), via the EXISTING AI Gateway. Reads use
// ORGANIZATION_VIEW; extracting uses INTERVIEWS_MANAGE. Archived
// organization or archived job: reads allowed, extraction blocked
// (enforced service-side). NOTE: `GET .../jd/skills` is registered BEFORE
// `GET .../jd/:jdSourceId` (below) so the literal "skills" segment is
// matched before it could ever fall through to the `:jdSourceId` wildcard
// route — same ordering requirement as `GET .../jd/analysis` above.
// ============================================================================

router.get(
  '/:organizationId/jobs/:jobId/jd/skills',
  protect,
  ...organizationIdValidation,
  ...jobIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerJobDescriptionSkillsController.getCurrentSkills
);

router.post(
  '/:organizationId/jobs/:jobId/jd/skills/extract',
  protect,
  ...organizationIdValidation,
  ...jobIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerJobDescriptionSkillsController.extractCurrentSkills
);

// ============================================================================
// Job Description Competency Generation (17D) — job/JD-version competency
// blueprint derived from the CURRENT JD's already-COMPLETED 17B analysis
// and 17C skills (never re-parses raw JD text, never re-extracts skills),
// via the EXISTING AI Gateway. Reads use ORGANIZATION_VIEW; generating uses
// INTERVIEWS_MANAGE. Archived organization or archived job: reads allowed,
// generation blocked (enforced service-side). NOTE: `GET .../jd/competencies`
// is registered BEFORE `GET .../jd/:jdSourceId` (below) so the literal
// "competencies" segment is matched before it could ever fall through to
// the `:jdSourceId` wildcard route — same ordering requirement as
// `GET .../jd/analysis` and `GET .../jd/skills` above.
// ============================================================================

router.get(
  '/:organizationId/jobs/:jobId/jd/competencies',
  protect,
  ...organizationIdValidation,
  ...jobIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerJobDescriptionCompetencyController.getCurrentCompetencies
);

router.post(
  '/:organizationId/jobs/:jobId/jd/competencies/generate',
  protect,
  ...organizationIdValidation,
  ...jobIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerJobDescriptionCompetencyController.generateCurrentCompetencies
);

// ============================================================================
// Job Intelligence Finalization (17E) — deterministic, NO-AI persistence of
// an immutable snapshot integrating the CURRENT JD's already-completed 17B
// analysis, 17C skills, and 17D competencies. Reads use ORGANIZATION_VIEW;
// finalizing uses INTERVIEWS_MANAGE. Archived organization or archived job:
// reads allowed, finalization blocked (enforced service-side). There is no
// PUT/update/delete route for a snapshot — it is permanent once created.
// NOTE: `GET .../jd/intelligence` is registered BEFORE `GET .../jd/:jdSourceId`
// (below) so the literal "intelligence" segment is matched before it could
// ever fall through to the `:jdSourceId` wildcard route — same ordering
// requirement as `GET .../jd/analysis`, `GET .../jd/skills`, and
// `GET .../jd/competencies` above.
// ============================================================================

router.get(
  '/:organizationId/jobs/:jobId/jd/intelligence',
  protect,
  ...organizationIdValidation,
  ...jobIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerJobIntelligenceSnapshotController.getCurrentIntelligence
);

router.post(
  '/:organizationId/jobs/:jobId/jd/intelligence/finalize',
  protect,
  ...organizationIdValidation,
  ...jobIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerJobIntelligenceSnapshotController.finalizeCurrentIntelligence
);

router.get(
  '/:organizationId/jobs/:jobId/jd/:jdSourceId',
  protect,
  ...organizationIdValidation,
  ...jobIdValidation,
  ...jdSourceIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerJobDescriptionController.getJobDescriptionSource
);

router.get(
  '/:organizationId/jobs/:jobId/jd/:jdSourceId/analysis',
  protect,
  ...organizationIdValidation,
  ...jobIdValidation,
  ...jdSourceIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerJobDescriptionAnalysisController.getAnalysisForSource
);

router.get(
  '/:organizationId/jobs/:jobId/jd/:jdSourceId/skills',
  protect,
  ...organizationIdValidation,
  ...jobIdValidation,
  ...jdSourceIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerJobDescriptionSkillsController.getSkillsForSource
);

router.get(
  '/:organizationId/jobs/:jobId/jd/:jdSourceId/competencies',
  protect,
  ...organizationIdValidation,
  ...jobIdValidation,
  ...jdSourceIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerJobDescriptionCompetencyController.getCompetenciesForSource
);

router.get(
  '/:organizationId/jobs/:jobId/jd/:jdSourceId/intelligence',
  protect,
  ...organizationIdValidation,
  ...jobIdValidation,
  ...jdSourceIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerJobIntelligenceSnapshotController.getIntelligenceForSource
);

// ============================================================================
// Employer Candidates (18A) — company-only (400 for an institute org). No
// resume upload/parsing (18B/18C), no job/application linkage (18D), no
// screening/ranking, no AI — manually-entered candidate metadata only.
// Reads use ORGANIZATION_VIEW; mutations (including the dedicated status
// endpoint) use INTERVIEWS_MANAGE. `status`/`organizationId`/
// `createdByMembershipId`/timestamps are rejected on create/update; status
// only ever changes through POST .../status. Email is the primary candidate
// identity within one organization (unique per org, never global).
// ============================================================================

const candidateIdValidation = [param('candidateId').isMongoId().withMessage('Invalid candidate ID')];

const listCandidatesValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(Object.values(EmployerCandidateStatus)).withMessage('Invalid status'),
  query('source').optional().isIn(Object.values(EmployerCandidateSource)).withMessage('Invalid source'),
  query('search').optional().isString().trim().isLength({ max: 200 }),
];

const CANDIDATE_FIELD_KEYS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'headline',
  'currentCompany',
  'currentTitle',
  'location',
  'totalExperienceYears',
  'linkedinUrl',
  'portfolioUrl',
  'githubUrl',
  'noticePeriodDays',
  'currentSalary',
  'expectedSalary',
  'salaryCurrency',
  'source',
  'notes',
  'tags',
];

const rejectCandidateImmutableFieldsValidation = [
  body('organizationId').not().exists().withMessage('organizationId cannot be set'),
  body('createdByMembershipId').not().exists().withMessage('createdByMembershipId cannot be set'),
  body('status').not().exists().withMessage('status cannot be changed directly — use POST .../status'),
  body('createdAt').not().exists().withMessage('createdAt cannot be set'),
  body('updatedAt').not().exists().withMessage('updatedAt cannot be set'),
];

const candidateOptionalFieldValidators = [
  body('phone').optional().isString().withMessage('phone must be a string').trim().isLength({ max: 30 }).withMessage('phone must be at most 30 characters'),
  body('headline').optional().isString().trim().isLength({ max: 200 }).withMessage('headline must be at most 200 characters'),
  body('currentCompany').optional().isString().trim().isLength({ max: 150 }).withMessage('currentCompany must be at most 150 characters'),
  body('currentTitle').optional().isString().trim().isLength({ max: 150 }).withMessage('currentTitle must be at most 150 characters'),
  body('location').optional().isString().trim().isLength({ max: 200 }).withMessage('location must be at most 200 characters'),
  body('totalExperienceYears').optional().isFloat({ min: 0 }).withMessage('totalExperienceYears must be a non-negative number'),
  body('linkedinUrl').optional().isString().trim().isLength({ max: 300 }).withMessage('linkedinUrl must be at most 300 characters').isURL().withMessage('linkedinUrl must be a valid URL'),
  body('portfolioUrl').optional().isString().trim().isLength({ max: 300 }).withMessage('portfolioUrl must be at most 300 characters').isURL().withMessage('portfolioUrl must be a valid URL'),
  body('githubUrl').optional().isString().trim().isLength({ max: 300 }).withMessage('githubUrl must be at most 300 characters').isURL().withMessage('githubUrl must be a valid URL'),
  body('noticePeriodDays').optional().isInt({ min: 0 }).withMessage('noticePeriodDays must be a non-negative integer'),
  body('currentSalary').optional().isFloat({ min: 0 }).withMessage('currentSalary must be a non-negative number'),
  body('expectedSalary').optional().isFloat({ min: 0 }).withMessage('expectedSalary must be a non-negative number'),
  body('salaryCurrency').optional().isString().trim().isLength({ max: 10 }).withMessage('salaryCurrency must be at most 10 characters'),
  body('source').optional().isIn(Object.values(EmployerCandidateSource)).withMessage('Invalid source'),
  body('notes').optional().isString().trim().isLength({ max: 2000 }).withMessage('notes must be at most 2000 characters'),
  body('tags').optional().isArray({ max: 20 }).withMessage('tags must be an array of at most 20 items'),
];

const createCandidateValidation = [
  ...rejectCandidateImmutableFieldsValidation,
  body('firstName')
    .notEmpty()
    .withMessage('firstName is required')
    .isString()
    .withMessage('firstName must be a string')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('firstName must be between 1 and 100 characters'),
  body('lastName')
    .notEmpty()
    .withMessage('lastName is required')
    .isString()
    .withMessage('lastName must be a string')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('lastName must be between 1 and 100 characters'),
  body('email').notEmpty().withMessage('email is required').isEmail().withMessage('A valid email is required').isLength({ max: 254 }),
  ...candidateOptionalFieldValidators,
  // Optional (18E) — if supplied, one source-attribution record is appended
  // for the same source the candidate is created with. Best-effort only:
  // a failure here never blocks or rolls back candidate creation.
  body('sourceDetails').optional().isObject().withMessage('sourceDetails must be an object'),
  body('sourceDetails.sourceName').optional().isString().trim().isLength({ max: 200 }),
  body('sourceDetails.externalReferenceId').optional().isString().trim().isLength({ max: 150 }),
  body('sourceDetails.referrerName').optional().isString().trim().isLength({ max: 200 }),
  body('sourceDetails.referrerEmail').optional().isEmail().withMessage('sourceDetails.referrerEmail must be a valid email'),
  body('sourceDetails.agencyName').optional().isString().trim().isLength({ max: 200 }),
  body('sourceDetails.jobPortalName').optional().isString().trim().isLength({ max: 200 }),
  body('sourceDetails.campaignName').optional().isString().trim().isLength({ max: 200 }),
  body('sourceDetails.sourceUrl')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 300 })
    .isURL()
    .withMessage('sourceDetails.sourceUrl must be a valid URL'),
];

const updateCandidateValidation = [
  ...rejectCandidateImmutableFieldsValidation,
  body('firstName')
    .optional()
    .isString()
    .withMessage('firstName must be a string')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('firstName must be between 1 and 100 characters'),
  body('lastName')
    .optional()
    .isString()
    .withMessage('lastName must be a string')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('lastName must be between 1 and 100 characters'),
  body('email').optional().isEmail().withMessage('A valid email is required').isLength({ max: 254 }),
  ...candidateOptionalFieldValidators,
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Request body must be an object');
    }
    const keys = Object.keys(value);
    const unknownKeys = keys.filter((key) => !CANDIDATE_FIELD_KEYS.includes(key));
    if (unknownKeys.length > 0) {
      throw new Error(`Unknown field(s): ${unknownKeys.join(', ')}`);
    }
    if (keys.length === 0) {
      throw new Error('At least one field is required');
    }
    return true;
  }),
];

const updateCandidateStatusValidation = [
  body('status').notEmpty().withMessage('status is required').isIn(Object.values(EmployerCandidateStatus)).withMessage('Invalid status'),
];

router.get(
  '/:organizationId/candidates',
  protect,
  ...organizationIdValidation,
  ...listCandidatesValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerCandidateController.getCandidates
);

router.post(
  '/:organizationId/candidates',
  protect,
  ...organizationIdValidation,
  ...createCandidateValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerCandidateController.createCandidate
);

router.get(
  '/:organizationId/candidates/:candidateId',
  protect,
  ...organizationIdValidation,
  ...candidateIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerCandidateController.getCandidate
);

router.put(
  '/:organizationId/candidates/:candidateId',
  protect,
  ...organizationIdValidation,
  ...candidateIdValidation,
  ...updateCandidateValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerCandidateController.updateCandidate
);

router.post(
  '/:organizationId/candidates/:candidateId/status',
  protect,
  ...organizationIdValidation,
  ...candidateIdValidation,
  ...updateCandidateStatusValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerCandidateController.updateCandidateStatus
);

// ============================================================================
// Employer Candidate Source Attribution (18E) — historical provenance
// evidence only (e.g. "referred by X", "sourced via agency Y"), NEVER a
// replacement for `EmployerCandidate.source` (the candidate's own PRIMARY
// source, unchanged by this section) and never a rewrite of application
// source (EmployerJobApplication.source describes a single job
// application, not the talent-pool-wide provenance tracked here).
// Append-only — no update/delete endpoint exists. Reads use
// ORGANIZATION_VIEW (readable even on an archived organization/candidate);
// the create mutation uses INTERVIEWS_MANAGE and is blocked on an archived
// organization or candidate.
// ============================================================================

const candidateSourceAttributionIdValidation = [param('attributionId').isMongoId().withMessage('Invalid source attribution ID')];

const createSourceAttributionValidation = [
  body('organizationId').not().exists().withMessage('organizationId cannot be set'),
  body('candidateId').not().exists().withMessage('candidateId cannot be set'),
  body('recordedByMembershipId').not().exists().withMessage('recordedByMembershipId cannot be set'),
  body('createdAt').not().exists().withMessage('createdAt cannot be set'),
  body('source').notEmpty().withMessage('source is required').isIn(Object.values(EmployerCandidateSource)).withMessage('Invalid source'),
  body('sourceName').optional().isString().trim().isLength({ max: 200 }),
  body('externalReferenceId').optional().isString().trim().isLength({ max: 150 }),
  body('referrerName').optional().isString().trim().isLength({ max: 200 }),
  body('referrerEmail').optional().isEmail().withMessage('referrerEmail must be a valid email'),
  body('agencyName').optional().isString().trim().isLength({ max: 200 }),
  body('jobPortalName').optional().isString().trim().isLength({ max: 200 }),
  body('campaignName').optional().isString().trim().isLength({ max: 200 }),
  body('sourceUrl').optional().isString().trim().isLength({ max: 300 }).isURL().withMessage('sourceUrl must be a valid URL'),
  body('notes').optional().isString().trim().isLength({ max: 1000 }),
];

router.get(
  '/:organizationId/candidates/:candidateId/source-attributions',
  protect,
  ...organizationIdValidation,
  ...candidateIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerCandidateSourceAttributionController.getAttributions
);

router.post(
  '/:organizationId/candidates/:candidateId/source-attributions',
  protect,
  ...organizationIdValidation,
  ...candidateIdValidation,
  ...createSourceAttributionValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerCandidateSourceAttributionController.createAttribution
);

router.get(
  '/:organizationId/candidates/:candidateId/source-attributions/:attributionId',
  protect,
  ...organizationIdValidation,
  ...candidateIdValidation,
  ...candidateSourceAttributionIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerCandidateSourceAttributionController.getAttribution
);

// ============================================================================
// Employer Candidate Resumes (18B) — company-only, candidate-scoped resume
// FILE storage and versioning. NO AI parsing/text extraction (18C), no
// application/job linkage (18D), no screening/ranking. Reads use
// ORGANIZATION_VIEW (readable even on an archived organization/candidate);
// the upload mutation uses INTERVIEWS_MANAGE and is blocked on an archived
// organization or candidate. Every resume version is immutable and never
// deleted; uploads only ever add a new version.
// ============================================================================

const candidateResumeIdValidation = [param('resumeSourceId').isMongoId().withMessage('Invalid resume ID')];

// Memory storage only — the buffer is handed to EmployerCandidateResumeService,
// which writes it to the local resume storage directory itself (see
// candidateResumeStorage.ts) under a server-generated filename. Mirrors the
// size limit already used for question-file uploads (interview.routes.ts).
const candidateResumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_RESUME_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    const check = isAllowedResumeFile(file.originalname, file.mimetype);
    if (!check.allowed) {
      cb(new Error(`Unsupported file type. Supported types: ${ALLOWED_RESUME_EXTENSIONS.join(', ')}`));
      return;
    }
    cb(null, true);
  },
});

router.get(
  '/:organizationId/candidates/:candidateId/resumes',
  protect,
  ...organizationIdValidation,
  ...candidateIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerCandidateResumeController.getResumes
);

router.post(
  '/:organizationId/candidates/:candidateId/resumes',
  protect,
  ...organizationIdValidation,
  ...candidateIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  candidateResumeUpload.single('resume'),
  employerCandidateResumeController.uploadResume
);

// ============================================================================
// Employer Candidate Resume Analysis (18C) — AI-parsed structured profile
// extracted from the CURRENT resume version only. NO evaluation/scoring/
// ranking, no application/job linkage, no automatic EmployerCandidate
// writes. Reads use ORGANIZATION_VIEW (readable even on an archived
// organization/candidate); the analyze mutation uses INTERVIEWS_MANAGE and
// is blocked on an archived organization or candidate.
//
// NOTE: `GET .../resumes/analysis` is registered BEFORE
// `GET .../resumes/:resumeSourceId` (below) so the literal "analysis"
// segment is matched first — otherwise the wildcard route would swallow it.
// ============================================================================

router.post(
  '/:organizationId/candidates/:candidateId/resumes/analyze',
  protect,
  ...organizationIdValidation,
  ...candidateIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerCandidateResumeAnalysisController.analyzeCurrentResume
);

router.get(
  '/:organizationId/candidates/:candidateId/resumes/analysis',
  protect,
  ...organizationIdValidation,
  ...candidateIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerCandidateResumeAnalysisController.getCurrentAnalysis
);

router.get(
  '/:organizationId/candidates/:candidateId/resumes/:resumeSourceId',
  protect,
  ...organizationIdValidation,
  ...candidateIdValidation,
  ...candidateResumeIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerCandidateResumeController.getResume
);

router.get(
  '/:organizationId/candidates/:candidateId/resumes/:resumeSourceId/file',
  protect,
  ...organizationIdValidation,
  ...candidateIdValidation,
  ...candidateResumeIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerCandidateResumeController.getResumeFile
);

router.get(
  '/:organizationId/candidates/:candidateId/resumes/:resumeSourceId/analysis',
  protect,
  ...organizationIdValidation,
  ...candidateIdValidation,
  ...candidateResumeIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerCandidateResumeAnalysisController.getAnalysisForSource
);

// ============================================================================
// Employer Job Applications (18D) — company-only, links an existing
// candidate to an existing job within ONE organization. No screening/
// ranking (19), no interview blueprint/invitations (20), no AI. Reads use
// ORGANIZATION_VIEW; mutations (create, generic update, and the dedicated
// status endpoint) use INTERVIEWS_MANAGE. `jobId`/`candidateId`/`status`/
// `organizationId`/`createdByMembershipId`/timestamps are rejected on the
// generic update; status only ever changes through
// POST .../applications/:applicationId/status. One application per
// candidate per job — duplicate create is rejected with 409.
// ============================================================================

const applicationIdValidation = [param('applicationId').isMongoId().withMessage('Invalid application ID')];

const listApplicationsValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('jobId').optional().isMongoId().withMessage('Invalid jobId'),
  query('candidateId').optional().isMongoId().withMessage('Invalid candidateId'),
  query('status').optional().isIn(Object.values(EmployerJobApplicationStatus)).withMessage('Invalid status'),
  query('source').optional().isIn(Object.values(EmployerJobApplicationSource)).withMessage('Invalid source'),
  query('search').optional().isString().trim().isLength({ max: 200 }),
];

const APPLICATION_UPDATE_FIELD_KEYS = ['notes', 'source'];

const rejectApplicationImmutableFieldsValidation = [
  body('jobId').not().exists().withMessage('jobId cannot be changed'),
  body('candidateId').not().exists().withMessage('candidateId cannot be changed'),
  body('organizationId').not().exists().withMessage('organizationId cannot be set'),
  body('createdByMembershipId').not().exists().withMessage('createdByMembershipId cannot be set'),
  body('status').not().exists().withMessage('status cannot be changed directly — use POST .../status'),
  body('createdAt').not().exists().withMessage('createdAt cannot be set'),
  body('updatedAt').not().exists().withMessage('updatedAt cannot be set'),
];

const createApplicationValidation = [
  ...rejectApplicationImmutableFieldsValidation,
  body('jobId').isMongoId().withMessage('A valid jobId is required'),
  body('candidateId').isMongoId().withMessage('A valid candidateId is required'),
  body('source').optional().isIn(Object.values(EmployerJobApplicationSource)).withMessage('Invalid source'),
  body('notes').optional().isString().trim().isLength({ max: 2000 }).withMessage('notes must be at most 2000 characters'),
];

const updateApplicationValidation = [
  ...rejectApplicationImmutableFieldsValidation,
  body('source').optional().isIn(Object.values(EmployerJobApplicationSource)).withMessage('Invalid source'),
  body('notes').optional().isString().trim().isLength({ max: 2000 }).withMessage('notes must be at most 2000 characters'),
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Request body must be an object');
    }
    const keys = Object.keys(value);
    const unknownKeys = keys.filter((key) => !APPLICATION_UPDATE_FIELD_KEYS.includes(key));
    if (unknownKeys.length > 0) {
      throw new Error(`Unknown field(s): ${unknownKeys.join(', ')}`);
    }
    if (keys.length === 0) {
      throw new Error('At least one field is required');
    }
    return true;
  }),
];

const updateApplicationStatusValidation = [
  body('status')
    .notEmpty()
    .withMessage('status is required')
    .isIn(Object.values(EmployerJobApplicationStatus))
    .withMessage('Invalid status'),
];

router.get(
  '/:organizationId/applications',
  protect,
  ...organizationIdValidation,
  ...listApplicationsValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerJobApplicationController.getApplications
);

router.post(
  '/:organizationId/applications',
  protect,
  ...organizationIdValidation,
  ...createApplicationValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerJobApplicationController.createApplication
);

router.get(
  '/:organizationId/applications/:applicationId',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerJobApplicationController.getApplication
);

router.put(
  '/:organizationId/applications/:applicationId',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  ...updateApplicationValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerJobApplicationController.updateApplication
);

router.post(
  '/:organizationId/applications/:applicationId/status',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  ...updateApplicationStatusValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerJobApplicationController.updateApplicationStatus
);

// PATCH .../applications/:applicationId/pipeline-stage (23B) — same
// lifecycle authority as POST .../status above (pure pass-through to
// EmployerJobApplicationService.updateApplicationStatus); a distinct route
// for the Hiring Pipeline board's "move stage" action only.
router.patch(
  '/:organizationId/applications/:applicationId/pipeline-stage',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  ...updateApplicationStatusValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerHiringPipelineController.moveApplicationStage
);

// GET .../applications/:applicationId/timeline (23C) — append-only audit
// history: stored activities + a deterministic fallback creation milestone
// + a live-derived assessment_finalized milestone. Read-only; archived
// applications remain readable.
router.get(
  '/:organizationId/applications/:applicationId/timeline',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerJobApplicationTimelineController.getTimeline
);

// POST/GET .../applications/:applicationId/decisions (23E) — append-only,
// HUMAN-entered decision/reason audit log. Audit labels only — never
// writes application.status, never auto-created by a status move.
const createDecisionValidation = [
  body('decisionType').isIn(EMPLOYER_JOB_APPLICATION_DECISION_TYPES).withMessage('Invalid decisionType'),
  body('reasonCode').isIn(EMPLOYER_JOB_APPLICATION_DECISION_REASON_CODES).withMessage('Invalid reasonCode'),
  body('notes').optional().isString().trim().isLength({ max: 2000 }).withMessage('notes must be at most 2000 characters'),
];

router.post(
  '/:organizationId/applications/:applicationId/decisions',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  ...createDecisionValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerJobApplicationDecisionController.createDecision
);

router.get(
  '/:organizationId/applications/:applicationId/decisions',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerJobApplicationDecisionController.getDecisions
);

// POST/GET .../applications/:applicationId/notes (24A) — internal employer
// collaboration notes, immutable after creation. Discussion/context only —
// never affects scores, recommendations, or pipeline status.
const createNoteValidation = [
  body('body').isString().trim().isLength({ min: 1, max: 3000 }).withMessage('body is required (max 3000 characters)'),
  body('mentionMembershipIds').optional().isArray({ max: 10 }).withMessage('mentionMembershipIds must be an array of at most 10 ids'),
  body('mentionMembershipIds.*').optional().isMongoId().withMessage('Invalid mentionMembershipIds entry'),
];

router.post(
  '/:organizationId/applications/:applicationId/notes',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  ...createNoteValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerJobApplicationNoteController.createNote
);

router.get(
  '/:organizationId/applications/:applicationId/notes',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerJobApplicationNoteController.getNotes
);

// GET/POST/PUT/DELETE .../applications/:applicationId/collaborators (24B) —
// application-local collaboration metadata ONLY. `collaborationRole` is
// never an RBAC permission; organization RBAC remains authoritative.
const assignCollaboratorValidation = [
  body('membershipId').isMongoId().withMessage('Invalid membershipId'),
  body('collaborationRole').isIn(Object.values(EmployerJobApplicationCollaborationRole)).withMessage('Invalid collaborationRole'),
];
const membershipIdParamValidation = [param('membershipId').isMongoId().withMessage('Invalid membershipId')];

router.get(
  '/:organizationId/applications/:applicationId/collaborators',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerJobApplicationCollaborationController.getCollaborators
);

router.post(
  '/:organizationId/applications/:applicationId/collaborators',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  ...assignCollaboratorValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerJobApplicationCollaborationController.assignCollaborator
);

router.put(
  '/:organizationId/applications/:applicationId/collaborators',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  ...assignCollaboratorValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerJobApplicationCollaborationController.assignCollaborator
);

router.delete(
  '/:organizationId/applications/:applicationId/collaborators/:membershipId',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  ...membershipIdParamValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerJobApplicationCollaborationController.removeCollaborator
);

// GET .../collaboration/mentions (24B) — notes mentioning the ACTING
// membership, newest-first. In-app discoverability only, no delivery.
router.get(
  '/:organizationId/collaboration/mentions',
  protect,
  ...organizationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerCollaborationMentionsController.getMentions
);

// GET/PATCH/POST .../collaboration/notifications (24C) — in-app-only
// employer notification center. No email/SMS/push/delivery. Recipient is
// always the ACTING organization membership, never another member.
const notificationIdParamValidation = [param('notificationId').isMongoId().withMessage('Invalid notificationId')];

router.get(
  '/:organizationId/collaboration/notifications',
  protect,
  ...organizationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerCollaborationNotificationController.listNotifications
);

router.patch(
  '/:organizationId/collaboration/notifications/:notificationId/read',
  protect,
  ...organizationIdValidation,
  ...notificationIdParamValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerCollaborationNotificationController.markRead
);

router.post(
  '/:organizationId/collaboration/notifications/read-all',
  protect,
  ...organizationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerCollaborationNotificationController.markAllRead
);

// ============================================================================
// Employer Candidate Screening (19A) — compares one application's candidate
// resume analysis against the job's FINALIZED JD Intelligence Snapshot
// (17E) using the existing AI Gateway. No ranking across candidates (19D),
// no shortlist automation (19E), no interview generation. Reads use
// ORGANIZATION_VIEW (readable even on an archived organization/
// application); the screen mutation uses INTERVIEWS_MANAGE and is blocked
// on an archived organization or archived application. Never modifies the
// application, candidate, job, JD snapshot, or resume analysis.
// ============================================================================

router.post(
  '/:organizationId/applications/:applicationId/screening',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerCandidateScreeningController.screenApplication
);

router.get(
  '/:organizationId/applications/:applicationId/screening',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerCandidateScreeningController.getCurrentScreening
);

router.get(
  '/:organizationId/applications/:applicationId/screenings',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerCandidateScreeningController.getScreeningHistory
);

// ============================================================================
// Explainable Candidate Score (19B) — a deterministic, fixed-formula
// breakdown of an already-COMPLETED 19A screening against the exact JD
// snapshot it was screened against. No AI call, no recalculation of
// skill/competency/experience/education matching, no ranking (19D), no gap
// engine (19C), no shortlist automation (19E). This calculated score is a
// SEPARATE, distinct number from the AI's own `screening.result
// .overallScore` — it never overwrites it. Reads use ORGANIZATION_VIEW and
// never calculate; generation uses INTERVIEWS_MANAGE and is blocked on an
// archived organization or archived application. Deterministic, so
// generation is idempotent: an existing score for the current screening is
// returned as-is, never recalculated.
// ============================================================================

const screeningIdValidation = [param('screeningId').isMongoId().withMessage('Invalid screening ID')];

router.post(
  '/:organizationId/applications/:applicationId/screening/score',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerCandidateScreeningScoreController.generateScore
);

router.get(
  '/:organizationId/applications/:applicationId/screening/score',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerCandidateScreeningScoreController.getScore
);

router.get(
  '/:organizationId/applications/:applicationId/screenings/:screeningId/score',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  ...screeningIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerCandidateScreeningScoreController.getScoreForScreening
);

// ============================================================================
// Candidate Skill & Requirement Gap Analysis (19C) — a deterministic
// breakdown derived from an already-COMPLETED 19A screening's own
// persisted result, its 19B explainable score (required to already exist),
// and the exact finalized JD snapshot the screening was run against. No AI
// call, no ranking (19D), no shortlist automation (19E), no remediation/
// training plan generation. Reads use ORGANIZATION_VIEW and never
// calculate; generation uses INTERVIEWS_MANAGE and is blocked on an
// archived organization or archived application. Deterministic, so
// generation is idempotent: an existing gap analysis for the current
// screening is returned as-is, never recalculated.
// ============================================================================

router.post(
  '/:organizationId/applications/:applicationId/screening/gaps',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerCandidateScreeningGapController.generateGaps
);

router.get(
  '/:organizationId/applications/:applicationId/screening/gaps',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerCandidateScreeningGapController.getGaps
);

router.get(
  '/:organizationId/applications/:applicationId/screenings/:screeningId/gaps',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  ...screeningIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerCandidateScreeningGapController.getGapsForScreening
);

// ============================================================================
// Candidate Ranking (19D) — a live, deterministic, job-level read computed
// from persisted applications + the CURRENT applicable 19B explainable
// score. No AI call, no persisted ranking document, no mutation. Ranks
// ONLY by the deterministic 19B score — never the 19A AI overallScore,
// recommendation, or gap severity. Read-only, so an archived organization/
// job remains readable.
// ============================================================================

const rankingQueryValidation = [
  query('status').optional().isIn(Object.values(EmployerJobApplicationStatus)).withMessage('Invalid application status'),
  query('minScore').optional().isFloat({ min: 0, max: 100 }).withMessage('minScore must be between 0 and 100'),
  query('search').optional().isString().trim().isLength({ max: 200 }).withMessage('search must be at most 200 characters'),
];

router.get(
  '/:organizationId/jobs/:jobId/ranking',
  protect,
  ...organizationIdValidation,
  ...jobIdValidation,
  ...rankingQueryValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerCandidateRankingController.getJobRanking
);

// ============================================================================
// Job Candidate Comparison (23A) — a live, deterministic, job-level read
// across candidates with a COMPLETED 22E finalization. Distinct from 19D's
// pre-interview screening ranking above: this orders ONLY by finalized
// post-assessment evidence metrics (comparisonPosition), never resume/
// screening scores. No AI, no persisted comparison document, no
// recommendation. Read-only, so an archived organization/job remains
// readable.
// ============================================================================

const candidateComparisonQueryValidation = [
  query('status').optional().isIn(Object.values(EmployerJobApplicationStatus)).withMessage('Invalid application status'),
  query('minOverallScore').optional().isFloat({ min: 0, max: 100 }).withMessage('minOverallScore must be between 0 and 100'),
  query('search').optional().isString().trim().isLength({ max: 200 }).withMessage('search must be at most 200 characters'),
  query('finalizedOnly').optional().isBoolean().withMessage('finalizedOnly must be a boolean'),
];

router.get(
  '/:organizationId/jobs/:jobId/candidate-comparison',
  protect,
  ...organizationIdValidation,
  ...jobIdValidation,
  ...candidateComparisonQueryValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerHiringCandidateComparisonController.getComparison
);

// ============================================================================
// Hiring Pipeline Board (23B) — a live, deterministic read grouping the
// EXISTING EmployerJobApplication.status values into columns; no new status
// model, finalized 22E assessment metadata shown for context only. Never
// auto-advances a stage based on score/finalization/comparison position.
// ============================================================================

router.get(
  '/:organizationId/jobs/:jobId/pipeline',
  protect,
  ...organizationIdValidation,
  ...jobIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerHiringPipelineController.getJobPipeline
);

// GET .../jobs/:jobId/pipeline-analytics (23D) — deterministic (no AI),
// live funnel/conversion analytics. Current-state counts are authoritative;
// observed funnel/transition timing use ONLY stored 23C activity, never
// current status inference. Never persisted.
router.get(
  '/:organizationId/jobs/:jobId/pipeline-analytics',
  protect,
  ...organizationIdValidation,
  ...jobIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerHiringPipelineAnalyticsController.getJobPipelineAnalytics
);

// ============================================================================
// Employer Shortlist Workflow (19E) — an explicit recruiter action only;
// NEVER automatic. Reuses the EXISTING 18D application lifecycle
// (screening -> shortlisted, via EmployerJobApplicationService itself) and
// the EXISTING 19A/19B services to resolve the CURRENT applicable
// screening/score — no new scoring formula. Reads use ORGANIZATION_VIEW
// (readable even on an archived organization/application); the shortlist
// mutation uses INTERVIEWS_MANAGE and is blocked on an archived
// organization, job, candidate, or application.
// ============================================================================

router.post(
  '/:organizationId/applications/:applicationId/shortlist',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerCandidateShortlistController.shortlistApplication
);

router.get(
  '/:organizationId/applications/:applicationId/shortlist',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerCandidateShortlistController.getApplicationShortlist
);

router.get(
  '/:organizationId/jobs/:jobId/shortlist',
  protect,
  ...organizationIdValidation,
  ...jobIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerCandidateShortlistController.getJobShortlist
);

// ============================================================================
// Employer Interview Blueprint (20A) — a structured interview PLAN
// (question intents / planning slots only, never final candidate-facing
// questions) for a shortlisted application. Job truth is ONLY the
// finalized JD Intelligence Snapshot (17E); candidate context is ONLY the
// structured 19A screening + 19B explainable score + (optional) 19C gap
// analysis — never raw JD/resume text, never demographic/contact
// information. No interview session/invitation is created here (20B/20C/
// 20D). Reads use ORGANIZATION_VIEW (readable even on an archived
// organization/application); the generate mutation uses INTERVIEWS_MANAGE
// and requires the application to be shortlisted with all current
// prerequisites present.
// ============================================================================

router.post(
  '/:organizationId/applications/:applicationId/interview-blueprint',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerInterviewBlueprintController.generateBlueprint
);

router.get(
  '/:organizationId/applications/:applicationId/interview-blueprint',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerInterviewBlueprintController.getCurrentBlueprint
);

router.get(
  '/:organizationId/applications/:applicationId/interview-blueprints',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerInterviewBlueprintController.getBlueprintHistory
);

// ============================================================================
// Interview Competency Coverage / Evaluation Rubric (20B) — a
// DETERMINISTIC (no AI) transformation of a COMPLETED 20A blueprint + the
// exact finalized JD competencies it was generated from into an immutable
// interviewer evaluation rubric. Guides interviewer evaluation only —
// never a candidate score, never final candidate-facing questions, no
// interview session/invitation. Reads use ORGANIZATION_VIEW (readable
// even on an archived organization/application); the generate mutation
// uses INTERVIEWS_MANAGE and requires a completed current 20A blueprint.
// ============================================================================

const blueprintIdValidation = [param('blueprintId').isMongoId().withMessage('Invalid blueprint ID')];

router.post(
  '/:organizationId/applications/:applicationId/interview-blueprint/rubric',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerInterviewCompetencyRubricController.generateRubric
);

router.get(
  '/:organizationId/applications/:applicationId/interview-blueprint/rubric',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerInterviewCompetencyRubricController.getCurrentRubric
);

router.get(
  '/:organizationId/applications/:applicationId/interview-blueprints/:blueprintId/rubric',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  ...blueprintIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerInterviewCompetencyRubricController.getRubricForBlueprint
);

// ============================================================================
// Employer Interview Invitation (20C) — a secure, hashed-token invitation
// for a shortlisted application with a completed 20A blueprint + 20B
// rubric. No email is sent, no public token-consumption endpoint yet
// (20D), no interview session/answer capture. Reads use ORGANIZATION_VIEW
// (readable even on an archived organization/application); mutations use
// INTERVIEWS_MANAGE and are blocked on an archived organization, job, or
// candidate. `invitedEmail`/`invitedName`/candidate/job/blueprint/rubric
// ids are NEVER accepted from the client — always derived server-side.
// ============================================================================

const createInterviewInvitationValidation = [
  body('organizationId').not().exists().withMessage('organizationId cannot be set'),
  body('applicationId').not().exists().withMessage('applicationId cannot be set'),
  body('jobId').not().exists().withMessage('jobId cannot be set'),
  body('candidateId').not().exists().withMessage('candidateId cannot be set'),
  body('blueprintId').not().exists().withMessage('blueprintId cannot be set'),
  body('rubricId').not().exists().withMessage('rubricId cannot be set'),
  body('status').not().exists().withMessage('status cannot be set'),
  body('tokenHash').not().exists().withMessage('tokenHash cannot be set'),
  body('invitedEmail').not().exists().withMessage('invitedEmail cannot be set — it is derived from the candidate record'),
  body('invitedName').not().exists().withMessage('invitedName cannot be set — it is derived from the candidate record'),
  body('expiresAt').not().exists().withMessage('expiresAt cannot be set directly — use expiresInDays'),
  body('createdByMembershipId').not().exists().withMessage('createdByMembershipId cannot be set'),
  body('createdAt').not().exists().withMessage('createdAt cannot be set'),
  body('updatedAt').not().exists().withMessage('updatedAt cannot be set'),
  body('expiresInDays').optional().isInt({ min: 1, max: 30 }).withMessage('expiresInDays must be between 1 and 30'),
  body('message').optional().isString().trim().isLength({ max: 1000 }).withMessage('message must be at most 1000 characters'),
];

router.post(
  '/:organizationId/applications/:applicationId/interview-invitation',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  ...createInterviewInvitationValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerInterviewInvitationController.createInvitation
);

router.get(
  '/:organizationId/applications/:applicationId/interview-invitation',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerInterviewInvitationController.getCurrentInvitation
);

router.post(
  '/:organizationId/applications/:applicationId/interview-invitation/regenerate',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerInterviewInvitationController.regenerateInvitation
);

router.post(
  '/:organizationId/applications/:applicationId/interview-invitation/revoke',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerInterviewInvitationController.revokeInvitation
);

// ============================================================================
// Employer Interview Session — authenticated recruiter READ only (20E).
// The session itself is created exclusively through the PUBLIC candidate
// handoff (see publicEmployerInterviewInvitation.routes.ts); no mutation
// exists on this authenticated side.
// ============================================================================

router.get(
  '/:organizationId/applications/:applicationId/interview-session',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerInterviewSessionController.getCurrentSession
);

// GET .../interview-session/questions (21A) — recruiter-facing read of the
// materialized questions, including evaluation metadata never shown to the
// candidate. No mutation; materialization itself only happens through the
// public candidate handoff.
router.get(
  '/:organizationId/applications/:applicationId/interview-session/questions',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerInterviewSessionController.getCurrentSessionQuestions
);

// GET .../interview-session/answers (21B) — recruiter-facing read of saved
// candidate answers. No evaluation field exists yet.
router.get(
  '/:organizationId/applications/:applicationId/interview-session/answers',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerInterviewSessionController.getCurrentSessionAnswers
);

// POST .../interview-session/evaluate (21D) — question-level evaluation only,
// no final report. Mutation, so INTERVIEWS_MANAGE (not ORGANIZATION_VIEW).
router.post(
  '/:organizationId/applications/:applicationId/interview-session/evaluate',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerInterviewSessionController.evaluateCurrentSession
);

// POST/GET .../interview-session/result (21E) — deterministic (no AI)
// aggregate of 21D question evaluations into one immutable result.
router.post(
  '/:organizationId/applications/:applicationId/interview-session/result',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerHiringAssessmentResultController.createResult
);

router.get(
  '/:organizationId/applications/:applicationId/interview-session/result',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerHiringAssessmentResultController.getResult
);

// POST/GET .../interview-session/evidence (22A) — deterministic (no AI)
// evidence matrix built from 21D evaluations + 21E assessment result.
router.post(
  '/:organizationId/applications/:applicationId/interview-session/evidence',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerHiringEvidenceMatrixController.createMatrix
);

router.get(
  '/:organizationId/applications/:applicationId/interview-session/evidence',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerHiringEvidenceMatrixController.getMatrix
);

// POST/GET .../interview-session/follow-up-plan (22B) — employer-only
// follow-up question SUGGESTIONS for competencies the 22A evidence matrix
// marked requiresFollowUp. Never appended to Interview.questions.
router.post(
  '/:organizationId/applications/:applicationId/interview-session/follow-up-plan',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerHiringFollowUpPlanController.createPlan
);

router.get(
  '/:organizationId/applications/:applicationId/interview-session/follow-up-plan',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerHiringFollowUpPlanController.getPlan
);

// POST/GET .../interview-session/report (22C) — one immutable, employer-only
// narrative report built from 21E result + 22A matrix + 22B follow-up plan.
// No hire/reject recommendation, never candidate-facing.
router.post(
  '/:organizationId/applications/:applicationId/interview-session/report',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerHiringAssessmentReportController.createReport
);

router.get(
  '/:organizationId/applications/:applicationId/interview-session/report',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerHiringAssessmentReportController.getReport
);

// GET .../interview-session/report/export (22D) — authenticated, exact-tenant
// PDF download of the existing immutable 22C report. No public/token access.
router.get(
  '/:organizationId/applications/:applicationId/interview-session/report/export',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerHiringAssessmentReportController.exportReport
);

// GET/POST .../interview-session/report/reviews (22D) — informational
// recruiter review workflow, never a hire/reject verdict, never mutates
// the report or EmployerJobApplication.status.
router.get(
  '/:organizationId/applications/:applicationId/interview-session/report/reviews',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerHiringReportReviewController.getReviews
);

router.post(
  '/:organizationId/applications/:applicationId/interview-session/report/reviews',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  body('reviewNotes').optional().isString().trim().isLength({ max: 2000 }).withMessage('reviewNotes must be at most 2000 characters'),
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerHiringReportReviewController.upsertReview
);

// POST/GET .../interview-session/finalization (22E) — one immutable record
// pinning the completed Sprint 21/22 assessment evidence package for
// downstream Sprint 23 work. NOT a hire/reject decision.
router.post(
  '/:organizationId/applications/:applicationId/interview-session/finalization',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  employerHiringAssessmentFinalizationController.createFinalization
);

router.get(
  '/:organizationId/applications/:applicationId/interview-session/finalization',
  protect,
  ...organizationIdValidation,
  ...applicationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  employerHiringAssessmentFinalizationController.getFinalization
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

// ---- Institute Batches (11A) — institute-only (400 for a company org). DELETE is soft/idempotent. ----

router.get(
  '/:organizationId/batches',
  protect,
  ...organizationIdValidation,
  ...listBatchesValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  instituteBatchController.getBatches
);

router.post(
  '/:organizationId/batches',
  protect,
  ...organizationIdValidation,
  ...createBatchValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_UPDATE),
  instituteBatchController.createBatch
);

router.get(
  '/:organizationId/batches/:batchId',
  protect,
  ...organizationIdValidation,
  ...batchIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  instituteBatchController.getBatch
);

router.put(
  '/:organizationId/batches/:batchId',
  protect,
  ...organizationIdValidation,
  ...batchIdValidation,
  ...updateBatchValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_UPDATE),
  instituteBatchController.updateBatch
);

router.delete(
  '/:organizationId/batches/:batchId',
  protect,
  ...organizationIdValidation,
  ...batchIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_UPDATE),
  instituteBatchController.removeBatch
);

// ---- Institute Batch Readiness (UI-08) — read-only, institute-MANAGEMENT view (no trainer-assignment scope gate, unlike the 15C trainer-batches/:batchId/readiness endpoint). Institute-only; archived org readable. ----

router.get(
  '/:organizationId/batches/:batchId/readiness',
  protect,
  ...organizationIdValidation,
  ...batchIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ANALYTICS_VIEW),
  instituteBatchReadinessController.getBatchReadiness
);

// ---- Institute Students (11B) — institute-only (400 for a company org). Roster/profile data only. DELETE is soft/idempotent. ----

router.get(
  '/:organizationId/students',
  protect,
  ...organizationIdValidation,
  ...listStudentsValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  instituteStudentController.getStudents
);

router.post(
  '/:organizationId/students',
  protect,
  ...organizationIdValidation,
  ...createStudentValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_UPDATE),
  instituteStudentController.createStudent
);

router.post(
  '/:organizationId/students/bulk',
  protect,
  ...organizationIdValidation,
  ...bulkCreateStudentsValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_UPDATE),
  instituteStudentController.bulkCreateStudents
);

router.post(
  '/:organizationId/students/assign',
  protect,
  ...organizationIdValidation,
  ...bulkAssignStudentsValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_UPDATE),
  instituteStudentController.bulkAssignStudents
);

router.get(
  '/:organizationId/students/:studentId',
  protect,
  ...organizationIdValidation,
  ...studentIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  instituteStudentController.getStudent
);

router.put(
  '/:organizationId/students/:studentId',
  protect,
  ...organizationIdValidation,
  ...studentIdValidation,
  ...updateStudentValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_UPDATE),
  instituteStudentController.updateStudent
);

router.delete(
  '/:organizationId/students/:studentId',
  protect,
  ...organizationIdValidation,
  ...studentIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_UPDATE),
  instituteStudentController.removeStudent
);

// ---- Student <-> User linkage (11C) — links to an EXISTING active User only; never creates one. ----

const linkStudentUserValidation = [body('userId').optional().isMongoId().withMessage('userId must be a valid ID')];

router.post(
  '/:organizationId/students/:studentId/link-user',
  protect,
  ...organizationIdValidation,
  ...studentIdValidation,
  ...linkStudentUserValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_UPDATE),
  instituteStudentController.linkUser
);

router.delete(
  '/:organizationId/students/:studentId/link-user',
  protect,
  ...organizationIdValidation,
  ...studentIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_UPDATE),
  instituteStudentController.unlinkUser
);

// ---- Institute Trainers (12A) — trainer identity is the EXISTING OrganizationMember (role TRAINER); only optional profile metadata is managed here. Institute-only (400 for a company org). ----

router.get(
  '/:organizationId/trainers',
  protect,
  ...organizationIdValidation,
  ...listTrainersValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.MEMBERS_VIEW),
  instituteTrainerController.getTrainers
);

router.get(
  '/:organizationId/trainers/:membershipId',
  protect,
  ...organizationIdValidation,
  ...trainerMembershipIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.MEMBERS_VIEW),
  instituteTrainerController.getTrainer
);

router.put(
  '/:organizationId/trainers/:membershipId/profile',
  protect,
  ...organizationIdValidation,
  ...trainerMembershipIdValidation,
  ...updateTrainerProfileValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.MEMBERS_MANAGE),
  instituteTrainerController.updateTrainerProfile
);

// ---- Trainer Assignments (12B) — links a trainer to exactly one course XOR batch. Institute-only. GET allowed on archived org; mutations => 409. ----

router.get(
  '/:organizationId/trainers/:membershipId/assignments',
  protect,
  ...organizationIdValidation,
  ...trainerMembershipIdValidation,
  ...listTrainerAssignmentsValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.MEMBERS_VIEW),
  instituteTrainerAssignmentController.getAssignments
);

router.post(
  '/:organizationId/trainers/:membershipId/assignments',
  protect,
  ...organizationIdValidation,
  ...trainerMembershipIdValidation,
  ...createTrainerAssignmentValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.MEMBERS_MANAGE),
  instituteTrainerAssignmentController.createAssignment
);

router.delete(
  '/:organizationId/trainers/:membershipId/assignments/:assignmentId',
  protect,
  ...organizationIdValidation,
  ...trainerMembershipIdValidation,
  ...trainerAssignmentIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.MEMBERS_MANAGE),
  instituteTrainerAssignmentController.deleteAssignment
);

// ---- Organization-scoped Question Sets (UI-05 unblock) — SEPARATE from personal /question-sets; never falls back to a personal set. Available to any organization type (not institute-only). Archived org: reads allowed, mutations => 409. ----

router.post(
  '/:organizationId/question-sets',
  protect,
  ...organizationIdValidation,
  ...createOrgQuestionSetValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.QUESTION_SETS_MANAGE),
  instituteQuestionSetController.createQuestionSet
);

router.get(
  '/:organizationId/question-sets',
  protect,
  ...organizationIdValidation,
  ...listOrgQuestionSetsValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.QUESTION_SETS_VIEW),
  instituteQuestionSetController.getQuestionSets
);

router.get(
  '/:organizationId/question-sets/:questionSetId',
  protect,
  ...organizationIdValidation,
  ...questionSetIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.QUESTION_SETS_VIEW),
  instituteQuestionSetController.getQuestionSet
);

router.put(
  '/:organizationId/question-sets/:questionSetId',
  protect,
  ...organizationIdValidation,
  ...questionSetIdValidation,
  ...updateOrgQuestionSetValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.QUESTION_SETS_MANAGE),
  instituteQuestionSetController.updateQuestionSet
);

router.delete(
  '/:organizationId/question-sets/:questionSetId',
  protect,
  ...organizationIdValidation,
  ...questionSetIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.QUESTION_SETS_MANAGE),
  instituteQuestionSetController.deleteQuestionSet
);

// ---- Institute Interview Templates (12C) — references an EXISTING QuestionSet by id only. Institute-only (400 for a company org). ----

router.get(
  '/:organizationId/interview-templates',
  protect,
  ...organizationIdValidation,
  ...listTemplatesValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.QUESTION_SETS_VIEW),
  instituteInterviewTemplateController.getTemplates
);

router.post(
  '/:organizationId/interview-templates',
  protect,
  ...organizationIdValidation,
  ...createTemplateValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.QUESTION_SETS_MANAGE),
  instituteInterviewTemplateController.createTemplate
);

router.get(
  '/:organizationId/interview-templates/:templateId',
  protect,
  ...organizationIdValidation,
  ...templateIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.QUESTION_SETS_VIEW),
  instituteInterviewTemplateController.getTemplate
);

router.put(
  '/:organizationId/interview-templates/:templateId',
  protect,
  ...organizationIdValidation,
  ...templateIdValidation,
  ...updateTemplateValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.QUESTION_SETS_MANAGE),
  instituteInterviewTemplateController.updateTemplate
);

router.delete(
  '/:organizationId/interview-templates/:templateId',
  protect,
  ...organizationIdValidation,
  ...templateIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.QUESTION_SETS_MANAGE),
  instituteInterviewTemplateController.removeTemplate
);

// ---- Institute Student Interview Assignments (12D) — assigns an EXISTING active template to EXISTING active students. Does NOT create/start an Interview (12E). Institute-only. GET allowed on archived org; POST => 409. ----

router.post(
  '/:organizationId/interview-assignments',
  protect,
  ...organizationIdValidation,
  ...assignInterviewValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  instituteStudentInterviewAssignmentController.assignInterview
);

router.get(
  '/:organizationId/interview-assignments',
  protect,
  ...organizationIdValidation,
  ...listInterviewAssignmentsValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_VIEW),
  instituteStudentInterviewAssignmentController.getAssignments
);

// ---- Institute Interview Assignment Lifecycle (12E) — start creates a real Interview (no B2C credit involvement); cancel only before completion. Institute-only. Mutations => 409 on archived org; GET allowed. ----

router.get(
  '/:organizationId/interview-assignments/:assignmentId',
  protect,
  ...organizationIdValidation,
  ...assignmentIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_VIEW),
  instituteStudentInterviewAssignmentController.getAssignment
);

router.post(
  '/:organizationId/interview-assignments/:assignmentId/start',
  protect,
  ...organizationIdValidation,
  ...assignmentIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  instituteStudentInterviewAssignmentController.startAssignment
);

router.post(
  '/:organizationId/interview-assignments/:assignmentId/cancel',
  protect,
  ...organizationIdValidation,
  ...assignmentIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_MANAGE),
  instituteStudentInterviewAssignmentController.cancelAssignment
);

// ---- Institute Overview (10D) — read-only, combines profile + branch/course counts. Institute-only (400 for a company org); archived org readable. ----

router.get(
  '/:organizationId/institute-overview',
  protect,
  ...organizationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  instituteOverviewController.getOverview
);

// ---- Institute Trainer Dashboard (14A) — read-only, scoped to the calling TRAINER's own course/batch assignments. Institute-only; OWNER/ADMIN cannot impersonate a trainer here (checked service-side). Archived org: read allowed. ----

router.get(
  '/:organizationId/trainer-dashboard',
  protect,
  ...organizationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.INTERVIEWS_VIEW),
  instituteTrainerDashboardController.getDashboard
);

// ---- Institute Trainer Student Reports (14B) — read-only, scoped to a student inside the calling TRAINER's own course/batch assignments. Institute-only; OWNER/ADMIN cannot impersonate a trainer here (checked service-side). Archived org: read allowed. ----

const trainerStudentReportsListValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
];

router.get(
  '/:organizationId/trainer-students/:studentId/reports',
  protect,
  ...organizationIdValidation,
  ...studentIdValidation,
  ...trainerStudentReportsListValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.REPORTS_VIEW),
  instituteTrainerStudentReportController.getReports
);

router.get(
  '/:organizationId/trainer-students/:studentId/reports/:assignmentId',
  protect,
  ...organizationIdValidation,
  ...studentIdValidation,
  ...assignmentIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.REPORTS_VIEW),
  instituteTrainerStudentReportController.getReportDetail
);

// ---- Institute Trainer Batch Analytics (14C) — read-only, scoped to a batch inside the calling TRAINER's own course/batch assignments. Institute-only; OWNER/ADMIN cannot impersonate a trainer here (checked service-side). Archived org: read allowed. ----

router.get(
  '/:organizationId/trainer-batches/:batchId/analytics',
  protect,
  ...organizationIdValidation,
  ...batchIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ANALYTICS_VIEW),
  instituteTrainerBatchAnalyticsController.getBatchAnalytics
);

// ---- Institute Trainer Skill-Gap Analytics (14D) — read-only, derived entirely from already-persisted evaluation data (no AI calls). Same batch scope as 14C. Archived org: read allowed. ----

router.get(
  '/:organizationId/trainer-batches/:batchId/skill-gaps',
  protect,
  ...organizationIdValidation,
  ...batchIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ANALYTICS_VIEW),
  instituteTrainerSkillGapController.getSkillGaps
);

// ---- Institute Trainer Batch Readiness Analytics (15C) — read-only, aggregates PlacementReadinessService (15A) output per batch. Same batch scope as 14C/14D. Archived org: read allowed. ----

router.get(
  '/:organizationId/trainer-batches/:batchId/readiness',
  protect,
  ...organizationIdValidation,
  ...batchIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ANALYTICS_VIEW),
  instituteTrainerBatchReadinessController.getBatchReadiness
);

// ---- Institute Interview Credits (15E) — foundation only, no payment gateway/subscription billing. Institute-only. Reads allowed on an archived org; grant (mutation) => 409. ----

const listInterviewCreditLedgerValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
];

const grantInterviewCreditsValidation = [
  body('planCode').optional().isIn(Object.values(InstitutePlanCode)).withMessage('Invalid plan code'),
  body('amount').optional().isInt({ min: 1 }).withMessage('amount must be a positive integer'),
  body('idempotencyKey').notEmpty().withMessage('idempotencyKey is required').isString(),
];

router.get(
  '/:organizationId/interview-credits',
  protect,
  ...organizationIdValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  instituteInterviewCreditController.getCreditSummary
);

router.get(
  '/:organizationId/interview-credits/ledger',
  protect,
  ...organizationIdValidation,
  ...listInterviewCreditLedgerValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_VIEW),
  instituteInterviewCreditController.getLedger
);

router.post(
  '/:organizationId/interview-credits/grant',
  protect,
  ...organizationIdValidation,
  ...grantInterviewCreditsValidation,
  validate,
  requireOrganizationPermission(OrganizationPermission.ORGANIZATION_UPDATE),
  instituteInterviewCreditController.grantCredits
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
