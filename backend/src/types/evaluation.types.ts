/**
 * Evaluation Engine - Type Definitions & Validation
 * 
 * Complete TypeScript types and Zod schemas for evaluation system
 */

import { z } from 'zod';

// ============================================================================
// Core Evaluation Types
// ============================================================================

/**
 * Interview types supported by the evaluation engine
 */
export enum InterviewType {
  NODE_JS = 'NodeJS',
  REACT = 'React',
  ANGULAR = 'Angular',
  MONGODB = 'MongoDB',
  TYPESCRIPT = 'TypeScript',
  SYSTEM_DESIGN = 'SystemDesign',
  TEAM_LEAD = 'TeamLead',
  ENGINEERING_MANAGER = 'EngineeringManager',
}

/**
 * Difficulty levels
 */
export enum DifficultyLevel {
  BEGINNER = 'Beginner',
  INTERMEDIATE = 'Intermediate',
  ADVANCED = 'Advanced',
  EXPERT = 'Expert',
}

/**
 * Grade levels for overall evaluation
 */
export enum Grade {
  EXCELLENT = 'Excellent',        // 9.0-10.0
  GOOD = 'Good',                   // 7.5-8.9
  AVERAGE = 'Average',             // 6.0-7.4
  BELOW_AVERAGE = 'Below Average', // 4.5-5.9
  POOR = 'Poor',                   // 0.0-4.4
}

/**
 * Individual score (0-10)
 */
export type Score = number; // 0-10, with one decimal place

/**
 * Evaluation scores for all dimensions
 */
export interface EvaluationScores {
  technical: Score;
  communication: Score;
  leadership: Score;
  problemSolving: Score;
  confidence: Score;
  overall: Score;
}

/**
 * Keyword coverage analysis
 */
export interface KeywordCoverage {
  expected: string[];   // Key concepts expected in answer
  covered: string[];    // Concepts candidate mentioned
  missing: string[];    // Important concepts not covered
}

/**
 * Complete evaluation result
 */
export interface EvaluationResult {
  // Scores (0-10)
  technical: Score;
  communication: Score;
  leadership: Score;
  problemSolving: Score;
  confidence: Score;
  overall: Score;

  // Grade
  grade: Grade;

  // Detailed feedback
  strengths: string[];        // 2-4 specific strengths
  weaknesses: string[];       // 2-4 specific weaknesses
  suggestions: string[];      // 3-5 actionable suggestions

  // Additional analysis
  detailedAnalysis: string;   // 2-3 sentence summary
  keywordCoverage: KeywordCoverage;
}

/**
 * Evaluation request input
 */
export interface EvaluationRequest {
  question: string;
  answer: string;
  interviewType: InterviewType;
  difficulty?: DifficultyLevel;
  experienceYears?: number;
  context?: {
    jobDescription?: string;
    previousQuestions?: string[];
  };
}

/**
 * Role-specific weight configuration
 */
export interface WeightConfig {
  technical: number;
  communication: number;
  leadership: number;
  problemSolving: number;
  confidence: number;
}

// ============================================================================
// Zod Validation Schemas
// ============================================================================

/**
 * Score validation (0-10, one decimal)
 */
export const ScoreSchema = z
  .number()
  .min(0, 'Score must be at least 0')
  .max(10, 'Score must be at most 10')
  .refine(
    (val) => Math.round(val * 10) === val * 10,
    'Score must have at most one decimal place'
  );

/**
 * Interview type validation
 */
export const InterviewTypeSchema = z.nativeEnum(InterviewType);

/**
 * Difficulty level validation
 */
export const DifficultyLevelSchema = z.nativeEnum(DifficultyLevel);

/**
 * Grade validation
 */
export const GradeSchema = z.nativeEnum(Grade);

/**
 * Keyword coverage validation
 */
export const KeywordCoverageSchema = z.object({
  expected: z.array(z.string()).min(1, 'At least one expected keyword required'),
  covered: z.array(z.string()),
  missing: z.array(z.string()),
});

/**
 * Evaluation scores validation
 */
export const EvaluationScoresSchema = z.object({
  technical: ScoreSchema,
  communication: ScoreSchema,
  leadership: ScoreSchema,
  problemSolving: ScoreSchema,
  confidence: ScoreSchema,
  overall: ScoreSchema,
});

