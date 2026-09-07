import Organization, { IOrganization } from '../models/Organization.model';
import Interview from '../models/interview.model';
import { InterviewPurpose } from '../constants/interview';
import EmployerInterviewKnowledgeConfig from '../models/EmployerInterviewKnowledgeConfig.model';
import EmployerHiringKnowledgeGroundedEvaluation from '../models/EmployerHiringKnowledgeGroundedEvaluation.model';
import EmployerInterviewKnowledgeAnalytics, { IEmployerInterviewKnowledgeAnalytics } from '../models/EmployerInterviewKnowledgeAnalytics.model';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const ANALYTICS_VERSION = 'knowledge-analytics-v1';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Deterministic (NO AI) analytics summarizing 29E knowledge-grounded
 * evaluation coverage/alignment for ONE interview — built purely from the
 * 29D config, current `Interview.questions`, and COMPLETED 29E evaluations.
 * Never auto-creates missing evaluations, never uses hiring
 * outcome/pipeline/recruiter-decision/candidate-comparison data, never
 * computes a numeric knowledge score. "Knowledge Alignment", not
 * "Truth Score".
 */
export class EmployerInterviewKnowledgeAnalyticsService {
  /** POST .../knowledge-analytics/build — requires ANALYTICS_VIEW (existing persisted-analytics-build convention). Deterministic upsert-in-place; no client artifact IDs accepted. */
  async buildAnalytics(organizationId: string, actingRole: OrganizationMemberRole, interviewId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ANALYTICS_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id });
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }

    const config = await EmployerInterviewKnowledgeConfig.findOne({ organizationId: organization._id, interviewId: interview._id }).select(
      'enabled knowledgeBaseIds'
    );

    const completedEvaluations = await EmployerHiringKnowledgeGroundedEvaluation.find({
      organizationId: organization._id,
      interviewId: interview._id,
      status: 'completed',
    }).lean();

    const configuration = {
      enabled: config?.enabled ?? false,
      selectedKnowledgeBaseCount: config?.knowledgeBaseIds?.length ?? 0,
    };

    const groundedEvaluations = completedEvaluations.filter((e) => e.knowledgeContext?.retrievalAvailable);
    const noKnowledgeEvaluations = completedEvaluations.filter((e) => !e.knowledgeContext?.retrievalAvailable);

    const knowledgeBaseIds = new Set<string>();
    const documentIds = new Set<string>();
    const chunkIds = new Set<string>();
    for (const evaluation of completedEvaluations) {
      for (const source of evaluation.knowledgeContext?.sources ?? []) {
        knowledgeBaseIds.add(source.knowledgeBaseId.toString());
        documentIds.add(source.documentId.toString());
        chunkIds.add(source.chunkId.toString());
      }
    }

    const retrieval = {
      evaluatedQuestionCount: completedEvaluations.length,
      groundedQuestionCount: groundedEvaluations.length,
      noKnowledgeQuestionCount: noKnowledgeEvaluations.length,
      uniqueKnowledgeBaseCount: knowledgeBaseIds.size,
      uniqueDocumentCount: documentIds.size,
      uniqueChunkCount: chunkIds.size,
    };

    const alignment = {
      alignedCount: 0,
      partiallyAlignedCount: 0,
      conflictingCount: 0,
      insufficientEvidenceCount: 0,
      notApplicableCount: 0,
    };
    const claims = {
      totalClaimCount: 0,
      supportedCount: 0,
      partiallySupportedCount: 0,
      conflictingCount: 0,
      notSupportedCount: 0,
      unverifiableCount: 0,
    };
    const knowledgeSignals = {
      demonstratesKnowledgeCount: 0,
      usesRelevantTerminologyCount: 0,
      respectsKnownConstraintsCount: 0,
    };

    for (const evaluation of completedEvaluations) {
      switch (evaluation.alignment?.overall) {
        case 'aligned':
          alignment.alignedCount++;
          break;
        case 'partially_aligned':
          alignment.partiallyAlignedCount++;
          break;
        case 'conflicting':
          alignment.conflictingCount++;
          break;
        case 'insufficient_evidence':
          alignment.insufficientEvidenceCount++;
          break;
        case 'not_applicable':
        default:
          alignment.notApplicableCount++;
          break;
      }

      for (const claim of evaluation.alignment?.claims ?? []) {
        claims.totalClaimCount++;
        switch (claim.status) {
          case 'supported':
            claims.supportedCount++;
            break;
          case 'partially_supported':
            claims.partiallySupportedCount++;
            break;
          case 'conflicting':
            claims.conflictingCount++;
            break;
          case 'not_supported':
            claims.notSupportedCount++;
            break;
          case 'unverifiable':
            claims.unverifiableCount++;
            break;
        }
      }

      if (evaluation.organizationKnowledgeSignals?.demonstratesKnowledge) knowledgeSignals.demonstratesKnowledgeCount++;
      if (evaluation.organizationKnowledgeSignals?.usesRelevantTerminology) knowledgeSignals.usesRelevantTerminologyCount++;
      if (evaluation.organizationKnowledgeSignals?.respectsKnownConstraints) knowledgeSignals.respectsKnownConstraintsCount++;
    }

    const answeredQuestionCount = interview.questions.filter((q) => q.answerText && q.answerText.trim().length > 0).length;
    const knowledgeEvaluatedQuestionCount = completedEvaluations.length;
    const coveragePercent = answeredQuestionCount > 0 ? round2((knowledgeEvaluatedQuestionCount / answeredQuestionCount) * 100) : 0;

    const coverage = {
      answeredQuestionCount,
      knowledgeEvaluatedQuestionCount,
      coveragePercent,
    };

    const generatedAt = new Date();
    const doc = await EmployerInterviewKnowledgeAnalytics.findOneAndUpdate(
      { organizationId: organization._id, interviewId: interview._id },
      {
        $set: {
          applicationId: interview.employerApplicationId,
          jobId: interview.employerJobId,
          analyticsVersion: ANALYTICS_VERSION,
          generatedAt,
          configuration,
          retrieval,
          alignment,
          claims,
          knowledgeSignals,
          coverage,
        },
      },
      { upsert: true, new: true }
    );

    return this.toDetail(doc!);
  }

  /** GET .../knowledge-analytics — requires ANALYTICS_VIEW. Read-only; never builds. */
  async getAnalytics(organizationId: string, actingRole: OrganizationMemberRole, interviewId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ANALYTICS_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id }).select('_id purpose');
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }

    const doc = await EmployerInterviewKnowledgeAnalytics.findOne({ organizationId: organization._id, interviewId: interview._id });
    if (!doc) {
      return { built: false };
    }
    return this.toDetail(doc);
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

  private toDetail(doc: IEmployerInterviewKnowledgeAnalytics): Record<string, unknown> {
    return {
      built: true,
      analyticsVersion: doc.analyticsVersion,
      generatedAt: doc.generatedAt,
      configuration: doc.configuration,
      retrieval: doc.retrieval,
      alignment: doc.alignment,
      claims: doc.claims,
      knowledgeSignals: doc.knowledgeSignals,
      coverage: doc.coverage,
    };
  }
}

export const employerInterviewKnowledgeAnalyticsService = new EmployerInterviewKnowledgeAnalyticsService();
export default employerInterviewKnowledgeAnalyticsService;
