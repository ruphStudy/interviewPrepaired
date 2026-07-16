import Interview, { IInterview } from '../models/interview.model';

// ============================================================================
// TypeScript Interfaces
// ============================================================================

export interface BenchmarkResult {
  percentile: number; // 0-100: What percentile the candidate is in
  benchmarkScore: number; // Average score for this category
  medianScore: number;
  top10PercentScore: number; // Score needed for top 10%
  candidateScore: number;
  rank: string; // 'Top 10%', 'Above Average', 'Average', 'Below Average'
  totalSamples: number; // How many interviews in benchmark
  performanceSummary: string; // "You performed better than 72% of candidates"
}

interface BenchmarkFilters {
  topic?: string;
  roleName?: string;
  industry?: string;
  difficulty?: string;
  experienceLevel?: string;
}

// ============================================================================
// Candidate Benchmarking Service
// ============================================================================

class CandidateBenchmarkingService {
  /**
   * Get benchmark comparison for a completed interview
   */
  async getBenchmark(
    interviewId: string,
    filters?: BenchmarkFilters
  ): Promise<BenchmarkResult | null> {
    try {
      // Get the interview
      const interview = await Interview.findById(interviewId);
      if (!interview || !interview.finalReport) {
        return null;
      }
      
      const candidateScore = interview.finalReport.averageOverallScore;
      
      // Build filter criteria
      const criteria = this.buildCriteria(interview, filters);
      
      // Get comparable interviews
      const comparableInterviews = await this.getComparableInterviews(criteria);
      
      if (comparableInterviews.length < 5) {
        // Not enough data for meaningful benchmark
        console.log(`[Benchmarking] Insufficient data: only ${comparableInterviews.length} comparable interviews`);
        return null;
      }
      
      // Calculate benchmark statistics
      const benchmark = this.calculateBenchmark(candidateScore, comparableInterviews);
      
      console.log(`[Benchmarking] Calculated for ${interview.topic}: Percentile ${benchmark.percentile}%, Rank: ${benchmark.rank}`);
      
      return benchmark;
      
    } catch (error) {
      console.error('[Benchmarking] Failed to calculate benchmark:', error);
      return null;
    }
  }
  
  /**
   * Build MongoDB query criteria
   */
  private buildCriteria(interview: IInterview, filters?: BenchmarkFilters): any {
    const criteria: any = {
      status: 'evaluated', // Only completed interviews
      'finalReport.averageOverallScore': { $exists: true, $ne: null },
    };
    
    // Use filters or fall back to interview properties
    if (filters?.topic || interview.topic) {
      criteria.topic = filters?.topic || interview.topic;
    }
    
    if (filters?.roleName || interview.roleName) {
      criteria.roleName = filters?.roleName || interview.roleName;
    }
    
    if (filters?.industry || interview.industry) {
      criteria.industry = filters?.industry || interview.industry;
    }
    
    if (filters?.difficulty || interview.difficulty) {
      criteria.difficulty = filters?.difficulty || interview.difficulty;
    }
    
    if (filters?.experienceLevel || interview.experienceLevel) {
      criteria.experienceLevel = filters?.experienceLevel || interview.experienceLevel;
    }
    
    return criteria;
  }
  
  /**
   * Get comparable interviews from database
   */
  private async getComparableInterviews(criteria: any): Promise<number[]> {
    const interviews = await Interview.find(criteria)
      .select('finalReport.averageOverallScore')
      .lean();
    
    return interviews
      .map(i => i.finalReport?.averageOverallScore)
      .filter((score): score is number => typeof score === 'number' && !isNaN(score))
      .sort((a, b) => a - b); // Sort ascending
  }
  
  /**
   * Calculate benchmark statistics
   */
  private calculateBenchmark(
    candidateScore: number,
    allScores: number[]
  ): BenchmarkResult {
    const totalSamples = allScores.length;
    
    // Calculate percentile
    const belowCount = allScores.filter(s => s < candidateScore).length;
    const percentile = Math.round((belowCount / totalSamples) * 100);
    
    // Calculate benchmark score (mean)
    const sum = allScores.reduce((a, b) => a + b, 0);
    const benchmarkScore = sum / totalSamples;
    
    // Calculate median
    const medianIndex = Math.floor(totalSamples / 2);
    const medianScore = totalSamples % 2 === 0
      ? (allScores[medianIndex - 1] + allScores[medianIndex]) / 2
      : allScores[medianIndex];
    
    // Calculate top 10% threshold
    const top10Index = Math.floor(totalSamples * 0.9);
    const top10PercentScore = allScores[top10Index] || allScores[allScores.length - 1];
    
    // Determine rank
    const rank = this.determineRank(percentile, candidateScore, top10PercentScore);
    
    // Generate performance summary
    const performanceSummary = this.generatePerformanceSummary(percentile, rank);
    
    return {
      percentile,
      benchmarkScore: Math.round(benchmarkScore * 10) / 10,
      medianScore: Math.round(medianScore * 10) / 10,
      top10PercentScore: Math.round(top10PercentScore * 10) / 10,
      candidateScore: Math.round(candidateScore * 10) / 10,
      rank,
      totalSamples,
      performanceSummary,
    };
  }
  
  /**
   * Determine performance rank
   */
  private determineRank(percentile: number, candidateScore: number, top10Score: number): string {
    if (percentile >= 90 || candidateScore >= top10Score) {
      return 'Top 10%';
    } else if (percentile >= 75) {
      return 'Top 25%';
    } else if (percentile >= 60) {
      return 'Above Average';
    } else if (percentile >= 40) {
      return 'Average';
    } else if (percentile >= 25) {
      return 'Below Average';
    } else {
      return 'Needs Improvement';
    }
  }
  
  /**
   * Generate human-readable performance summary
   */
  private generatePerformanceSummary(percentile: number, rank: string): string {
    if (percentile >= 90) {
      return `Excellent! You performed better than ${percentile}% of candidates. ${rank}.`;
    } else if (percentile >= 75) {
      return `Great job! You performed better than ${percentile}% of candidates. ${rank}.`;
    } else if (percentile >= 60) {
      return `Good performance! You performed better than ${percentile}% of candidates. ${rank}.`;
    } else if (percentile >= 40) {
      return `You performed better than ${percentile}% of candidates. ${rank}.`;
    } else {
      return `You performed better than ${percentile}% of candidates. There's room for improvement.`;
    }
  }
  
  /**
   * Get aggregate statistics for a category
   */
  async getCategoryStatistics(filters: BenchmarkFilters): Promise<{
    totalInterviews: number;
    averageScore: number;
    medianScore: number;
    highestScore: number;
    lowestScore: number;
  } | null> {
    try {
      const criteria = this.buildCriteria({} as IInterview, filters);
      const scores = await this.getComparableInterviews(criteria);
      
      if (scores.length === 0) return null;
      
      const sum = scores.reduce((a, b) => a + b, 0);
      const medianIndex = Math.floor(scores.length / 2);
      
      return {
        totalInterviews: scores.length,
        averageScore: Math.round((sum / scores.length) * 10) / 10,
        medianScore: scores[medianIndex],
        highestScore: scores[scores.length - 1],
        lowestScore: scores[0],
      };
    } catch (error) {
      console.error('[Benchmarking] Failed to get category statistics:', error);
      return null;
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const candidateBenchmarkingService = new CandidateBenchmarkingService();
export default candidateBenchmarkingService;