/**
 * Complete evaluation result validation
 */
export const EvaluationResultSchema = z.object({
  // Scores
  technical: ScoreSchema,
  communication: ScoreSchema,
  leadership: ScoreSchema,
  problemSolving: ScoreSchema,
  confidence: ScoreSchema,
  overall: ScoreSchema,

  // Grade
  grade: GradeSchema,

  // Feedback arrays
  strengths: z
    .array(z.string().min(10, 'Strength must be at least 10 characters'))
    .min(2, 'At least 2 strengths required')
    .max(4, 'At most 4 strengths allowed'),

  weaknesses: z
    .array(z.string().min(10, 'Weakness must be at least 10 characters'))
    .min(2, 'At least 2 weaknesses required')
    .max(4, 'At most 4 weaknesses allowed'),

  suggestions: z
    .array(z.string().min(15, 'Suggestion must be at least 15 characters'))
    .min(3, 'At least 3 suggestions required')
    .max(5, 'At most 5 suggestions allowed'),

  // Analysis
  detailedAnalysis: z
    .string()
    .min(50, 'Detailed analysis must be at least 50 characters')
    .max(500, 'Detailed analysis must be at most 500 characters'),

  keywordCoverage: KeywordCoverageSchema,
});

/**
 * Evaluation request validation
 */
export const EvaluationRequestSchema = z.object({
  question: z.string().min(10, 'Question must be at least 10 characters'),
  answer: z.string().min(10, 'Answer must be at least 10 characters'),
  interviewType: InterviewTypeSchema,
  difficulty: DifficultyLevelSchema.optional(),
  experienceYears: z.number().min(0).max(50).optional(),
  context: z
    .object({
      jobDescription: z.string().optional(),
      previousQuestions: z.array(z.string()).optional(),
    })
    .optional(),
});

// ============================================================================
// Weight Configurations
// ============================================================================

/**
 * Role-specific weight configurations
 */
export const WEIGHT_CONFIGS: Record<string, WeightConfig> = {
  // Technical Individual Contributor roles
  TECHNICAL_IC: {
    technical: 0.35,
    communication: 0.25,
    leadership: 0.10,
    problemSolving: 0.20,
    confidence: 0.10,
  },

  // Team Lead roles
  TEAM_LEAD: {
    technical: 0.25,
    communication: 0.20,
    leadership: 0.30,
    problemSolving: 0.15,
    confidence: 0.10,
  },

  // Engineering Manager roles
  ENGINEERING_MANAGER: {
    technical: 0.15,
    communication: 0.20,
    leadership: 0.40,
    problemSolving: 0.15,
    confidence: 0.10,
  },

  // System Design roles
  SYSTEM_DESIGN: {
    technical: 0.30,
    communication: 0.25,
    leadership: 0.10,
    problemSolving: 0.25,
    confidence: 0.10,
  },
};

/**
 * Get weight configuration for interview type
 */
export function getWeightConfig(interviewType: InterviewType): WeightConfig {
  switch (interviewType) {
    case InterviewType.TEAM_LEAD:
      return WEIGHT_CONFIGS.TEAM_LEAD;
    case InterviewType.ENGINEERING_MANAGER:
      return WEIGHT_CONFIGS.ENGINEERING_MANAGER;
    case InterviewType.SYSTEM_DESIGN:
      return WEIGHT_CONFIGS.SYSTEM_DESIGN;
    default:
      return WEIGHT_CONFIGS.TECHNICAL_IC;
  }
}

// ============================================================================
// Grade Calculation
// ============================================================================

/**
 * Calculate grade from overall score
 */
export function calculateGrade(overall: number): Grade {
  if (overall >= 9.0) return Grade.EXCELLENT;
  if (overall >= 7.5) return Grade.GOOD;
  if (overall >= 6.0) return Grade.AVERAGE;
  if (overall >= 4.5) return Grade.BELOW_AVERAGE;
  return Grade.POOR;
}

/**
 * Calculate weighted overall score
 */
