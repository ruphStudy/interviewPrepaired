import Organization, { IOrganization } from '../models/Organization.model';
import Interview from '../models/interview.model';
import { InterviewPurpose } from '../constants/interview';
import EmployerInterviewGraph from '../models/EmployerInterviewGraph.model';
import EmployerInterviewFollowUpRoute from '../models/EmployerInterviewFollowUpRoute.model';
import EmployerInterviewCompetencyCoverage from '../models/EmployerInterviewCompetencyCoverage.model';
import EmployerInterviewAdaptiveRoute, { IEmployerInterviewAdaptiveRoute } from '../models/EmployerInterviewAdaptiveRoute.model';
import EmployerInterviewGraphAnalytics, { IEmployerInterviewGraphAnalytics } from '../models/EmployerInterviewGraphAnalytics.model';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const CALCULATION_VERSION = 'interview-graph-analytics-v1';
const DIFFICULTY_ORDER = ['easy', 'medium', 'hard'];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Deterministic (NO AI) analytics explaining how the dynamic interview
 * graph was actually TRAVERSED (27E) — built purely from persisted 27A
 * graph, current `Interview.questions`, 27B follow-up routes, 27C
 * coverage, and 27D adaptive route history. Never a candidate performance
 * score, never a hiring recommendation, never candidate ranking. Requires
 * only the 27A graph; 27B/27C/27D artifacts may be partially or entirely
 * absent — partial availability is valid, never silently built here.
 */
