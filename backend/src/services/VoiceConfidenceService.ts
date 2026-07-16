// ============================================================================
// Voice Confidence Analysis Service
// ============================================================================

export interface VoiceConfidenceAnalysis {
  confidenceScore: number; // 0-100: Overall voice confidence
  speakingRate: number; // Words per minute
  wordsPerMinute: number; // Same as speakingRate (alias)
  fillerWordCount: number;
  fillerWordRate: number; // Filler words per 100 words
  pauseCount: number;
  longPauseCount: number; // Pauses > 3 seconds
  averagePauseLength: number; // In seconds
  
  // Detailed filler word breakdown
  fillerWords: {
    um: number;
    uh: number;
    like: number;
    actually: number;
    basically: number;
    you_know: number;
    sort_of: number;
    kind_of: number;
  };
  
  // Analysis
  confidenceLevel: 'very_low' | 'low' | 'moderate' | 'high' | 'very_high';
  strengths: string[];
  improvements: string[];
  
  // Metadata
  totalWords: number;
  durationSeconds: number;
}

class VoiceConfidenceService {
  // Optimal speaking rate: 140-160 WPM for interviews
  private readonly OPTIMAL_WPM_MIN = 140;
  private readonly OPTIMAL_WPM_MAX = 160;
  
  // Filler word patterns (case insensitive)
  private readonly FILLER_PATTERNS = {
    um: /\bum+\b/gi,
    uh: /\buh+\b/gi,
    like: /\blike\b/gi,
    actually: /\bactually\b/gi,
    basically: /\basically\b/gi,
    you_know: /\byou\s+know\b/gi,
    sort_of: /\bsort\s+of\b/gi,
    kind_of: /\bkind\s+of\b/gi,
  };
  
  /**
   * Analyze voice confidence from transcript and duration
   */
  analyzeVoiceConfidence(params: {
    transcript: string;
    durationSeconds: number;
  }): VoiceConfidenceAnalysis {
    const { transcript, durationSeconds } = params;
    
    // Count words
    const totalWords = this.countWords(transcript);
    
    // Calculate speaking rate
    const speakingRate = this.calculateWPM(totalWords, durationSeconds);
    
    // Count filler words
    const fillerWords = this.countFillerWords(transcript);
    const fillerWordCount = Object.values(fillerWords).reduce((a, b) => a + b, 0);
    const fillerWordRate = totalWords > 0 ? (fillerWordCount / totalWords) * 100 : 0;
    
    // Estimate pauses (based on transcript markers or inference)
    const pauseAnalysis = this.analyzePauses(transcript, durationSeconds, totalWords);
    
    // Calculate confidence score
    const confidenceScore = this.calculateConfidenceScore({
      speakingRate,
      fillerWordRate,
      longPauseCount: pauseAnalysis.longPauseCount,
    });
    
    // Determine confidence level
    const confidenceLevel = this.getConfidenceLevel(confidenceScore);
    
    // Generate feedback
    const { strengths, improvements } = this.generateFeedback({
      speakingRate,
      fillerWordRate,
      fillerWordCount,
      pauseCount: pauseAnalysis.pauseCount,
      confidenceScore,
    });
    
    return {
      confidenceScore: Math.round(confidenceScore),
      speakingRate: Math.round(speakingRate),
      wordsPerMinute: Math.round(speakingRate),
      fillerWordCount,
      fillerWordRate: Math.round(fillerWordRate * 10) / 10,
      pauseCount: pauseAnalysis.pauseCount,
      longPauseCount: pauseAnalysis.longPauseCount,
      averagePauseLength: pauseAnalysis.averagePauseLength,
      fillerWords,
      confidenceLevel,
      strengths,
      improvements,
      totalWords,
      durationSeconds,
    };
  }
  
  /**
   * Count words in transcript
   */
  private countWords(transcript: string): number {
    const words = transcript.trim().split(/\s+/).filter(w => w.length > 0);
    return words.length;
  }
  
  /**
   * Calculate words per minute
   */
  private calculateWPM(wordCount: number, durationSeconds: number): number {
    if (durationSeconds === 0) return 0;
    const minutes = durationSeconds / 60;
    return wordCount / minutes;
  }
  
  /**
   * Count filler words by type
   */
  private countFillerWords(transcript: string): VoiceConfidenceAnalysis['fillerWords'] {
    return {
      um: (transcript.match(this.FILLER_PATTERNS.um) || []).length,
      uh: (transcript.match(this.FILLER_PATTERNS.uh) || []).length,
      like: (transcript.match(this.FILLER_PATTERNS.like) || []).length,
      actually: (transcript.match(this.FILLER_PATTERNS.actually) || []).length,
      basically: (transcript.match(this.FILLER_PATTERNS.basically) || []).length,
      you_know: (transcript.match(this.FILLER_PATTERNS.you_know) || []).length,
      sort_of: (transcript.match(this.FILLER_PATTERNS.sort_of) || []).length,
      kind_of: (transcript.match(this.FILLER_PATTERNS.kind_of) || []).length,
    };
  }
  
