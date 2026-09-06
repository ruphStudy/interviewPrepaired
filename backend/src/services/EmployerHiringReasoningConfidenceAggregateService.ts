import Organization, { IOrganization } from '../models/Organization.model';
import Interview, { IInterview } from '../models/interview.model';
import { InterviewPurpose } from '../constants/interview';
import EmployerHiringAnswerReasoningSignal from '../models/EmployerHiringAnswerReasoningSignal.model';
import EmployerHiringAnswerConfidenceSignal from '../models/EmployerHiringAnswerConfidenceSignal.model';
import EmployerHiringAssessmentConsistency from '../models/EmployerHiringAssessmentConsistency.model';
import EmployerHiringClaimVerification from '../models/EmployerHiringClaimVerification.model';
import EmployerHiringReasoningConfidenceAggregate, {
  IEmployerHiringReasoningConfidenceAggregate,
  ISignalLevelCounts,
  IReasoningAggregate,
  IConfidenceAggregate,
  IConsistencyAggregate,
  IClaimAlignmentAggregate,
  ICoverageAggregate,
} from '../models/EmployerHiringReasoningConfidenceAggregate.model';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const CALCULATION_VERSION = 'reasoning-confidence-aggregate-v1';

const REASONING_SIGNAL_TYPES = [
  'problem_decomposition',
  'tradeoff_awareness',
  'assumption_awareness',
  'evidence_usage',
  'causal_reasoning',
  'alternative_consideration',
  'decision_clarity',
] as const;

