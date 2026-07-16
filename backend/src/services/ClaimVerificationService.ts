import { 
  IClaimVerificationTracking, 
  IVerifiableClaim,
  ClaimType,
  getHighPriorityClaims,
  formatClaimsForAI
} from '../models/ClaimVerification.model';
import { getOpenAIService } from './OpenAIService';

// ============================================================================
// TypeScript Interfaces
// ============================================================================

interface ExtractClaimsParams {
  question: string;
  answer: string;
  questionNumber: number;
  currentTracking: IClaimVerificationTracking;
}

interface ClaimExtractionResult {
  newClaims: IVerifiableClaim[];
}

// ============================================================================
// Claim Verification Service
// ============================================================================

class ClaimVerificationService {
  /**
   * Extract verifiable claims from an answer
   */
  async extractClaims(params: ExtractClaimsParams): Promise<IClaimVerificationTracking> {
    const { question, answer, questionNumber, currentTracking } = params;
    
    try {
      // Call AI to detect verifiable claims
      const extraction = await this.detectClaims({
        question,
        answer,
        questionNumber,
      });
      
      // Add new claims to tracking
      const updatedTracking = this.addClaimsToTracking(
        currentTracking,
        extraction.newClaims
      );
      
      // Update statistics
      this.updateStatistics(updatedTracking);
      
      updatedTracking.lastUpdated = new Date();
      
      console.log(`[ClaimVerification] Extracted ${extraction.newClaims.length} new claims. Total: ${updatedTracking.totalClaims}`);
      
      return updatedTracking;
      
    } catch (error) {
      console.error('[ClaimVerification] Failed to extract claims:', error);
      return currentTracking;
    }
  }
  
  /**
   * Call AI to detect verifiable claims
   */
  private async detectClaims(params: {
    question: string;
    answer: string;
    questionNumber: number;
  }): Promise<ClaimExtractionResult> {
    const { question, answer, questionNumber } = params;
    
    const systemPrompt = `You are an expert interviewer trained to identify verifiable claims.

A VERIFIABLE CLAIM is a statement that:
- Can be measured or proven
- Makes specific assertions about numbers, results, or responsibilities
- Should be verified with follow-up questions

TYPES OF CLAIMS:
- quantitative: Numbers, percentages, metrics (e.g., "increased sales by 40%", "managed 20 people")
- achievement: Specific accomplishments (e.g., "launched product in 6 months", "won award")
- leadership: Team/people management (e.g., "led team of 5", "made hiring decisions")
- technical: Technical expertise (e.g., "built microservices architecture", "optimized to 99.9% uptime")
- timeline: Time-based claims (e.g., "3 years at Google", "completed in 2 months")
- responsibility: Role claims (e.g., "responsible for $2M budget", "owned entire backend")

For EACH claim:
1. Extract the exact claim
2. Classify the type
3. Assign confidence (0-100) - how certain you are this is verifiable
4. Generate 2-3 follow-up questions to verify it

FOLLOW-UP QUESTION TYPES:
- Measurement: "How did you measure that?"
- Timeline: "Over what period?"
- Tools/Methods: "What tools/process did you use?"
- Impact: "What was the before/after?"
- Role: "What was your specific role?"
- Details: "Walk me through the details"

OUTPUT FORMAT (JSON):
{
  "claims": [
    {
      "claim": "increased sales by 40%",
      "claimType": "quantitative",
      "confidence": 95,
      "suggestedFollowUps": [
        "How did you measure the sales increase?",
        "Over what time period did you achieve this 40% increase?",
        "What specific actions did you take to drive this growth?"
      ]
    }
  ]
}`;

    const userPrompt = `QUESTION:
${question}

ANSWER:
${answer}

Identify all verifiable claims in the answer above.`;

    try {
      const openAIService = getOpenAIService();
      const prompt = `${systemPrompt}\n\n${userPrompt}`;
      const response = await openAIService.callOpenAI(prompt, 0.3, 1000);
      
      const claims = this.validateClaimExtraction(response, questionNumber);
      return { newClaims: claims };
      
    } catch (error) {
      console.error('[ClaimVerification] AI extraction failed:', error);
      return { newClaims: [] };
    }
  }
  
