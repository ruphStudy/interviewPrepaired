/**
 * Coding question foundation (30A). The supported-language set is
 * deliberately small and explicit — ONLY languages 30C can realistically
 * execute later. Never claim support for a language that cannot be run.
 */
export const CODING_SUPPORTED_LANGUAGES = ['javascript', 'typescript', 'python'] as const;
export type CodingSupportedLanguage = (typeof CODING_SUPPORTED_LANGUAGES)[number];

export type EmployerCodingQuestionDifficulty = 'easy' | 'medium' | 'hard';
export type EmployerCodingQuestionStatus = 'draft' | 'ready' | 'archived';

export const CODING_QUESTION_DIFFICULTIES: EmployerCodingQuestionDifficulty[] = ['easy', 'medium', 'hard'];

export const MIN_TIME_LIMIT_MS = 500;
export const MAX_TIME_LIMIT_MS = 10_000;
export const MIN_MEMORY_LIMIT_MB = 16;
export const MAX_MEMORY_LIMIT_MB = 1024;

export const MAX_TITLE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 8000;
export const MAX_CONSTRAINT_LENGTH = 300;
export const MAX_CONSTRAINTS = 20;
export const MAX_EXAMPLES = 10;
export const MAX_EXAMPLE_FIELD_LENGTH = 2000;
export const MAX_STARTER_CODE_LENGTH = 10_000;
export const MAX_COMPETENCY_NAMES = 10;
export const MAX_SKILLS = 15;
export const MAX_FUNCTION_PARAMETERS = 10;