function emptySignalCounts(): ISignalLevelCounts {
  return { strong: 0, present: 0, limited: 0, notObserved: 0 };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Deterministic (NO AI) assessment-level aggregate over already-completed
 * 26A/26B/26C/26D artifacts (26E) — pure counting/copying of existing
 * structured values, never a new numeric reasoning/confidence/honesty
 * score, never a hiring recommendation or candidate ranking. 26A-26D may
 * be partially available; this NEVER auto-generates any of them.
 */
export class EmployerHiringReasoningConfidenceAggregateService {
  /** POST .../reasoning-confidence-aggregate/build — requires INTERVIEWS_MANAGE. Deterministic upsert-in-place; no client artifact IDs accepted. */
  async buildAggregate(organizationId: string, actingRole: OrganizationMemberRole, interviewId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const interview = await this.loadInterview(organization, interviewId);

    const [reasoningRows, confidenceRows, consistencyDoc, claimVerificationDoc] = await Promise.all([
      EmployerHiringAnswerReasoningSignal.find({ organizationId: organization._id, interviewId: interview._id, status: 'completed' })
        .select('questionIndex signals overallReasoningEvidence')
        .lean(),
      EmployerHiringAnswerConfidenceSignal.find({ organizationId: organization._id, interviewId: interview._id, status: 'completed' })
        .select('questionIndex expressionConfidence uncertaintyAwareness calibration')
        .lean(),
      EmployerHiringAssessmentConsistency.findOne({ organizationId: organization._id, interviewId: interview._id, status: 'completed' })
        .select('overallConsistency findings')
        .lean(),
      EmployerHiringClaimVerification.findOne({ organizationId: organization._id, interviewId: interview._id, status: 'completed' })
        .select('claims')
        .lean(),
    ]);

    const totalAnsweredQuestions = interview.questions.filter((q) => q.answerText && q.answerText.trim().length > 0).length;

    const reasoning = this.aggregateReasoning(reasoningRows);
    const confidence = this.aggregateConfidence(confidenceRows);
    const consistency = this.aggregateConsistency(consistencyDoc);
    const claimAlignment = this.aggregateClaimAlignment(claimVerificationDoc);
    const coverage = this.aggregateCoverage(totalAnsweredQuestions, reasoningRows.length, confidenceRows.length, Boolean(consistencyDoc), Boolean(claimVerificationDoc));

    const generatedAt = new Date();
    const doc = await EmployerHiringReasoningConfidenceAggregate.findOneAndUpdate(
      { organizationId: organization._id, interviewId: interview._id },
      {
        $set: {
          applicationId: interview.employerApplicationId,
          calculationVersion: CALCULATION_VERSION,
          generatedAt,
          reasoning,
          confidence,
          consistency,
          claimAlignment,
          coverage,
        },
      },
      { upsert: true, new: true }
    );

    return this.toDetail(doc!);
  }

  /** GET .../reasoning-confidence-aggregate — requires ORGANIZATION_VIEW. Read-only; never builds. */
  async getAggregate(organizationId: string, actingRole: OrganizationMemberRole, interviewId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id }).select('_id purpose');
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }

    const doc = await EmployerHiringReasoningConfidenceAggregate.findOne({ organizationId: organization._id, interviewId: interview._id });
    if (!doc) {
      return { built: false };
    }
    return this.toDetail(doc);
  }

  private async loadInterview(organization: IOrganization, interviewId: string): Promise<IInterview> {
    const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id });
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }
    if (interview.hiringEvaluationStatus !== 'completed') {
      throw new ApiError(409, 'This assessment has not been evaluated yet. Evaluate the assessment first.');
    }
    return interview;
  }

  /** Pure counting — no averaging, no new numeric reasoning score. */
  private aggregateReasoning(rows: Array<{ signals?: unknown; overallReasoningEvidence?: unknown }>): IReasoningAggregate {
    const signalCounts = {
      problem_decomposition: emptySignalCounts(),
      tradeoff_awareness: emptySignalCounts(),
      assumption_awareness: emptySignalCounts(),
      evidence_usage: emptySignalCounts(),
      causal_reasoning: emptySignalCounts(),
      alternative_consideration: emptySignalCounts(),
      decision_clarity: emptySignalCounts(),
    } as IReasoningAggregate['signalCounts'];

    let strongAnswerCount = 0;
    let sufficientAnswerCount = 0;
    let limitedAnswerCount = 0;
    let insufficientAnswerCount = 0;

    for (const row of rows) {
      switch (row.overallReasoningEvidence) {
        case 'strong':
          strongAnswerCount++;
          break;
        case 'sufficient':
          sufficientAnswerCount++;
          break;
        case 'limited':
          limitedAnswerCount++;
          break;
        case 'insufficient':
          insufficientAnswerCount++;
          break;
        default:
          break;
      }

      const signals = Array.isArray(row.signals) ? (row.signals as Array<{ type: string; level: string }>) : [];
      for (const s of signals) {
        if (!REASONING_SIGNAL_TYPES.includes(s.type as (typeof REASONING_SIGNAL_TYPES)[number])) continue;
        const bucket = signalCounts[s.type as (typeof REASONING_SIGNAL_TYPES)[number]];
        switch (s.level) {
          case 'strong':
            bucket.strong++;
            break;
          case 'present':
            bucket.present++;
            break;
          case 'limited':
            bucket.limited++;
            break;
          case 'not_observed':
            bucket.notObserved++;
            break;
          default:
            break;
        }
      }
    }

    return {
      analyzedAnswerCount: rows.length,
      strongAnswerCount,
      sufficientAnswerCount,
      limitedAnswerCount,
      insufficientAnswerCount,
      signalCounts,
    };
  }

  /** Pure counting — no confidence percentage, no personality/honesty score. */
  private aggregateConfidence(
    rows: Array<{ expressionConfidence?: unknown; uncertaintyAwareness?: unknown; calibration?: unknown }>
  ): IConfidenceAggregate {
    const expressionConfidenceCounts = { high: 0, moderate: 0, low: 0, mixed: 0 };
    const uncertaintyAwarenessCounts = { strong: 0, present: 0, limited: 0, notObserved: 0 };
    const calibrationCounts = { wellCalibrated: 0, possiblyOverconfident: 0, possiblyUnderconfident: 0, insufficientEvidence: 0 };

    for (const row of rows) {
      switch (row.expressionConfidence) {
        case 'high':
          expressionConfidenceCounts.high++;
          break;
        case 'moderate':
          expressionConfidenceCounts.moderate++;
          break;
        case 'low':
          expressionConfidenceCounts.low++;
          break;
        case 'mixed':
          expressionConfidenceCounts.mixed++;
          break;
        default:
          break;
      }

      switch (row.uncertaintyAwareness) {
        case 'strong':
          uncertaintyAwarenessCounts.strong++;
          break;
        case 'present':
          uncertaintyAwarenessCounts.present++;
          break;
        case 'limited':
          uncertaintyAwarenessCounts.limited++;
          break;
        case 'not_observed':
          uncertaintyAwarenessCounts.notObserved++;
          break;
        default:
          break;
      }

      switch (row.calibration) {
        case 'well_calibrated':
          calibrationCounts.wellCalibrated++;
          break;
        case 'possibly_overconfident':
          calibrationCounts.possiblyOverconfident++;
          break;
        case 'possibly_underconfident':
          calibrationCounts.possiblyUnderconfident++;
          break;
        case 'insufficient_evidence':
          calibrationCounts.insufficientEvidence++;
          break;
        default:
          break;
      }
    }

    return { analyzedAnswerCount: rows.length, expressionConfidenceCounts, uncertaintyAwarenessCounts, calibrationCounts };
  }

  /** Copies overallConsistency as-is; counts findings by severity server-side. Never reinterprets findings. */
  private aggregateConsistency(doc: { overallConsistency?: unknown; findings?: unknown } | null): IConsistencyAggregate {
    if (!doc) {
      return { available: false, findingCount: 0, highSeverityFindingCount: 0, mediumSeverityFindingCount: 0, lowSeverityFindingCount: 0 };
    }
    const findings = Array.isArray(doc.findings) ? (doc.findings as Array<{ severity: string }>) : [];
    return {
      available: true,
      overallConsistency: typeof doc.overallConsistency === 'string' ? doc.overallConsistency : undefined,
      findingCount: findings.length,
      highSeverityFindingCount: findings.filter((f) => f.severity === 'high').length,
      mediumSeverityFindingCount: findings.filter((f) => f.severity === 'medium').length,
      lowSeverityFindingCount: findings.filter((f) => f.severity === 'low').length,
    };
  }

  /** Recomputes alignment counts SERVER-SIDE from the validated `claims[]` array — never blindly trusts the stored `summary`. */
  private aggregateClaimAlignment(doc: { claims?: unknown } | null): IClaimAlignmentAggregate {
    if (!doc) {
      return { available: false, totalClaims: 0, supported: 0, partiallySupported: 0, unsupported: 0, conflicting: 0, unverifiable: 0 };
    }
    const claims = Array.isArray(doc.claims) ? (doc.claims as Array<{ alignment: string }>) : [];
    return {
      available: true,
      totalClaims: claims.length,
      supported: claims.filter((c) => c.alignment === 'supported').length,
      partiallySupported: claims.filter((c) => c.alignment === 'partially_supported').length,
      unsupported: claims.filter((c) => c.alignment === 'unsupported').length,
      conflicting: claims.filter((c) => c.alignment === 'conflicting').length,
      unverifiable: claims.filter((c) => c.alignment === 'unverifiable').length,
    };
  }

  private aggregateCoverage(
    totalAnsweredQuestions: number,
    reasoningAnalyzedQuestions: number,
    confidenceAnalyzedQuestions: number,
    consistencyAvailable: boolean,
    claimVerificationAvailable: boolean
  ): ICoverageAggregate {
    const reasoningCoveragePercent = totalAnsweredQuestions > 0 ? round2((reasoningAnalyzedQuestions / totalAnsweredQuestions) * 100) : 0;
    const confidenceCoveragePercent = totalAnsweredQuestions > 0 ? round2((confidenceAnalyzedQuestions / totalAnsweredQuestions) * 100) : 0;
    return {
      totalAnsweredQuestions,
      reasoningAnalyzedQuestions,
      confidenceAnalyzedQuestions,
      reasoningCoveragePercent,
      confidenceCoveragePercent,
      consistencyAvailable,
      claimVerificationAvailable,
    };
  }

  private async getOrganizationById(organizationId: string): Promise<IOrganization> {
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      throw new ApiError(404, 'Organization not found');
    }
    return organization;
  }

  private assertHasPermission(role: OrganizationMemberRole, permission: OrganizationPermission): void {
    if (!hasOrganizationPermission(role, permission)) {
      throw new ApiError(403, 'You do not have permission to perform this action');
    }
  }

  private assertIsCompany(organization: IOrganization): void {
    if (organization.type !== OrganizationType.COMPANY) {
      throw new ApiError(400, 'This organization is not a company');
    }
  }

  private assertOrganizationMutable(organization: IOrganization): void {
    if (organization.status === OrganizationStatus.ARCHIVED) {
      throw new ApiError(400, 'This organization is archived and read-only');
    }
  }

  private toDetail(doc: IEmployerHiringReasoningConfidenceAggregate): Record<string, unknown> {
    return {
      built: true,
      calculationVersion: doc.calculationVersion,
      generatedAt: doc.generatedAt,
      reasoning: doc.reasoning,
      confidence: doc.confidence,
      consistency: doc.consistency,
      claimAlignment: doc.claimAlignment,
      coverage: doc.coverage,
    };
  }
}

export const employerHiringReasoningConfidenceAggregateService = new EmployerHiringReasoningConfidenceAggregateService();
export default employerHiringReasoningConfidenceAggregateService;