  /**
   * Validate AI response and convert to IVerifiableClaim[]
   */
  private validateClaimExtraction(data: any, questionNumber: number): IVerifiableClaim[] {
    if (!data.claims || !Array.isArray(data.claims)) {
      return [];
    }
    
    return data.claims
      .filter((item: any) => 
        item.claim && 
        item.claimType &&
        typeof item.confidence === 'number' &&
        Array.isArray(item.suggestedFollowUps)
      )
      .map((item: any) => ({
        claim: item.claim.trim(),
        claimType: item.claimType as ClaimType,
        questionNumber,
        confidence: Math.min(100, Math.max(0, item.confidence)),
        verificationStatus: 'unverified' as const,
        suggestedFollowUps: item.suggestedFollowUps.slice(0, 3),
        followUpAsked: false,
        timestamp: new Date(),
      }));
  }
  
  /**
   * Add new claims to tracking (with deduplication)
   */
  private addClaimsToTracking(
    tracking: IClaimVerificationTracking,
    newClaims: IVerifiableClaim[]
  ): IClaimVerificationTracking {
    // Deduplicate claims (case-insensitive, trimmed)
    const existingClaims = new Set(
      tracking.claims.map(c => c.claim.toLowerCase().trim())
    );
    
    const uniqueNewClaims = newClaims.filter(
      newClaim => !existingClaims.has(newClaim.claim.toLowerCase().trim())
    );
    
    return {
      ...tracking,
      claims: [...tracking.claims, ...uniqueNewClaims],
    };
  }
  
  /**
   * Update statistics
   */
  private updateStatistics(tracking: IClaimVerificationTracking): void {
    tracking.totalClaims = tracking.claims.length;
    tracking.unverifiedCount = tracking.claims.filter(c => c.verificationStatus === 'unverified').length;
    tracking.verifiedCount = tracking.claims.filter(c => c.verificationStatus === 'verified').length;
    
    // Update high priority list
    const highPriority = getHighPriorityClaims(tracking, 5);
    tracking.highPriorityClaims = highPriority.map(c => c.claim);
  }
  
  /**
   * Get next claim to verify
   */
  getNextClaimToVerify(tracking: IClaimVerificationTracking): IVerifiableClaim | undefined {
    const highPriority = getHighPriorityClaims(tracking, 1);
    return highPriority[0];
  }
  
  /**
   * Mark claim as having follow-up asked
   */
  markFollowUpAsked(
    tracking: IClaimVerificationTracking,
    claimText: string,
    questionNumber: number
  ): IClaimVerificationTracking {
    const claim = tracking.claims.find(
      c => c.claim.toLowerCase().trim() === claimText.toLowerCase().trim()
    );
    
    if (claim) {
      claim.followUpAsked = true;
      claim.followUpQuestionNumber = questionNumber;
    }
    
    return tracking;
  }
  
  /**
   * Update claim verification status based on follow-up answer
   */
  updateVerificationStatus(
    tracking: IClaimVerificationTracking,
    claimText: string,
    followUpAnswer: string,
    verificationStatus: 'verified' | 'partially_verified' | 'challenged'
  ): IClaimVerificationTracking {
    const claim = tracking.claims.find(
      c => c.claim.toLowerCase().trim() === claimText.toLowerCase().trim()
    );
    
    if (claim) {
      claim.verificationStatus = verificationStatus;
      claim.followUpAnswer = followUpAnswer;
      claim.verificationNotes = `Updated based on follow-up answer`;
    }
    
    this.updateStatistics(tracking);
    
    return tracking;
  }
  
  /**
   * Get verification context for AI prompts
   */
  getVerificationContextForAI(tracking: IClaimVerificationTracking): string {
    return formatClaimsForAI(tracking);
  }
  
  /**
   * Suggest verification question
   */
  suggestVerificationQuestion(tracking: IClaimVerificationTracking): string | undefined {
    const nextClaim = this.getNextClaimToVerify(tracking);
    
    if (!nextClaim || nextClaim.suggestedFollowUps.length === 0) {
      return undefined;
    }
    
    // Return the first suggested follow-up
    return nextClaim.suggestedFollowUps[0];
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const claimVerificationService = new ClaimVerificationService();
export default claimVerificationService;
