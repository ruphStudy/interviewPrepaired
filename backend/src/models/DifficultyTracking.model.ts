import { Schema } from 'mongoose';

// ============================================================================
// TypeScript Interfaces
// ============================================================================

/**
 * Difficulty level (1-5)
 */
export type DifficultyLevelNumber = 1 | 2 | 3 | 4 | 5;

/**
 * Difficulty adjustment tracking
 */
export interface IDifficultyTracking {
  currentLevel: DifficultyLevelNumber; // Current difficulty (1-5)
  startingLevel: DifficultyLevelNumber; // Initial difficulty
  adjustmentHistory: IDifficultyAdjustment[]; // History of adjustments
  rollingAverageScore: number; // Average of last 3 question scores
  lastAdjustedAt?: number; // Question number when last adjusted
  confidenceLevel: number; // 0-100: How confident we are in candidate's level
}

/**
 * Single difficulty adjustment record
 */
export interface IDifficultyAdjustment {
  questionNumber: number;
  previousLevel: DifficultyLevelNumber;
  newLevel: DifficultyLevelNumber;
  reason: string; // Why the adjustment was made
  trigger: 'high_score' | 'low_score' | 'consistency' | 'manual';
  averageScoreAtTime: number;
  timestamp: Date;
}

// ============================================================================
// Mongoose Schema
// ============================================================================

const difficultyAdjustmentSchema = new Schema<IDifficultyAdjustment>(
  {
    questionNumber: { type: Number, required: true },
    previousLevel: { type: Number, required: true, min: 1, max: 5 },
    newLevel: { type: Number, required: true, min: 1, max: 5 },
    reason: { type: String, required: true },
    trigger: { 
      type: String, 
      required: true, 
      enum: ['high_score', 'low_score', 'consistency', 'manual'] 
    },
    averageScoreAtTime: { type: Number, required: true, min: 0, max: 10 },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

export const difficultyTrackingSchema = new Schema<IDifficultyTracking>(
  {
    currentLevel: { 
      type: Number, 
      required: true, 
      default: 3,
      min: 1, 
      max: 5 
    },
    startingLevel: { 
      type: Number, 
      required: true, 
      min: 1, 
      max: 5 
    },
    adjustmentHistory: { 
      type: [difficultyAdjustmentSchema], 
      default: [] 
    },
    rollingAverageScore: { 
      type: Number, 
      default: 0, 
      min: 0, 
      max: 10 
    },
    lastAdjustedAt: { type: Number },
    confidenceLevel: { 
      type: Number, 
      default: 50, 
      min: 0, 
      max: 100 
    },
  },
  { _id: false }
);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Map string difficulty to number level
 */
export function mapDifficultyToLevel(difficulty: string): DifficultyLevelNumber {
  switch (difficulty.toLowerCase()) {
    case 'beginner': return 1;
    case 'intermediate': return 3;
    case 'advanced': return 4;
    case 'expert': return 5;
    default: return 3;
  }
}

/**
 * Map number level to string difficulty
 */
export function mapLevelToDifficulty(level: DifficultyLevelNumber): string {
  switch (level) {
    case 1: return 'beginner';
    case 2: return 'intermediate';
    case 3: return 'intermediate';
    case 4: return 'advanced';
    case 5: return 'expert';
  }
}

/**
 * Initialize difficulty tracking
 */
export function initializeDifficultyTracking(startingDifficulty: string): IDifficultyTracking {
  const level = mapDifficultyToLevel(startingDifficulty);
  
  return {
    currentLevel: level,
    startingLevel: level,
    adjustmentHistory: [],
    rollingAverageScore: 0,
    confidenceLevel: 50,
  };
}

/**
 * Get difficulty description for display
 */
export function getDifficultyDescription(level: DifficultyLevelNumber): string {
  const descriptions = {
    1: 'Beginner - Basic foundational questions',
    2: 'Lower Intermediate - Applied basic concepts',
    3: 'Intermediate - Practical experience required',
    4: 'Advanced - Complex scenarios and edge cases',
    5: 'Expert - Architecture, trade-offs, deep expertise',
  };
  
  return descriptions[level];
}
