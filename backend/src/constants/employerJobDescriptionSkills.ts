/** Lifecycle of one AI-extracted skill set for a single JD source version (17C). */
export enum EmployerJobDescriptionSkillsStatus {
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum EmployerJobSkillCategory {
  TECHNICAL = 'technical',
  TOOL = 'tool',
  DOMAIN = 'domain',
  SOFT_SKILL = 'soft_skill',
  METHODOLOGY = 'methodology',
  OTHER = 'other',
}

export enum EmployerJobSkillRequirement {
  MANDATORY = 'mandatory',
  PREFERRED = 'preferred',
  INFERRED = 'inferred',
}

export enum EmployerJobSkillProficiency {
  FOUNDATIONAL = 'foundational',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
  EXPERT = 'expert',
  UNSPECIFIED = 'unspecified',
}

export enum EmployerJobSkillImportance {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}