export function calculateOverallScore(
  scores: Omit<EvaluationScores, 'overall'>,
  weights: WeightConfig
): number {
  const overall =
    scores.technical * weights.technical +
    scores.communication * weights.communication +
    scores.leadership * weights.leadership +
    scores.problemSolving * weights.problemSolving +
    scores.confidence * weights.confidence;

  // Round to one decimal place
  return Math.round(overall * 10) / 10;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate evaluation result
 */
export function validateEvaluationResult(
  result: unknown
): EvaluationResult {
  return EvaluationResultSchema.parse(result);
}

/**
 * Validate evaluation request
 */
export function validateEvaluationRequest(
  request: unknown
): EvaluationRequest {
  return EvaluationRequestSchema.parse(request);
}

/**
 * Validate score consistency
 * Ensures overall score matches weighted calculation
 */
export function validateScoreConsistency(
  result: EvaluationResult,
  interviewType: InterviewType,
  tolerance: number = 0.2
): boolean {
  const weights = getWeightConfig(interviewType);
  const calculatedOverall = calculateOverallScore(
    {
      technical: result.technical,
      communication: result.communication,
      leadership: result.leadership,
      problemSolving: result.problemSolving,
      confidence: result.confidence,
    },
    weights
  );

  const difference = Math.abs(calculatedOverall - result.overall);
  return difference <= tolerance;
}

/**
 * Validate grade consistency
 * Ensures grade matches overall score
 */
export function validateGradeConsistency(
  result: EvaluationResult
): boolean {
  const expectedGrade = calculateGrade(result.overall);
  return result.grade === expectedGrade;
}

/**
 * Validate feedback quality
 * Ensures feedback is specific and not vague
 */
export function validateFeedbackQuality(
  result: EvaluationResult
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for vague phrases
  const vaguePatterns = [
    /good answer/i,
    /bad answer/i,
    /nice/i,
    /poor/i,
    /knows .+ well/i,
    /doesn't know/i,
  ];

  // Check strengths
  result.strengths.forEach((strength, index) => {
    vaguePatterns.forEach((pattern) => {
      if (pattern.test(strength)) {
        errors.push(`Strength ${index + 1} contains vague phrase: "${strength}"`);
      }
    });
  });

  // Check weaknesses
  result.weaknesses.forEach((weakness, index) => {
    vaguePatterns.forEach((pattern) => {
      if (pattern.test(weakness)) {
        errors.push(`Weakness ${index + 1} contains vague phrase: "${weakness}"`);
      }
    });
  });

  // Check suggestions for actionability
  result.suggestions.forEach((suggestion, index) => {
    if (
      !suggestion.toLowerCase().includes('study') &&
      !suggestion.toLowerCase().includes('practice') &&
      !suggestion.toLowerCase().includes('review') &&
      !suggestion.toLowerCase().includes('learn') &&
      !suggestion.toLowerCase().includes('read')
    ) {
      errors.push(`Suggestion ${index + 1} may not be actionable: "${suggestion}"`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Comprehensive validation
 */
export function validateEvaluation(
  result: EvaluationResult,
  interviewType: InterviewType
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  try {
    // Schema validation
    validateEvaluationResult(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      errors.push(...error.errors.map((e) => `${e.path.join('.')}: ${e.message}`));
    }
  }

  // Score consistency
  if (!validateScoreConsistency(result, interviewType)) {
    errors.push('Overall score does not match weighted calculation');
  }

  // Grade consistency
  if (!validateGradeConsistency(result)) {
    errors.push('Grade does not match overall score');
  }

  // Feedback quality
  const feedbackValidation = validateFeedbackQuality(result);
  if (!feedbackValidation.valid) {
    errors.push(...feedbackValidation.errors);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Anti-Hallucination Validation
// ============================================================================

/**
 * Check if feedback contains evidence from answer
 * This is a simplified check - in production, use NLP/embedding similarity
 */
export function containsEvidence(
  feedbackItem: string,
  answer: string
): boolean {
  // Extract key terms from feedback
  const feedbackTerms = feedbackItem
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 4); // Only meaningful words

  const answerLower = answer.toLowerCase();

  // Check if at least some terms appear in answer
  const matchCount = feedbackTerms.filter((term) => answerLower.includes(term)).length;
  const matchRatio = matchCount / feedbackTerms.length;

  // At least 30% of terms should appear in answer
  return matchRatio >= 0.3;
}

/**
 * Validate strengths have evidence in answer
 */
export function validateStrengthsEvidence(
  result: EvaluationResult,
  answer: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  result.strengths.forEach((strength, index) => {
    if (!containsEvidence(strength, answer)) {
      errors.push(
        `Strength ${index + 1} may not have evidence in answer: "${strength}"`
      );
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check for technical hallucinations
 * Validates that technical terms mentioned in feedback exist in answer
 */
export function validateNoHallucinations(
  result: EvaluationResult,
  answer: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Common technical terms that might be hallucinated
  const technicalTerms = [
    'hooks',
    'useState',
    'useEffect',
    'event loop',
    'promises',
    'async',
    'await',
    'callback',
    'component',
    'prop',
    'state',
    'redux',
    'context',
    'mongodb',
    'nosql',
    'sharding',
    'replication',
    'typescript',
    'interface',
    'generic',
    'type',
  ];

  const answerLower = answer.toLowerCase();

  // Check strengths for hallucinated terms
  result.strengths.forEach((strength, index) => {
    const strengthLower = strength.toLowerCase();
    technicalTerms.forEach((term) => {
      if (strengthLower.includes(term) && !answerLower.includes(term)) {
        errors.push(
          `Strength ${index + 1} mentions "${term}" which is not in the answer`
        );
      }
    });
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Round score to one decimal place
 */
export function roundScore(score: number): number {
  return Math.round(score * 10) / 10;
}

/**
 * Clamp score to valid range (0-10)
 */
export function clampScore(score: number): number {
  return Math.max(0, Math.min(10, score));
}

/**
 * Normalize scores (ensure they're all valid)
 */
export function normalizeScores(
  scores: Partial<EvaluationScores>
): EvaluationScores {
  return {
    technical: clampScore(roundScore(scores.technical || 0)),
    communication: clampScore(roundScore(scores.communication || 0)),
    leadership: clampScore(roundScore(scores.leadership || 0)),
    problemSolving: clampScore(roundScore(scores.problemSolving || 0)),
    confidence: clampScore(roundScore(scores.confidence || 0)),
    overall: clampScore(roundScore(scores.overall || 0)),
  };
}

/**
 * Format evaluation result for display
 */
export function formatEvaluationResult(
  result: EvaluationResult
): string {
  return `
Evaluation Result:
==================
Overall Score: ${result.overall}/10 (${result.grade})

Dimension Scores:
- Technical:        ${result.technical}/10
- Communication:    ${result.communication}/10
- Leadership:       ${result.leadership}/10
- Problem Solving:  ${result.problemSolving}/10
- Confidence:       ${result.confidence}/10

Strengths:
${result.strengths.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Areas for Improvement:
${result.weaknesses.map((w, i) => `${i + 1}. ${w}`).join('\n')}

Suggestions:
${result.suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Analysis:
${result.detailedAnalysis}

Keyword Coverage:
- Expected: ${result.keywordCoverage.expected.join(', ')}
- Covered: ${result.keywordCoverage.covered.join(', ')}
- Missing: ${result.keywordCoverage.missing.join(', ')}
`;
}

// ============================================================================
// Error Types
// ============================================================================

export class EvaluationValidationError extends Error {
  constructor(
    message: string,
    public errors: string[]
  ) {
    super(message);
    this.name = 'EvaluationValidationError';
  }
}

export class ScoreInconsistencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScoreInconsistencyError';
  }
}

export class HallucinationDetectedError extends Error {
  constructor(
    message: string,
    public hallucinations: string[]
  ) {
    super(message);
    this.name = 'HallucinationDetectedError';
  }
}

// ============================================================================
// Exports
// ============================================================================

export default {
  // Types
  InterviewType,
  DifficultyLevel,
  Grade,

  // Schemas
  EvaluationResultSchema,
  EvaluationRequestSchema,
  ScoreSchema,

  // Validation functions
  validateEvaluationResult,
  validateEvaluationRequest,
  validateEvaluation,
  validateScoreConsistency,
  validateGradeConsistency,
  validateFeedbackQuality,
  validateStrengthsEvidence,
  validateNoHallucinations,

  // Calculation functions
  calculateGrade,
  calculateOverallScore,
  getWeightConfig,

  // Utility functions
  roundScore,
  clampScore,
  normalizeScores,
  formatEvaluationResult,

  // Constants
  WEIGHT_CONFIGS,

  // Errors
  EvaluationValidationError,
  ScoreInconsistencyError,
  HallucinationDetectedError,
};
