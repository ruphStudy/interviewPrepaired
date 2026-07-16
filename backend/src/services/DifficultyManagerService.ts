import { 
  IDifficultyTracking, 
  IDifficultyAdjustment,
  DifficultyLevelNumber,
  mapLevelToDifficulty,
  getDifficultyDescription
} from '../models/DifficultyTracking.model';

// ============================================================================
// TypeScript Interfaces
// ============================================================================

interface AdjustDifficultyParams {
  currentTracking: IDifficultyTracking;
  latestScore: number; // Score from most recent question (0-10)
  questionNumber: number;
  recentScores: number[]; // Last 3-5 scores for rolling average
}

interface DifficultyAdjustmentResult {
  updated: boolean;
  previousLevel: DifficultyLevelNumber;
  newLevel: DifficultyLevelNumber;
  reason?: string;
  updatedTracking: IDifficultyTracking;
}

// ============================================================================
// Difficulty Manager Service
// ============================================================================

class DifficultyManagerService {
  // Configuration
  private readonly HIGH_SCORE_THRESHOLD = 8.0; // Increase difficulty if score >= 8
  private readonly LOW_SCORE_THRESHOLD = 4.0; // Decrease difficulty if score <= 4
  private readonly MIN_QUESTIONS_BEFORE_ADJUST = 2; // Wait at least 2 questions
  private readonly CONSISTENCY_THRESHOLD = 2; // Need 2 consecutive high/low scores
  
  /**
   * Adjust difficulty based on latest performance
   */
  adjustDifficulty(params: AdjustDifficultyParams): DifficultyAdjustmentResult {
    const { currentTracking, latestScore, questionNumber, recentScores } = params;
    
    // Calculate rolling average
    const rollingAverage = this.calculateRollingAverage(recentScores);
    
    // Update rolling average in tracking
    currentTracking.rollingAverageScore = rollingAverage;
    
    // Check if we should adjust
    const shouldAdjust = this.shouldAdjustDifficulty({
      currentLevel: currentTracking.currentLevel,
      latestScore,
      rollingAverage,
      questionNumber,
      lastAdjustedAt: currentTracking.lastAdjustedAt,
      recentScores,
    });
    
    if (!shouldAdjust.adjust) {
      return {
        updated: false,
        previousLevel: currentTracking.currentLevel,
        newLevel: currentTracking.currentLevel,
        updatedTracking: currentTracking,
      };
    }
    
    // Calculate new level
    const previousLevel = currentTracking.currentLevel;
    const newLevel = this.calculateNewLevel({
      currentLevel: previousLevel,
      direction: shouldAdjust.direction!,
      rollingAverage,
    });
    
    // No change needed
    if (newLevel === previousLevel) {
      return {
        updated: false,
        previousLevel,
        newLevel,
        updatedTracking: currentTracking,
      };
    }
    
    // Create adjustment record
    const adjustment: IDifficultyAdjustment = {
      questionNumber,
      previousLevel,
      newLevel,
      reason: shouldAdjust.reason!,
      trigger: shouldAdjust.direction === 'up' ? 'high_score' : 'low_score',
      averageScoreAtTime: rollingAverage,
      timestamp: new Date(),
    };
    
    // Update tracking
    currentTracking.currentLevel = newLevel;
    currentTracking.adjustmentHistory.push(adjustment);
    currentTracking.lastAdjustedAt = questionNumber;
    currentTracking.confidenceLevel = this.calculateConfidence(currentTracking);
    
    console.log(`[DifficultyManager] Adjusted difficulty: ${previousLevel} → ${newLevel} (${shouldAdjust.reason})`);
    
    return {
      updated: true,
      previousLevel,
      newLevel,
      reason: shouldAdjust.reason,
      updatedTracking: currentTracking,
    };
  }
  
  /**
   * Determine if difficulty should be adjusted
   */
  private shouldAdjustDifficulty(params: {
    currentLevel: DifficultyLevelNumber;
    latestScore: number;
    rollingAverage: number;
    questionNumber: number;
    lastAdjustedAt?: number;
    recentScores: number[];
  }): { adjust: boolean; direction?: 'up' | 'down'; reason?: string } {
    const { currentLevel, rollingAverage, questionNumber, lastAdjustedAt, recentScores } = params;
    
    // Too early to adjust
    if (questionNumber < this.MIN_QUESTIONS_BEFORE_ADJUST) {
      return { adjust: false };
    }
    
    // Recently adjusted - give candidate time to adapt
    if (lastAdjustedAt && questionNumber - lastAdjustedAt < 2) {
      return { adjust: false };
    }
    
    // Check for high performance (increase difficulty)
    if (rollingAverage >= this.HIGH_SCORE_THRESHOLD && currentLevel < 5) {
      // Verify consistency
      const highScores = recentScores.filter(s => s >= this.HIGH_SCORE_THRESHOLD).length;
      if (highScores >= this.CONSISTENCY_THRESHOLD) {
        return {
          adjust: true,
          direction: 'up',
          reason: `Consistent high performance (avg: ${rollingAverage.toFixed(1)})`,
        };
      }
    }
    
    // Check for low performance (decrease difficulty)
    if (rollingAverage <= this.LOW_SCORE_THRESHOLD && currentLevel > 1) {
      // Verify consistency
      const lowScores = recentScores.filter(s => s <= this.LOW_SCORE_THRESHOLD).length;
      if (lowScores >= this.CONSISTENCY_THRESHOLD) {
        return {
          adjust: true,
          direction: 'down',
          reason: `Struggling with current level (avg: ${rollingAverage.toFixed(1)})`,
        };
      }
    }
    
    return { adjust: false };
  }
  
