import { Schema } from 'mongoose';

// ============================================================================
// TypeScript Interfaces
// ============================================================================

/**
 * Severity level of contradiction
 */
export type ContradictionSeverity = 'minor' | 'moderate' | 'major' | 'critical';

/**
 * Single detected contradiction
 */
export interface IContradiction {
  statement1: string; // First statement
  questionNumber1: number; // Where first statement was made
  statement2: string; // Contradictory statement
  questionNumber2: number; // Where second statement was made
  
  contradiction: string; // Description of the contradiction
  explanation: string; // Why this is contradictory
  severity: ContradictionSeverity;
  
  // Resolution
  resolved: boolean;
  resolutionNotes?: string;
  clarificationAsked?: boolean;
  clarificationQuestionNumber?: number;
  
  timestamp: Date;
}

/**
 * Contradiction tracking for interview
 */
export interface IContradictionTracking {
  contradictions: IContradiction[];
  totalContradictions: number;
  unresolvedCount: number;
  criticalCount: number;
  lastUpdated: Date;
}

// ============================================================================
// Mongoose Schema
// ============================================================================

const contradictionSchema = new Schema<IContradiction>(
  {
    statement1: { type: String, required: true },
    questionNumber1: { type: Number, required: true },
    statement2: { type: String, required: true },
    questionNumber2: { type: Number, required: true },
    contradiction: { type: String, required: true },
    explanation: { type: String, required: true },
    severity: {
      type: String,
      required: true,
      enum: ['minor', 'moderate', 'major', 'critical'],
    },
    resolved: { type: Boolean, default: false },
    resolutionNotes: { type: String },
    clarificationAsked: { type: Boolean, default: false },
    clarificationQuestionNumber: { type: Number },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

export const contradictionTrackingSchema = new Schema<IContradictionTracking>(
  {
    contradictions: { type: [contradictionSchema], default: [] },
    totalContradictions: { type: Number, default: 0 },
    unresolvedCount: { type: Number, default: 0 },
    criticalCount: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now },
  },
  { _id: false }
);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Initialize empty contradiction tracking
 */
export function initializeContradictionTracking(): IContradictionTracking {
  return {
    contradictions: [],
    totalContradictions: 0,
    unresolvedCount: 0,
    criticalCount: 0,
    lastUpdated: new Date(),
  };
}

/**
 * Get unresolved contradictions sorted by severity
 */
export function getUnresolvedContradictions(
  tracking: IContradictionTracking
): IContradiction[] {
  const severityWeight = { critical: 4, major: 3, moderate: 2, minor: 1 };
  
  return tracking.contradictions
    .filter(c => !c.resolved)
    .sort((a, b) => severityWeight[b.severity] - severityWeight[a.severity]);
}

/**
 * Format contradictions for AI context
 */
export function formatContradictionsForAI(tracking: IContradictionTracking): string {
  if (tracking.totalContradictions === 0) return 'No contradictions detected.';
  
  const lines = [
    `CONTRADICTION TRACKING:`,
    `Total: ${tracking.totalContradictions}`,
    `Unresolved: ${tracking.unresolvedCount}`,
    `Critical: ${tracking.criticalCount}`,
    '',
  ];
  
  const unresolved = getUnresolvedContradictions(tracking).slice(0, 3);
  
  if (unresolved.length > 0) {
    lines.push('UNRESOLVED CONTRADICTIONS:');
    unresolved.forEach((c, i) => {
      lines.push(`${i + 1}. [${c.severity.toUpperCase()}] ${c.contradiction}`);
      lines.push(`   Q${c.questionNumber1}: "${c.statement1.substring(0, 80)}..."`);
      lines.push(`   Q${c.questionNumber2}: "${c.statement2.substring(0, 80)}..."`);
      lines.push(`   Why: ${c.explanation}`);
    });
    lines.push('');
    lines.push('⚠️ Consider asking for clarification on these contradictions.');
  }
  
  return lines.join('\n');
}

/**
 * Get contradiction statistics
 */
export function getContradictionStats(tracking: IContradictionTracking): {
  total: number;
  unresolved: number;
  resolved: number;
  bySeverity: Record<ContradictionSeverity, number>;
} {
  const bySeverity: Record<ContradictionSeverity, number> = {
    minor: 0,
    moderate: 0,
    major: 0,
    critical: 0,
  };
  
  tracking.contradictions.forEach(c => {
    bySeverity[c.severity]++;
  });
  
  return {
    total: tracking.totalContradictions,
    unresolved: tracking.unresolvedCount,
    resolved: tracking.totalContradictions - tracking.unresolvedCount,
    bySeverity,
  };
}
