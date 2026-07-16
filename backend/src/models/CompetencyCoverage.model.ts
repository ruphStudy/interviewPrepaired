import { Schema } from 'mongoose';

// ============================================================================
// TypeScript Interfaces
// ============================================================================

/**
 * Tracks coverage for a single competency
 */
export interface ICompetencyCoverageItem {
  competencyName: string;
  coveragePercentage: number; // 0-100
  questionCount: number; // How many questions assessed this
  evidenceCount: number; // How many pieces of evidence found
  lastAssessed?: number; // Question number when last assessed
}

/**
 * Complete competency coverage tracker for an interview
 */
export interface ICompetencyCoverage {
  items: ICompetencyCoverageItem[];
  overallCoverage: number; // Average coverage across all competencies
  leastCoveredCompetency?: string; // Name of competency with lowest coverage
  mostCoveredCompetency?: string; // Name of competency with highest coverage
  lastUpdated: Date;
}

// ============================================================================
// Mongoose Schema
// ============================================================================

const competencyCoverageItemSchema = new Schema<ICompetencyCoverageItem>(
  {
    competencyName: { type: String, required: true },
    coveragePercentage: { type: Number, default: 0, min: 0, max: 100 },
    questionCount: { type: Number, default: 0, min: 0 },
    evidenceCount: { type: Number, default: 0, min: 0 },
    lastAssessed: { type: Number }
  },
  { _id: false }
);

export const competencyCoverageSchema = new Schema<ICompetencyCoverage>(
  {
    items: { type: [competencyCoverageItemSchema], default: [] },
    overallCoverage: { type: Number, default: 0, min: 0, max: 100 },
    leastCoveredCompetency: { type: String },
    mostCoveredCompetency: { type: String },
    lastUpdated: { type: Date, default: Date.now }
  },
  { _id: false }
);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Initialize coverage tracker from blueprint competencies
 */
export function initializeCoverage(competencyNames: string[]): ICompetencyCoverage {
  return {
    items: competencyNames.map(name => ({
      competencyName: name,
      coveragePercentage: 0,
      questionCount: 0,
      evidenceCount: 0
    })),
    overallCoverage: 0,
    leastCoveredCompetency: competencyNames[0] || undefined,
    mostCoveredCompetency: undefined,
    lastUpdated: new Date()
  };
}

/**
 * Get coverage statistics
 */
export function getCoverageStats(coverage: ICompetencyCoverage): {
  totalCompetencies: number;
  averageCoverage: number;
  fullyCovered: number; // >= 80%
  partiallyCovered: number; // 20-80%
  notCovered: number; // < 20%
} {
  const items = coverage.items;
  const total = items.length;
  
  const fullyCovered = items.filter(i => i.coveragePercentage >= 80).length;
  const notCovered = items.filter(i => i.coveragePercentage < 20).length;
  const partiallyCovered = total - fullyCovered - notCovered;
  
  return {
    totalCompetencies: total,
    averageCoverage: coverage.overallCoverage,
    fullyCovered,
    partiallyCovered,
    notCovered
  };
}

/**
 * Get competencies that need more assessment (coverage < 60%)
 */
export function getUndercoveredCompetencies(
  coverage: ICompetencyCoverage,
  threshold: number = 60
): string[] {
  return coverage.items
    .filter(item => item.coveragePercentage < threshold)
    .sort((a, b) => a.coveragePercentage - b.coveragePercentage)
    .map(item => item.competencyName);
}

/**
 * Format coverage for display
 */
export function formatCoverageForDisplay(coverage: ICompetencyCoverage): string {
  if (!coverage.items.length) return 'No coverage data';
  
  const lines = coverage.items.map(item => {
    const bar = '█'.repeat(Math.floor(item.coveragePercentage / 10));
    const empty = '░'.repeat(10 - Math.floor(item.coveragePercentage / 10));
    return `${item.competencyName}: [${bar}${empty}] ${item.coveragePercentage}% (${item.questionCount} questions, ${item.evidenceCount} evidence)`;
  });
  
  return [
    `Overall Coverage: ${coverage.overallCoverage}%`,
    ...lines,
    `\nLeast Covered: ${coverage.leastCoveredCompetency}`,
    `Most Covered: ${coverage.mostCoveredCompetency || 'None yet'}`
  ].join('\n');
}