  /**
   * Analyze pauses (estimated from speaking rate and transcript)
   */
  private analyzePauses(transcript: string, durationSeconds: number, wordCount: number): {
    pauseCount: number;
    longPauseCount: number;
    averagePauseLength: number;
  } {
    // Estimate pauses from punctuation and duration
    const sentenceEndings = (transcript.match(/[.!?]/g) || []).length;
    const commas = (transcript.match(/,/g) || []).length;
    
    // Rough pause estimation
    const estimatedShortPauses = commas;
    const estimatedLongPauses = sentenceEndings;
    const totalPauses = estimatedShortPauses + estimatedLongPauses;
    
    // Estimate average pause length
    const speakingTime = wordCount > 0 ? (wordCount / 150) * 60 : 0; // Assume 150 WPM average
    const pauseTime = Math.max(0, durationSeconds - speakingTime);
    const averagePauseLength = totalPauses > 0 ? pauseTime / totalPauses : 0;
    
    return {
      pauseCount: totalPauses,
      longPauseCount: estimatedLongPauses,
      averagePauseLength,
    };
  }
  
  /**
   * Calculate overall confidence score (0-100)
   */
  private calculateConfidenceScore(params: {
    speakingRate: number;
    fillerWordRate: number;
    longPauseCount: number;
  }): number {
    const { speakingRate, fillerWordRate, longPauseCount } = params;
    
    // Score components (each 0-100)
    let rateScore = 100;
    let fillerScore = 100;
    let pauseScore = 100;
    
    // Speaking rate score (optimal: 140-160 WPM)
    if (speakingRate < 100) {
      rateScore = 40; // Too slow
    } else if (speakingRate < 120) {
      rateScore = 60;
    } else if (speakingRate >= this.OPTIMAL_WPM_MIN && speakingRate <= this.OPTIMAL_WPM_MAX) {
      rateScore = 100; // Optimal
    } else if (speakingRate < 180) {
      rateScore = 80;
    } else if (speakingRate < 200) {
      rateScore = 60;
    } else {
      rateScore = 40; // Too fast
    }
    
    // Filler word score (optimal: < 2%)
    if (fillerWordRate < 1) {
      fillerScore = 100; // Excellent
    } else if (fillerWordRate < 2) {
      fillerScore = 85; // Good
    } else if (fillerWordRate < 4) {
      fillerScore = 70; // Acceptable
    } else if (fillerWordRate < 6) {
      fillerScore = 50; // Needs improvement
    } else {
      fillerScore = 30; // Poor
    }
    
    // Long pause score
    if (longPauseCount === 0) {
      pauseScore = 100;
    } else if (longPauseCount <= 2) {
      pauseScore = 85;
    } else if (longPauseCount <= 4) {
      pauseScore = 70;
    } else {
      pauseScore = 50;
    }
    
    // Weighted average (rate: 40%, filler: 40%, pauses: 20%)
    const confidenceScore = (rateScore * 0.4) + (fillerScore * 0.4) + (pauseScore * 0.2);
    
    return confidenceScore;
  }
  
  /**
   * Get confidence level label
   */
  private getConfidenceLevel(score: number): 'very_low' | 'low' | 'moderate' | 'high' | 'very_high' {
    if (score >= 85) return 'very_high';
    if (score >= 70) return 'high';
    if (score >= 55) return 'moderate';
    if (score >= 40) return 'low';
    return 'very_low';
  }
  
  /**
   * Generate feedback
   */
  private generateFeedback(params: {
    speakingRate: number;
    fillerWordRate: number;
    fillerWordCount: number;
    pauseCount: number;
    confidenceScore: number;
  }): { strengths: string[]; improvements: string[] } {
    const { speakingRate, fillerWordRate, fillerWordCount, pauseCount, confidenceScore } = params;
    
    const strengths: string[] = [];
    const improvements: string[] = [];
    
    // Speaking rate feedback
    if (speakingRate >= this.OPTIMAL_WPM_MIN && speakingRate <= this.OPTIMAL_WPM_MAX) {
      strengths.push(`Excellent speaking pace (${Math.round(speakingRate)} WPM)`);
    } else if (speakingRate < 120) {
      improvements.push('Speak slightly faster to maintain engagement');
    } else if (speakingRate > 180) {
      improvements.push('Slow down slightly for better clarity');
    }
    
    // Filler word feedback
    if (fillerWordRate < 2) {
      strengths.push('Minimal use of filler words');
    } else if (fillerWordRate >= 4) {
      improvements.push(`Reduce filler words (${fillerWordCount} detected)`);
    }
    
    // Pause feedback
    if (pauseCount <= 3) {
      strengths.push('Good flow and continuity');
    } else if (pauseCount > 6) {
      improvements.push('Reduce long pauses - practice your answers');
    }
    
    // Overall feedback
    if (confidenceScore >= 80) {
      strengths.push('Strong vocal confidence overall');
    }
    
    // Default messages if none
    if (strengths.length === 0) {
      strengths.push('Room for improvement in vocal delivery');
    }
    if (improvements.length === 0) {
      improvements.push('Continue practicing for even better confidence');
    }
    
    return { strengths, improvements };
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const voiceConfidenceService = new VoiceConfidenceService();
export default voiceConfidenceService;
