import { Schema } from 'mongoose';

// ============================================================================
// TypeScript Interfaces
// ============================================================================

/**
 * Verification status for a claim
 */
export type VerificationStatus = 'unverified' | 'partially_verified' | 'verified' | 'challenged';

/**
 * Type of claim detected
 */
export type ClaimType = 
  | 'quantitative' // Numbers, percentages, metrics
  | 'achievement' // Accomplishments, results
  | 'leadership' // Team management, decision-making
  | 'technical' // Technical expertise claims
  | 'timeline' // Time-based claims
  | 'responsibility'; // Role/responsibility claims

/**
 * Single verifiable claim
 */
export interface IVerifiableClaim {
  claim: string; // The actual claim made
  claimType: ClaimType;
  questionNumber: number; // Where claim was made
  confidence: number; // 0-100: AI confidence this is a verifiable claim
  verificationStatus: VerificationStatus;
  
  // Verification questions generated
  suggestedFollowUps: string[];
  
  // If follow-up was asked
  followUpAsked?: boolean;
  followUpQuestionNumber?: number;
  followUpAnswer?: string;
  
  // Verification result
  verificationNotes?: string;
  timestamp: Date;
}

/**
 * Claim verification tracking for interview
 */
export interface IClaimVerificationTracking {
  claims: IVerifiableClaim[];
  totalClaims: number;
  unverifiedCount: number;
  verifiedCount: number;
  highPriorityClaims: string[]; // Claims that should be verified soon
  lastUpdated: Date;
}

// ============================================================================
// Mongoose Schema
// ============================================================================

const verifiableClaimSchema = new Schema<IVerifiableClaim>(
  {
    claim: { type: String, required: true },
    claimType: {
      type: String,
      required: true,
      enum: ['quantitative', 'achievement', 'leadership', 'technical', 'timeline', 'responsibility'],
    },
    questionNumber: { type: Number, required: true },
    confidence: { type: Number, required: true, min: 0, max: 100 },
    verificationStatus: {
      type: String,
      required: true,
      enum: ['unverified', 'partially_verified', 'verified', 'challenged'],
      default: 'unverified',
    },
    suggestedFollowUps: { type: [String], default: [] },
    followUpAsked: { type: Boolean, default: false },
    followUpQuestionNumber: { type: Number },
    followUpAnswer: { type: String },
    verificationNotes: { type: String },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

export const claimVerificationTrackingSchema = new Schema<IClaimVerificationTracking>(
  {
    claims: { type: [verifiableClaimSchema], default: [] },
    totalClaims: { type: Number, default: 0 },
    unverifiedCount: { type: Number, default: 0 },
    verifiedCount: { type: Number, default: 0 },
    highPriorityClaims: { type: [String], default: [] },
    lastUpdated: { type: Date, default: Date.now },
  },
  { _id: false }
);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Initialize empty claim tracking
 */
export function initializeClaimTracking(): IClaimVerificationTracking {
  return {
    claims: [],
    totalClaims: 0,
    unverifiedCount: 0,
    verifiedCount: 0,
    highPriorityClaims: [],
    lastUpdated: new Date(),
  };
}

/**
 * Get high-priority unverified claims
 */
export function getHighPriorityClaims(
  tracking: IClaimVerificationTracking,
  limit: number = 3
): IVerifiableClaim[] {
  return tracking.claims
    .filter(c => 
      c.verificationStatus === 'unverified' && 
      !c.followUpAsked &&
      c.confidence >= 70
    )
    .sort((a, b) => {
      // Sort by: quantitative > achievement > others, then by confidence
      const typeWeight = { quantitative: 3, achievement: 2, leadership: 1, technical: 1, timeline: 1, responsibility: 0 };
      const aWeight = typeWeight[a.claimType];
      const bWeight = typeWeight[b.claimType];
      
      if (aWeight !== bWeight) return bWeight - aWeight;
      return b.confidence - a.confidence;
    })
    .slice(0, limit);
}

/**
 * Format claims for AI context
 */
export function formatClaimsForAI(tracking: IClaimVerificationTracking): string {
  if (tracking.totalClaims === 0) return 'No verifiable claims detected yet.';
  
  const lines = [
    `VERIFIABLE CLAIMS TRACKING:`,
    `Total Claims: ${tracking.totalClaims}`,
    `Verified: ${tracking.verifiedCount}`,
    `Unverified: ${tracking.unverifiedCount}`,
    '',
  ];
  
  const highPriority = getHighPriorityClaims(tracking, 5);
  
  if (highPriority.length > 0) {
    lines.push('HIGH PRIORITY UNVERIFIED CLAIMS:');
    highPriority.forEach((claim, i) => {
      lines.push(`${i + 1}. [${claim.claimType.toUpperCase()}] "${claim.claim}" (Q${claim.questionNumber})`);
      lines.push(`   Suggested follow-ups: ${claim.suggestedFollowUps[0] || 'N/A'}`);
    });
  }
  
  return lines.join('\n');
}

/**
 * Get verification statistics
 */
export function getVerificationStats(tracking: IClaimVerificationTracking): {
  total: number;
  unverified: number;
  partiallyVerified: number;
  verified: number;
  verificationRate: number;
} {
  const partiallyVerified = tracking.claims.filter(c => c.verificationStatus === 'partially_verified').length;
  const verificationRate = tracking.totalClaims > 0 
    ? ((tracking.verifiedCount + partiallyVerified * 0.5) / tracking.totalClaims) * 100 
    : 0;
  
  return {
    total: tracking.totalClaims,
    unverified: tracking.unverifiedCount,
    partiallyVerified,
    verified: tracking.verifiedCount,
    verificationRate: Math.round(verificationRate),
  };
}