export class EmployerInterviewGraphAnalyticsService {
  /** POST .../graph-analytics/build — requires INTERVIEWS_MANAGE (same convention as every other persisted-artifact build in this domain). Deterministic upsert-in-place; no client artifact IDs accepted. */
  async buildAnalytics(organizationId: string, actingRole: OrganizationMemberRole, interviewId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id });
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }

    const graph = await EmployerInterviewGraph.findOne({ organizationId: organization._id, interviewId: interview._id }).select(
      '_id nodes'
    );
    if (!graph) {
      throw new ApiError(409, 'Interview graph has not been built yet. Build the interview graph first.');
    }

    const [followUpRoutes, coverageDoc, adaptiveRoutes] = await Promise.all([
      EmployerInterviewFollowUpRoute.find({ organizationId: organization._id, interviewId: interview._id, status: 'completed' })
        .select('decision')
        .lean(),
      EmployerInterviewCompetencyCoverage.findOne({ organizationId: organization._id, interviewId: interview._id }).select('summary').lean(),
      EmployerInterviewAdaptiveRoute.find({ organizationId: organization._id, interviewId: interview._id })
        .sort({ createdAt: 1 })
        .select('decision reasonType selectedDifficulty')
        .lean(),
    ]);

    const graphSummary = {
      competencyCount: graph.nodes.filter((n) => n.type === 'competency').length,
      plannedQuestionCount: graph.nodes.filter((n) => n.type === 'question').length,
      dynamicFollowUpCount: interview.questions.filter((q) => q.dynamicFollowUp).length,
      totalCurrentQuestionCount: interview.questions.length,
    };

    const answeredQuestionCount = interview.questions.filter((q) => q.answerText && q.answerText.trim().length > 0).length;
    const evaluatedQuestionCount = interview.questions.filter((q) => q.evaluation).length;
    const nonWaitingRoutes = adaptiveRoutes.filter((r) => r.decision !== 'wait_for_evaluation');
    const executionSummary = {
      answeredQuestionCount,
      evaluatedQuestionCount,
      unansweredQuestionCount: interview.questions.length - answeredQuestionCount,
      adaptiveRouteCount: adaptiveRoutes.length,
      completedRouteCount: nonWaitingRoutes.length,
    };

    const followUpGeneratedCount = followUpRoutes.filter((r) => r.decision === 'follow_up').length;
    const continueDecisionCount = followUpRoutes.filter((r) => r.decision === 'continue').length;
    const followUpsSummary = {
      analyzedSourceQuestionCount: followUpRoutes.length,
      followUpGeneratedCount,
      continueDecisionCount,
      followUpRatePercent: followUpRoutes.length > 0 ? round2((followUpGeneratedCount / followUpRoutes.length) * 100) : 0,
    };

    const coverageSummary = coverageDoc
      ? {
          available: true,
          competencyCount: coverageDoc.summary.competencyCount,
          coveredCount: coverageDoc.summary.coveredCount,
          partialCount: coverageDoc.summary.partialCount,
          notStartedCount: coverageDoc.summary.notStartedCount,
          coveragePercent: coverageDoc.summary.coveragePercent,
        }
      : { available: false };

    const selectedRoutes = adaptiveRoutes.filter((r) => r.decision === 'select_question');
    const adaptiveRoutingSummary = {
      selectionCount: selectedRoutes.length,
      followUpPrioritySelections: selectedRoutes.filter((r) => r.reasonType === 'follow_up_priority').length,
      uncoveredCompetencySelections: selectedRoutes.filter((r) => r.reasonType === 'uncovered_competency').length,
      partialCoverageSelections: selectedRoutes.filter((r) => r.reasonType === 'partial_coverage').length,
      difficultyProgressionSelections: selectedRoutes.filter((r) => r.reasonType === 'difficulty_progression').length,
      difficultyRecoverySelections: selectedRoutes.filter((r) => r.reasonType === 'difficulty_recovery').length,
      remainingQuestionSelections: selectedRoutes.filter((r) => r.reasonType === 'remaining_question').length,
    };

    const difficultySummary = this.computeDifficultySummary(selectedRoutes);

    const generatedAt = new Date();
    const doc = await EmployerInterviewGraphAnalytics.findOneAndUpdate(
      { organizationId: organization._id, interviewId: interview._id },
      {
        $set: {
          applicationId: interview.employerApplicationId,
          graphId: graph._id,
          calculationVersion: CALCULATION_VERSION,
          generatedAt,
          graph: graphSummary,
          execution: executionSummary,
          followUps: followUpsSummary,
          coverage: coverageSummary,
          adaptiveRouting: adaptiveRoutingSummary,
          difficulty: difficultySummary,
        },
      },
      { upsert: true, new: true }
    );

    return this.toDetail(doc!);
  }

  /** GET .../graph-analytics — requires ANALYTICS_VIEW. Read-only; never builds. */
  async getAnalytics(organizationId: string, actingRole: OrganizationMemberRole, interviewId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ANALYTICS_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id }).select('_id purpose');
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }

    const doc = await EmployerInterviewGraphAnalytics.findOne({ organizationId: organization._id, interviewId: interview._id });
    if (!doc) {
      return { built: false };
    }
    return this.toDetail(doc);
  }

  /** Chronological (already-sorted) `select_question` routes only — `wait_for_evaluation`/`complete` never contribute to difficulty routing behavior. Routing behavior only, never candidate improvement/ability. */
  private computeDifficultySummary(
    selectedRoutesChronological: Array<Pick<IEmployerInterviewAdaptiveRoute, 'selectedDifficulty'>>
  ): {
    selectedEasyCount: number;
    selectedMediumCount: number;
    selectedHardCount: number;
    transitions: {
      easyToMedium: number;
      mediumToHard: number;
      hardToMedium: number;
      mediumToEasy: number;
      sameDifficulty: number;
      unknown: number;
    };
  } {
    const transitions = { easyToMedium: 0, mediumToHard: 0, hardToMedium: 0, mediumToEasy: 0, sameDifficulty: 0, unknown: 0 };
    let prev: string | undefined;
    for (const route of selectedRoutesChronological) {
      const current = route.selectedDifficulty;
      if (prev !== undefined) {
        if (!prev || !current || !DIFFICULTY_ORDER.includes(prev) || !DIFFICULTY_ORDER.includes(current)) {
          transitions.unknown++;
        } else if (prev === current) {
          transitions.sameDifficulty++;
        } else if (prev === 'easy' && current === 'medium') {
          transitions.easyToMedium++;
        } else if (prev === 'medium' && current === 'hard') {
          transitions.mediumToHard++;
        } else if (prev === 'hard' && current === 'medium') {
          transitions.hardToMedium++;
        } else if (prev === 'medium' && current === 'easy') {
          transitions.mediumToEasy++;
        } else {
          transitions.unknown++;
        }
      }
      prev = current;
    }

    return {
      selectedEasyCount: selectedRoutesChronological.filter((r) => r.selectedDifficulty === 'easy').length,
      selectedMediumCount: selectedRoutesChronological.filter((r) => r.selectedDifficulty === 'medium').length,
      selectedHardCount: selectedRoutesChronological.filter((r) => r.selectedDifficulty === 'hard').length,
      transitions,
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

  private toDetail(doc: IEmployerInterviewGraphAnalytics): Record<string, unknown> {
    return {
      built: true,
      calculationVersion: doc.calculationVersion,
      generatedAt: doc.generatedAt,
      graph: doc.graph,
      execution: doc.execution,
      followUps: doc.followUps,
      coverage: doc.coverage,
      adaptiveRouting: doc.adaptiveRouting,
      difficulty: doc.difficulty,
    };
  }
}

export const employerInterviewGraphAnalyticsService = new EmployerInterviewGraphAnalyticsService();
export default employerInterviewGraphAnalyticsService;
