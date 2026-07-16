/**
 * Adapter for backward compatibility between old and new OpenAI Service
 * Use this during migration phase
 */

import { DynamicEvaluationResponse, EvaluationDimension, ExperienceLevel, InterviewStyle } from './OpenAIService';

// Old interface (for reference)
export interface LegacyEvaluationResponse {
  technicalScore: number;
  communicationScore: number;
  leadershipScore: number;
  problemSolvingScore: number;
  confidenceScore: number;
  overallScore: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  missingPoints?: string[];
}

/**
 * Convert experience years to experience level
 */
export function mapExperienceYearsToLevel(years: number): ExperienceLevel {
  if (years === 0) return ExperienceLevel.STUDENT;
  if (years <= 2) return ExperienceLevel.ENTRY;
  if (years <= 5) return ExperienceLevel.PROFESSIONAL;
  if (years <= 10) return ExperienceLevel.SENIOR;
  return ExperienceLevel.EXPERT;
}

/**
 * Infer interview style from topic
 */
export function inferInterviewStyle(topic: string): InterviewStyle {
  const topicLower = topic.toLowerCase();
  
  if (topicLower.includes('lead') || topicLower.includes('manager') || topicLower.includes('director')) {
    return InterviewStyle.LEADERSHIP;
  }
  
  if (topicLower.includes('sales') || topicLower.includes('marketing')) {
    return InterviewStyle.BEHAVIORAL;
  }
  
  if (topicLower.includes('hr') || topicLower.includes('recruiter')) {
    return InterviewStyle.HR;
  }
  
  const techKeywords = ['developer', 'engineer', 'programmer', 'software', 'web', 'node', 'react', 'angular'];
  if (techKeywords.some(keyword => topicLower.includes(keyword))) {
    return InterviewStyle.TECHNICAL;
  }
  
  return InterviewStyle.GENERAL;
}

/**
 * Convert new dynamic evaluation to old fixed format
 * Use this to maintain backward compatibility in existing code
 */
export function convertDynamicToLegacy(dynamic: DynamicEvaluationResponse): LegacyEvaluationResponse {
  const findScore = (name: string): number => {
    const dim = dynamic.dimensions.find(d => d.name === name);
    return dim?.score || 0;
  };

  return {
    technicalScore: findScore('technical') || findScore('domainKnowledge'),
    communicationScore: findScore('communication'),
    leadershipScore: findScore('leadership'),
    problemSolvingScore: findScore('problemSolving'),
    confidenceScore: findScore('confidence'),
    overallScore: dynamic.overallScore,
    strengths: dynamic.strengths,
    weaknesses: dynamic.weaknesses,
    suggestions: dynamic.suggestions,
    missingPoints: dynamic.missingPoints,
  };
}

/**
 * Convert old fixed evaluation to new dynamic format
 * Use this when reading old data from database
 */
export function convertLegacyToDynamic(legacy: LegacyEvaluationResponse, _topic: string): DynamicEvaluationResponse {
  const dimensions: EvaluationDimension[] = [
    {
      name: 'technical',
      label: 'Technical Knowledge',
      score: legacy.technicalScore,
      description: 'Technical accuracy and depth'
    },
    {
      name: 'communication',
      label: 'Communication',
      score: legacy.communicationScore,
      description: 'Clarity and articulation'
    },
    {
      name: 'leadership',
      label: 'Leadership',
      score: legacy.leadershipScore,
      description: 'Decision-making and guidance'
    },
    {
      name: 'problemSolving',
      label: 'Problem Solving',
      score: legacy.problemSolvingScore,
      description: 'Analytical thinking'
    },
    {
      name: 'confidence',
      label: 'Confidence',
      score: legacy.confidenceScore,
      description: 'Professional presentation'
    },
  ];

  return {
    dimensions,
    overallScore: legacy.overallScore,
    strengths: legacy.strengths,
    weaknesses: legacy.weaknesses,
    suggestions: legacy.suggestions,
    missingPoints: legacy.missingPoints || [],
  };
}

/**
 * Extract scores for radar chart (frontend compatibility)
 */
export function extractRadarChartData(evaluation: DynamicEvaluationResponse) {
  return evaluation.dimensions.map(dim => ({
    subject: dim.label,
    score: dim.score,
    fullMark: 10
  }));
}

/**
 * Calculate category averages from dynamic evaluations
 */
export function calculateCategoryAverages(questions: Array<{ evaluation?: DynamicEvaluationResponse }>) {
  const dimensionAverages = new Map<string, { sum: number; count: number; label: string }>();

  questions.forEach(q => {
    if (q.evaluation) {
      q.evaluation.dimensions.forEach(dim => {
        const existing = dimensionAverages.get(dim.name) || { sum: 0, count: 0, label: dim.label };
        existing.sum += dim.score;
        existing.count += 1;
        dimensionAverages.set(dim.name, existing);
      });
    }
  });

  const result: Record<string, number> = {};
  dimensionAverages.forEach((value, key) => {
    result[key] = parseFloat((value.sum / value.count).toFixed(2));
  });

  return result;
}