  /**
   * Calculate new difficulty level
   */
  private calculateNewLevel(params: {
    currentLevel: DifficultyLevelNumber;
    direction: 'up' | 'down';
    rollingAverage: number;
  }): DifficultyLevelNumber {
    const { currentLevel, direction, rollingAverage } = params;
    
    if (direction === 'up') {
      // Exceptional performance (9+) - jump 2 levels
      if (rollingAverage >= 9.0 && currentLevel <= 3) {
        return Math.min(5, currentLevel + 2) as DifficultyLevelNumber;
      }
      // Good performance - increase by 1
      return Math.min(5, currentLevel + 1) as DifficultyLevelNumber;
    } else {
      // Very poor performance (< 3) - drop 2 levels
      if (rollingAverage < 3.0 && currentLevel >= 3) {
        return Math.max(1, currentLevel - 2) as DifficultyLevelNumber;
      }
      // Struggling - decrease by 1
      return Math.max(1, currentLevel - 1) as DifficultyLevelNumber;
    }
  }
  
  /**
   * Calculate rolling average of recent scores
   */
  private calculateRollingAverage(scores: number[]): number {
    if (scores.length === 0) return 0;
    
    // Use last 3 scores for rolling average
    const recentScores = scores.slice(-3);
    const sum = recentScores.reduce((acc, score) => acc + score, 0);
    return sum / recentScores.length;
  }
  
  /**
   * Calculate confidence level in current difficulty assessment
   */
  private calculateConfidence(tracking: IDifficultyTracking): number {
    const adjustmentCount = tracking.adjustmentHistory.length;
    
    // More adjustments = higher confidence we've found the right level
    // Base confidence: 50
    // +10 per adjustment (max 90)
    const confidence = Math.min(90, 50 + (adjustmentCount * 10));
    
    return confidence;
  }
  
  /**
   * Get difficulty context for AI prompt
   */
  getDifficultyContextForAI(tracking: IDifficultyTracking): string {
    const description = getDifficultyDescription(tracking.currentLevel);
    const difficultyString = mapLevelToDifficulty(tracking.currentLevel);
    
    const lines = [
      `CURRENT DIFFICULTY: Level ${tracking.currentLevel}/5 (${difficultyString})`,
      `Description: ${description}`,
      `Starting Level: ${tracking.startingLevel}/5`,
      `Rolling Average Score: ${tracking.rollingAverageScore.toFixed(1)}/10`,
      `Confidence: ${tracking.confidenceLevel}%`,
    ];
    
    if (tracking.adjustmentHistory.length > 0) {
      const lastAdjustment = tracking.adjustmentHistory[tracking.adjustmentHistory.length - 1];
      lines.push(`Last Adjustment: ${lastAdjustment.previousLevel} → ${lastAdjustment.newLevel} (${lastAdjustment.reason})`);
    }
    
    lines.push('');
    lines.push('⚠️ IMPORTANT: Generate questions at the CURRENT DIFFICULTY level specified above.');
    
    return lines.join('\n');
  }
  
  /**
   * Get summary for display
   */
  getSummary(tracking: IDifficultyTracking): {
    currentLevel: number;
    description: string;
    rollingAverage: number;
    adjustmentCount: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  } {
    const history = tracking.adjustmentHistory;
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    
    if (history.length >= 2) {
      const last = history[history.length - 1];
      const secondLast = history[history.length - 2];
      
      if (last.newLevel > secondLast.newLevel) trend = 'increasing';
      else if (last.newLevel < secondLast.newLevel) trend = 'decreasing';
    } else if (history.length === 1) {
      const adjustment = history[0];
      if (adjustment.newLevel > adjustment.previousLevel) trend = 'increasing';
      else if (adjustment.newLevel < adjustment.previousLevel) trend = 'decreasing';
    }
    
    return {
      currentLevel: tracking.currentLevel,
      description: getDifficultyDescription(tracking.currentLevel),
      rollingAverage: tracking.rollingAverageScore,
      adjustmentCount: history.length,
      trend,
    };
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const difficultyManagerService = new DifficultyManagerService();
export default difficultyManagerService;
