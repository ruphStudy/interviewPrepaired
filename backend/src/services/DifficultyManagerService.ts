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
  // Phase 4 (4C) — guardrails so the interview's configured difficulty tier
  // stays meaningful even after a long run of strong answers, and so a
  // single reversal doesn't immediately undo the last one:
  // - MAX_LEVELS_ABOVE_START: an interview started at "beginner" must never
  //   escalate all the way to "expert" purely from sustained high scores —
  //   this is the "reasonable ceiling relative to the configured tier" the
  //   master prompt requires. Escalation below this ceiling is unaffected.
  // - OSCILLATION_GUARD_WINDOW: right after a reversal-direction adjustment
  //   (e.g. a 'down' adjustment), require a STRONGER consistency bar (all of
  //   recentScores, not just CONSISTENCY_THRESHOLD) before flipping back
  //   'up' within this many questions — dampens flip-flopping without
  //   duplicating adjustmentHistory as a second tracking structure.
  private readonly MAX_LEVELS_ABOVE_START = 2;
  private readonly OSCILLATION_GUARD_WINDOW = 3;
  
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
      adjustmentHistory: currentTracking.adjustmentHistory,
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
      startingLevel: currentTracking.startingLevel,
      direction: shouldAdjust.direction!,
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
    adjustmentHistory: IDifficultyAdjustment[];
  }): { adjust: boolean; direction?: 'up' | 'down'; reason?: string } {
    const { currentLevel, rollingAverage, questionNumber, lastAdjustedAt, recentScores, adjustmentHistory } = params;

    // Too early to adjust
    if (questionNumber < this.MIN_QUESTIONS_BEFORE_ADJUST) {
      return { adjust: false };
    }

    // Recently adjusted - give candidate time to adapt
    if (lastAdjustedAt && questionNumber - lastAdjustedAt < 2) {
      return { adjust: false };
    }

    // Phase 4 (4C) anti-oscillation: right after a reversal-direction
    // adjustment, require a stronger consistency bar (ALL of recentScores,
    // not just CONSISTENCY_THRESHOLD) before flipping back the other way —
    // dampens a harder-then-immediately-easier (or vice versa) flip-flop.
    const requiredConsistency = (direction: 'up' | 'down') =>
      this.isImmediateReversal(direction, adjustmentHistory, questionNumber) ? Math.max(this.CONSISTENCY_THRESHOLD, recentScores.length) : this.CONSISTENCY_THRESHOLD;

    // Check for high performance (increase difficulty)
    if (rollingAverage >= this.HIGH_SCORE_THRESHOLD && currentLevel < 5) {
      const highScores = recentScores.filter(s => s >= this.HIGH_SCORE_THRESHOLD).length;
      if (highScores >= requiredConsistency('up')) {
        return {
          adjust: true,
          direction: 'up',
          reason: `Consistent high performance (avg: ${rollingAverage.toFixed(1)})`,
        };
      }
    }

    // Check for low performance (decrease difficulty)
    if (rollingAverage <= this.LOW_SCORE_THRESHOLD && currentLevel > 1) {
      const lowScores = recentScores.filter(s => s <= this.LOW_SCORE_THRESHOLD).length;
      if (lowScores >= requiredConsistency('down')) {
        return {
          adjust: true,
          direction: 'down',
          reason: `Struggling with current level (avg: ${rollingAverage.toFixed(1)})`,
        };
      }
    }

    return { adjust: false };
  }

  /** True when the most recent adjustment in history moved the OPPOSITE direction and happened within OSCILLATION_GUARD_WINDOW questions of now. */
  private isImmediateReversal(direction: 'up' | 'down', adjustmentHistory: IDifficultyAdjustment[], questionNumber: number): boolean {
    if (adjustmentHistory.length === 0) return false;
    const last = adjustmentHistory[adjustmentHistory.length - 1];
    const lastDirection: 'up' | 'down' = last.newLevel > last.previousLevel ? 'up' : 'down';
    if (lastDirection === direction) return false;
    return questionNumber - last.questionNumber <= this.OSCILLATION_GUARD_WINDOW;
  }
  
  /**
   * Calculate new difficulty level.
   *
   * Phase 4 (4C): a single adjustment call ALWAYS moves by exactly one
   * level — "one excellent (or one poor) answer must not alone justify a
   * dramatic jump" — and an 'up' move is additionally capped at
   * `startingLevel + MAX_LEVELS_ABOVE_START`, so an interview configured at
   * a low starting tier can adapt upward but never escalate all the way to
   * expert purely from sustained high scores within one session.
   */
  private calculateNewLevel(params: {
    currentLevel: DifficultyLevelNumber;
    startingLevel: DifficultyLevelNumber;
    direction: 'up' | 'down';
  }): DifficultyLevelNumber {
    const { currentLevel, startingLevel, direction } = params;

    if (direction === 'up') {
      const ceiling = Math.min(5, startingLevel + this.MAX_LEVELS_ABOVE_START);
      const capped = Math.min(ceiling, currentLevel + 1);
      // Never let the ceiling itself decrease a level that (e.g. via a
      // manual override) already sits above it.
      return Math.max(currentLevel, capped) as DifficultyLevelNumber;
    }
    return Math.max(1, currentLevel - 1) as DifficultyLevelNumber;
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
