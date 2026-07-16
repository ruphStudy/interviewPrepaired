import { IInterview } from '../models/interview.model';
import { getVerificationStats } from '../models/ClaimVerification.model';
import { getContradictionStats } from '../models/ContradictionTracking.model';
import { getCoverageStats } from '../models/CompetencyCoverage.model';

// ============================================================================
// TypeScript Interfaces
// ============================================================================

export type ReadinessLevel = 'not_ready' | 'partially_ready' | 'ready' | 'highly_ready';

export interface InterviewReadinessResult {
  readinessScore: number; // 0-100
  readinessLevel: ReadinessLevel;
  confidenceLevel: 'low' | 'moderate' | 'high' | 'very_high';
  
  // Component scores (each 0-100)
  performanceScore: number; // Based on interview scores
  consistencyScore: number; // Based on contradictions and claims
  completenessScore: number; // Based on competency coverage
  qualityScore: number; // Based on STAR, evidence, etc.
  
  strengths: string[];
  weaknesses: string[];
  improvementPlan: string[];
  estimatedReadinessDate?: string; // If not ready, when they might be
}

// ============================================================================
// Interview Readiness Service
// ============================================================================

class InterviewReadinessService {
  /**
   * Calculate comprehensive interview readiness
   */
  calculateReadiness(interview: IInterview): InterviewReadinessResult {
    // Component 1: Performance Score (40%)
    const performanceScore = this.calculatePerformanceScore(interview);
    
    // Component 2: Consistency Score (20%)
    const consistencyScore = this.calculateConsistencyScore(interview);
    
    // Component 3: Completeness Score (20%)
    const completenessScore = this.calculateCompletenessScore(interview);
    
    // Component 4: Quality Score (20%)
    const qualityScore = this.calculateQualityScore(interview);
    
    // Overall readiness (weighted average)
    const readinessScore = Math.round(
      performanceScore * 0.4 +
      consistencyScore * 0.2 +
      completenessScore * 0.2 +
      qualityScore * 0.2
    );
    
    // Determine readiness level
    const readinessLevel = this.getReadinessLevel(readinessScore);
    const confidenceLevel = this.getConfidenceLevel(readinessScore);
    
    // Generate feedback
    const { strengths, weaknesses, improvementPlan } = this.generateFeedback({
      performanceScore,
      consistencyScore,
      completenessScore,
      qualityScore,
      readinessLevel,
      interview,
    });
    
    // Estimate readiness date if not ready
    const estimatedReadinessDate = readinessScore < 70
      ? this.estimateReadinessDate(readinessScore)
      : undefined;
    
    console.log(`[ReadinessScore] Calculated: ${readinessScore}/100 (${readinessLevel})`);
    
    return {
      readinessScore,
      readinessLevel,
      confidenceLevel,
      performanceScore: Math.round(performanceScore),
      consistencyScore: Math.round(consistencyScore),
      completenessScore: Math.round(completenessScore),
      qualityScore: Math.round(qualityScore),
      strengths,
      weaknesses,
      improvementPlan,
      estimatedReadinessDate,
    };
  }
  
  /**
   * Calculate performance score (0-100)
   */
  private calculatePerformanceScore(interview: IInterview): number {
    if (!interview.finalReport) return 0;
    
    const avgScore = interview.finalReport.averageOverallScore;
    
    // Convert 0-10 scale to 0-100
    return avgScore * 10;
  }
  
  /**
   * Calculate consistency score (0-100)
   */
  private calculateConsistencyScore(interview: IInterview): number {
    let score = 100;
    
    // Deduct for contradictions
    if (interview.contradictionTracking) {
      const stats = getContradictionStats(interview.contradictionTracking);
      score -= stats.bySeverity.critical * 20;
      score -= stats.bySeverity.major * 10;
      score -= stats.bySeverity.moderate * 5;
      score -= stats.bySeverity.minor * 2;
    }
    
    // Deduct for unverified claims
    if (interview.claimVerification) {
      const stats = getVerificationStats(interview.claimVerification);
      const verificationRate = stats.verificationRate;
      
      // If less than 50% claims verified, deduct points
      if (verificationRate < 50) {
        score -= (50 - verificationRate) * 0.5;
      }
    }
    
    return Math.max(0, score);
  }
  
  /**
   * Calculate completeness score (0-100)
   */
  private calculateCompletenessScore(interview: IInterview): number {
    let score = 0;
    
    // Base on competency coverage
    if (interview.competencyCoverage) {
      const stats = getCoverageStats(interview.competencyCoverage);
      score = stats.averageCoverage;
    } else {
      // Fallback: base on question completion
      const completionRate = (interview.currentQuestion / interview.totalQuestions) * 100;
      score = completionRate;
    }
    
    return Math.min(100, score);
  }
  
