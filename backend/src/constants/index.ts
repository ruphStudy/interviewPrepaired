export const INTERVIEW_TYPES = [
  'technical',
  'behavioral',
  'leadership',
  'managerial',
  'system-design',
  'coding',
  'product',
  'general',
] as const;

export const DIFFICULTY_LEVELS = [
  'beginner',
  'intermediate',
  'advanced',
  'expert',
] as const;

export const INTERVIEW_STATUSES = [
  'created',
  'in-progress',
  'paused',
  'completed',
  'evaluated',
  'archived',
] as const;

export const GRADES = ['A+', 'A', 'B', 'C', 'D', 'F'] as const;

export const USER_ROLES = ['user', 'admin'] as const;

export const THEMES = ['light', 'dark', 'auto'] as const;

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

export const PASSWORD_MIN_LENGTH = 8;
export const NAME_MAX_LENGTH = 50;

export const OPENAI_MODELS = {
  QUESTION_GENERATION: 'gpt-3.5-turbo',
  EVALUATION: 'gpt-4',
} as const;

export const OPENAI_PRICING = {
  'gpt-4': {
    prompt: 0.03 / 1000,
    completion: 0.06 / 1000,
  },
  'gpt-3.5-turbo': {
    prompt: 0.0005 / 1000,
    completion: 0.0015 / 1000,
  },
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export const ERROR_MESSAGES = {
  UNAUTHORIZED: 'Not authorized to access this route',
  FORBIDDEN: 'You do not have permission to perform this action',
  NOT_FOUND: 'Resource not found',
  VALIDATION_ERROR: 'Validation error',
  SERVER_ERROR: 'Internal server error',
  INVALID_CREDENTIALS: 'Invalid credentials',
  USER_EXISTS: 'User already exists with this email',
  USER_NOT_FOUND: 'User not found',
  INTERVIEW_NOT_FOUND: 'Interview not found',
} as const;
