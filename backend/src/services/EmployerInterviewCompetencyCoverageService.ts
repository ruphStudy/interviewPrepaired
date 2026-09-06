import Organization, { IOrganization } from '../models/Organization.model';
import Interview, { IInterview } from '../models/interview.model';
import { InterviewPurpose } from '../constants/interview';
import EmployerInterviewGraph from '../models/EmployerInterviewGraph.model';
import EmployerInterviewCompetencyCoverage, {
  IEmployerInterviewCompetencyCoverage,
  ICompetencyCoverageEntry,
  ICompetencyCoverageDynamicEdge,
} from '../models/EmployerInterviewCompetencyCoverage.model';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const CALCULATION_VERSION = 'competency-coverage-v1';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Deterministic (NO AI) LIVE competency coverage overlay (27C) — recomputes
 * per-competency question/answer/evaluation counts directly from CURRENT
 * `Interview.questions` (which already reflects any valid 27B dynamic
 * follow-ups) against the exact competency universe of the existing 27A
 * graph. Never rebuilds/mutates the stored 27A graph, never generates
 * questions, never calls AI, never auto-invokes 27B.
 */
export class EmployerInterviewCompetencyCoverageService {
  /** POST .../competency-coverage/build — requires INTERVIEWS_MANAGE. Deterministic upsert-in-place; no client graph/question IDs accepted. Works during the interview lifecycle — does not require the interview to be completed. */
  async buildCoverage(organizationId: string, actingRole: OrganizationMemberRole, interviewId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id });
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }

    const graph = await EmployerInterviewGraph.findOne({ organizationId: organization._id, interviewId: interview._id }).select('_id nodes');
    if (!graph) {
      throw new ApiError(409, 'Interview graph has not been built yet. Build the interview graph first.');
    }

    const { competencies, dynamicEdges, summary } = this.buildCoverageEntries(interview, graph.nodes);

    const generatedAt = new Date();
    const doc = await EmployerInterviewCompetencyCoverage.findOneAndUpdate(
      { organizationId: organization._id, interviewId: interview._id },
      {
        $set: {
          applicationId: interview.employerApplicationId,
          graphId: graph._id,
          calculationVersion: CALCULATION_VERSION,
          generatedAt,
          competencies,
          dynamicEdges,
          summary,
        },
      },
      { upsert: true, new: true }
    );

    return this.toDetail(doc!);
  }

  /** GET .../competency-coverage — requires ORGANIZATION_VIEW. Read-only; never builds. */
  async getCoverage(organizationId: string, actingRole: OrganizationMemberRole, interviewId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id }).select('_id purpose');
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }

    const doc = await EmployerInterviewCompetencyCoverage.findOne({ organizationId: organization._id, interviewId: interview._id });
    if (!doc) {
      return { built: false };
    }
    return this.toDetail(doc);
  }

  /**
   * Pure deterministic derivation — NO AI. Per-competency question indexes
   * are recomputed LIVE from `interview.questions[].competencyNames`
   * (never from the possibly-stale stored 27A edges), so a 27B dynamic
   * follow-up (which carries its own `competencyNames`) is picked up
   * automatically without ever touching the 27A graph document.
   */
  private buildCoverageEntries(
    interview: IInterview,
    graphNodes: Array<{ nodeId: string; type: string; competencyName?: string }>
  ): { competencies: ICompetencyCoverageEntry[]; dynamicEdges: ICompetencyCoverageDynamicEdge[]; summary: Record<string, number> } {
    const competencyNodes = graphNodes.filter((n) => n.type === 'competency' && n.competencyName);

    const competencies: ICompetencyCoverageEntry[] = [];
    const dynamicEdges: ICompetencyCoverageDynamicEdge[] = [];

    for (const node of competencyNodes) {
      const name = node.competencyName!;
      const questionIndexes: number[] = [];
      const answeredQuestionIndexes: number[] = [];
      const evaluatedQuestionIndexes: number[] = [];
      let dynamicFollowUpCount = 0;

      interview.questions.forEach((q, index) => {
        if (!(q.competencyNames ?? []).includes(name)) return;
        questionIndexes.push(index);
        if (q.answerText && q.answerText.trim().length > 0) answeredQuestionIndexes.push(index);
        if (q.evaluation) evaluatedQuestionIndexes.push(index);
        if (q.dynamicFollowUp) {
          dynamicFollowUpCount += 1;
          dynamicEdges.push({
            competencyNodeId: node.nodeId,
            questionIndex: index,
            sourceQuestionIndex: q.followUpSourceQuestionIndex ?? -1,
          });
        }
      });

      const evidenceState = evaluatedQuestionIndexes.length > 0 ? 'covered' : answeredQuestionIndexes.length > 0 ? 'partial' : 'not_started';

      competencies.push({
        competencyNodeId: node.nodeId,
        competencyName: name,
        plannedQuestionCount: questionIndexes.length,
        answeredQuestionCount: answeredQuestionIndexes.length,
        evaluatedQuestionCount: evaluatedQuestionIndexes.length,
        evidenceState,
        questionIndexes,
        answeredQuestionIndexes,
        evaluatedQuestionIndexes,
        dynamicFollowUpCount,
      });
    }

    const coveredCount = competencies.filter((c) => c.evidenceState === 'covered').length;
    const partialCount = competencies.filter((c) => c.evidenceState === 'partial').length;
    const notStartedCount = competencies.filter((c) => c.evidenceState === 'not_started').length;
    const answeredQuestionCount = interview.questions.filter((q) => q.answerText && q.answerText.trim().length > 0).length;
    const evaluatedQuestionCount = interview.questions.filter((q) => q.evaluation).length;

    const summary = {
      competencyCount: competencies.length,
      coveredCount,
      partialCount,
      notStartedCount,
      totalQuestionCount: interview.questions.length,
      answeredQuestionCount,
      evaluatedQuestionCount,
      coveragePercent: competencies.length > 0 ? round2((coveredCount / competencies.length) * 100) : 0,
    };

    return { competencies, dynamicEdges, summary };
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

  private toDetail(doc: IEmployerInterviewCompetencyCoverage): Record<string, unknown> {
    return {
      built: true,
      calculationVersion: doc.calculationVersion,
      generatedAt: doc.generatedAt,
      summary: doc.summary,
      competencies: doc.competencies,
      dynamicEdges: doc.dynamicEdges,
    };
  }
}

export const employerInterviewCompetencyCoverageService = new EmployerInterviewCompetencyCoverageService();
export default employerInterviewCompetencyCoverageService;