  /**
   * Calculate quality score (0-100)
   */
  private calculateQualityScore(interview: IInterview): number {
    let score = 70; // Base score
    
    // Check for STAR analysis (behavioral interviews)
    const hasSTAR = interview.questions.some(q => q.evaluation?.starAnalysis);
    if (hasSTAR) {
      const starScores = interview.questions
        .filter(q => q.evaluation?.starAnalysis)
        .map(q => q.evaluation!.starAnalysis!.overallSTARScore);
      
      if (starScores.length > 0) {
        const avgSTAR = starScores.reduce((a, b) => a + b, 0) / starScores.length;
        score = avgSTAR * 10; // Convert to 0-100
      }
    }
    
    // Check for evidence-based scoring
    const hasEvidence = interview.questions.some(
      q => q.evaluation?.dimensions?.some(d => d.evidence && d.evidence.length > 0)
    );
    
    if (hasEvidence) {
      score += 10; // Bonus for detailed evidence
    }
    
    // Check interview memory richness
    if (interview.interviewMemory && interview.interviewMemory.totalFacts > 15) {
      score += 5; // Bonus for detailed answers
    }
    
    return Math.min(100, score);
  }
  
  /**
   * Determine readiness level
   */
  private getReadinessLevel(score: number): ReadinessLevel {
    if (score >= 85) return 'highly_ready';
    if (score >= 70) return 'ready';
    if (score >= 50) return 'partially_ready';
    return 'not_ready';
  }
  
  /**
   * Determine confidence level
   */
  private getConfidenceLevel(score: number): 'low' | 'moderate' | 'high' | 'very_high' {
    if (score >= 85) return 'very_high';
    if (score >= 70) return 'high';
    if (score >= 50) return 'moderate';
    return 'low';
  }
  
  /**
   * Generate feedback
   */
  private generateFeedback(params: {
    performanceScore: number;
    consistencyScore: number;
    completenessScore: number;
    qualityScore: number;
    readinessLevel: ReadinessLevel;
    interview: IInterview;
  }): { strengths: string[]; weaknesses: string[]; improvementPlan: string[] } {
    const { performanceScore, consistencyScore, completenessScore, qualityScore } = params;
    
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const improvementPlan: string[] = [];
    
    // Performance feedback
    if (performanceScore >= 80) {
      strengths.push('Strong overall interview performance');
    } else if (performanceScore < 60) {
      weaknesses.push('Below-target interview scores');
      improvementPlan.push('Focus on core competency development');
      improvementPlan.push('Practice more interview questions');
    }
    
    // Consistency feedback
    if (consistencyScore >= 90) {
      strengths.push('Highly consistent and credible answers');
    } else if (consistencyScore < 70) {
      weaknesses.push('Some contradictions or unverified claims detected');
      improvementPlan.push('Be more specific with numbers and claims');
      improvementPlan.push('Prepare concrete examples beforehand');
    }
    
    // Completeness feedback
    if (completenessScore >= 80) {
      strengths.push('Comprehensive coverage of key competencies');
    } else if (completenessScore < 60) {
      weaknesses.push('Some competencies not fully demonstrated');
      improvementPlan.push('Practice answers covering all required skills');
    }
    
    // Quality feedback
    if (qualityScore >= 80) {
      strengths.push('High-quality, detailed responses');
    } else if (qualityScore < 60) {
      weaknesses.push('Answers lack structure or detail');
      improvementPlan.push('Use STAR framework for behavioral questions');
      improvementPlan.push('Provide specific examples with metrics');
    }
    
    // Default messages
    if (strengths.length === 0) {
      strengths.push('Room for growth in multiple areas');
    }
    if (weaknesses.length === 0 && params.readinessLevel !== 'highly_ready') {
      weaknesses.push('Minor improvements needed');
    }
    if (improvementPlan.length === 0) {
      improvementPlan.push('Continue practicing to maintain readiness');
    }
    
    return { strengths, weaknesses, improvementPlan };
  }
  
  /**
   * Estimate when candidate might be ready
   */
  private estimateReadinessDate(currentScore: number): string {
    const gap = 70 - currentScore; // Target: 70+ for "Ready"
    
    // Rough estimate: 5 points improvement per week of focused practice
    const weeksNeeded = Math.ceil(gap / 5);
    
    const estimatedDate = new Date();
    estimatedDate.setDate(estimatedDate.getDate() + (weeksNeeded * 7));
    
    return `~${weeksNeeded} weeks with focused practice (around ${estimatedDate.toLocaleDateString()})`;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const interviewReadinessService = new InterviewReadinessService();
export default interviewReadinessService;
