/** Lifecycle of one AI-generated competency blueprint for a single JD source version (17D). */
export enum EmployerJobDescriptionCompetenciesStatus {
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum EmployerJobCompetencyCategory {
  TECHNICAL = 'technical',
  PROBLEM_SOLVING = 'problem_solving',
  SYSTEM_DESIGN = 'system_design',
  COMMUNICATION = 'communication',
  LEADERSHIP = 'leadership',
  DOMAIN = 'domain',
  EXECUTION = 'execution',
  COLLABORATION = 'collaboration',
  OTHER = 'other',
}

export enum EmployerJobCompetencyImportance {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

export const MIN_COMPETENCIES = 3;
export const MAX_COMPETENCIES = 12;
