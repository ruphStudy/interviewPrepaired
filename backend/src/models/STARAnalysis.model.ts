import { Schema } from 'mongoose';

// ============================================================================
// TypeScript Interfaces
// ============================================================================

/**
 * STAR Framework component scores
 */
export interface ISTARAnalysis {
  situationScore: number; // 0-10: How well situation was explained
  taskScore: number; // 0-10: How well task/challenge was defined
  actionScore: number; // 0-10: How well actions were described
  resultScore: number; // 0-10: How well results/outcomes were shown
  overallSTARScore: number; // Average of above
  
  missingComponents: ('situation' | 'task' | 'action' | 'result')[]; // Which STAR components are missing
  strengthComponent?: 'situation' | 'task' | 'action' | 'result'; // Best component
  weaknessComponent?: 'situation' | 'task' | 'action' | 'result'; // Weakest component
  
  coachingFeedback: string[]; // Specific feedback on improving STAR response
  hasCompleteSTAR: boolean; // True if all 4 components present
}

// ============================================================================
// Mongoose Schema
// ============================================================================

export const starAnalysisSchema = new Schema<ISTARAnalysis>(
  {
    situationScore: { type: Number, required: true, min: 0, max: 10 },
    taskScore: { type: Number, required: true, min: 0, max: 10 },
    actionScore: { type: Number, required: true, min: 0, max: 10 },
    resultScore: { type: Number, required: true, min: 0, max: 10 },
    overallSTARScore: { type: Number, required: true, min: 0, max: 10 },
    missingComponents: {
      type: [String],
      enum: ['situation', 'task', 'action', 'result'],
      default: [],
    },
    strengthComponent: {
      type: String,
      enum: ['situation', 'task', 'action', 'result'],
    },
    weaknessComponent: {
      type: String,
      enum: ['situation', 'task', 'action', 'result'],
    },
    coachingFeedback: { type: [String], default: [] },
    hasCompleteSTAR: { type: Boolean, default: false },
  },
  { _id: false }
);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Determine if STAR analysis should be performed for this interview style
 */
export function shouldAnalyzeSTAR(interviewStyle: string): boolean {
  const stylesRequiringSTAR = ['behavioral', 'leadership', 'situational'];
  return stylesRequiringSTAR.includes(interviewStyle.toLowerCase());
}

/**
 * Calculate overall STAR score
 */
export function calculateSTARScore(analysis: ISTARAnalysis): number {
  return (
    analysis.situationScore +
    analysis.taskScore +
    analysis.actionScore +
    analysis.resultScore
  ) / 4;
}

/**
 * Format STAR analysis for display
 */
export function formatSTARAnalysis(analysis: ISTARAnalysis): string {
  const lines = [
    `STAR FRAMEWORK ANALYSIS:`,
    `Overall STAR Score: ${analysis.overallSTARScore.toFixed(1)}/10`,
    `Complete STAR Response: ${analysis.hasCompleteSTAR ? '✓ Yes' : '✗ No'}`,
    '',
    'Component Scores:',
    `- Situation: ${analysis.situationScore}/10`,
    `- Task: ${analysis.taskScore}/10`,
    `- Action: ${analysis.actionScore}/10`,
    `- Result: ${analysis.resultScore}/10`,
  ];
  
  if (analysis.strengthComponent) {
    lines.push(`\nStrongest: ${analysis.strengthComponent.toUpperCase()}`);
  }
  
  if (analysis.weaknessComponent) {
    lines.push(`Weakest: ${analysis.weaknessComponent.toUpperCase()}`);
  }
  
  if (analysis.missingComponents.length > 0) {
    lines.push(`\nMissing: ${analysis.missingComponents.map(c => c.toUpperCase()).join(', ')}`);
  }
  
  if (analysis.coachingFeedback.length > 0) {
    lines.push('\nCoaching Feedback:');
    analysis.coachingFeedback.forEach(f => lines.push(`- ${f}`));
  }
  
  return lines.join('\n');
}

/**
 * Get STAR coaching tips based on missing components
 */
export function getSTARCoachingTips(missingComponents: string[]): string[] {
  const tips: string[] = [];
  
  if (missingComponents.includes('situation')) {
    tips.push('Start by setting the scene - describe the context and background');
  }
  
  if (missingComponents.includes('task')) {
    tips.push('Clearly state what needed to be done and why it was important');
  }
  
  if (missingComponents.includes('action')) {
    tips.push('Describe the specific actions YOU took (use "I" not "we")');
  }
  
  if (missingComponents.includes('result')) {
    tips.push('End with measurable results and outcomes of your actions');
  }
  
  if (tips.length === 0) {
    tips.push('Great STAR response! All components present.');
  }
  
  return tips;
}
