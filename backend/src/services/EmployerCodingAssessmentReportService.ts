import Organization, { IOrganization } from '../models/Organization.model';
import Interview, { IInterview } from '../models/interview.model';
import { InterviewPurpose } from '../constants/interview';
import EmployerCodingAssessmentSession from '../models/EmployerCodingAssessmentSession.model';
import EmployerCodingQuestion from '../models/EmployerCodingQuestion.model';
import EmployerCodingSubmission, { IEmployerCodingSubmission } from '../models/EmployerCodingSubmission.model';
import EmployerCodingExecution, { IEmployerCodingExecution } from '../models/EmployerCodingExecution.model';
import EmployerCodingEvaluation, { IEmployerCodingEvaluation } from '../models/EmployerCodingEvaluation.model';
import EmployerCodingAssessmentReport, {
  IEmployerCodingAssessmentReport,
  ICodingReportQualityLevelCounts,
  ICodingReportCompetencyEvidence,
  ICodingReportCompetencyEvidenceStates,
  CodingReportEvidenceState,
} from '../models/EmployerCodingAssessmentReport.model';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { employerHiringWorkflowService } from './EmployerHiringWorkflowService';
import { employerIntegrationEventService } from './EmployerIntegrationEventService';
import { ApiError } from '../utils/ApiError';

const REPORT_VERSION = 'coding-assessment-report-v1';
const MAX_EVIDENCE_ITEMS = 10;
const QUALITY_DIMENSIONS = ['readability', 'maintainability', 'structure'] as const;
const REASONING_DIMENSIONS = ['algorithmChoice', 'complexityAwareness', 'edgeCaseHandling'] as const;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function emptyQualityCounts(): ICodingReportQualityLevelCounts {
  return { strong: 0, sufficient: 0, limited: 0, insufficient: 0 };
}

function labelizeDimension(dimension: string): string {
  return dimension.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

/**
 * Deterministic (NO AI) aggregate report over the coding assessment
 * attached to ONE hiring interview (30E) — built purely from 30A question
 * metadata, 30B session/submissions, and COMPLETED 30C executions / 30D
 * evaluations. Only the candidate's LATEST submitted attempt per question
 * counts toward the question-level/aggregate assessment (never inflated by
 * retries); `totalSubmissionCount`/`totalExecutionCount` separately expose
 * all attempt activity. Never a hiring recommendation, candidate ranking,
 * or numeric overall coding score. Never auto-runs 30C or auto-triggers
 * 30D — a partial report (unattempted/unexecuted/unevaluated questions) is
 * a valid, clearly-shown state.
 */
export class EmployerCodingAssessmentReportService {
  /** POST .../coding-report/build — requires INTERVIEWS_MANAGE. Deterministic upsert-in-place; no client artifact IDs accepted. */
  async buildReport(organizationId: string, actingRole: OrganizationMemberRole, interviewId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const interview = await this.loadInterview(organization, interviewId);

    const session = await EmployerCodingAssessmentSession.findOne({ organizationId: organization._id, interviewId: interview._id });
    if (!session) {
      throw new ApiError(409, 'No coding assessment has been configured for this interview yet.');
    }

    const submissions = await EmployerCodingSubmission.find({
      organizationId: organization._id,
      codingSessionId: session._id,
      status: { $ne: 'draft' },
    }).sort({ codingQuestionId: 1, attemptNumber: 1 });
    if (submissions.length === 0) {
      throw new ApiError(409, 'No coding attempt has been submitted for this interview yet.');
    }

    const questions = await EmployerCodingQuestion.find({ _id: { $in: session.questionIds }, organizationId: organization._id });
    const questionById = new Map(questions.map((q) => [q._id.toString(), q]));

    const latestSubmissionByQuestion = new Map<string, IEmployerCodingSubmission>();
    const attemptCountByQuestion = new Map<string, number>();
    for (const submission of submissions) {
      const key = submission.codingQuestionId.toString();
      attemptCountByQuestion.set(key, (attemptCountByQuestion.get(key) ?? 0) + 1);
      const current = latestSubmissionByQuestion.get(key);
      if (!current || submission.attemptNumber > current.attemptNumber) {
        latestSubmissionByQuestion.set(key, submission);
      }
    }

    const latestSubmissionIds = Array.from(latestSubmissionByQuestion.values()).map((s) => s._id);
    const [latestExecutions, latestEvaluations, totalExecutionCount] = await Promise.all([
      EmployerCodingExecution.find({ organizationId: organization._id, submissionId: { $in: latestSubmissionIds } }),
      EmployerCodingEvaluation.find({ organizationId: organization._id, submissionId: { $in: latestSubmissionIds } }),
      EmployerCodingExecution.countDocuments({ organizationId: organization._id, codingSessionId: session._id }),
    ]);
    const executionBySubmission = new Map(latestExecutions.map((e) => [e.submissionId.toString(), e]));
    const evaluationBySubmission = new Map(latestEvaluations.map((e) => [e.submissionId.toString(), e]));

    const reportQuestions = session.questionIds.map((questionId) => {
      const key = questionId.toString();
      const question = questionById.get(key);
      const latestSubmission = latestSubmissionByQuestion.get(key);
      const execution = latestSubmission ? executionBySubmission.get(latestSubmission._id.toString()) : undefined;
      const evaluation = latestSubmission ? evaluationBySubmission.get(latestSubmission._id.toString()) : undefined;

      return {
        codingQuestionId: questionId,
        title: question?.title ?? 'Unknown question',
        difficulty: question?.difficulty ?? 'unknown',
        submittedAttemptCount: attemptCountByQuestion.get(key) ?? 0,
        latestSubmissionId: latestSubmission?._id,
        executionStatus: execution?.status,
        passPercent: execution?.status === 'completed' ? execution.summary?.passPercent : undefined,
        evaluationStatus: evaluation?.status,
        correctnessAssessment: evaluation?.status === 'completed' ? evaluation.correctness?.assessment : undefined,
      };
    });

    const executionSummary = this.computeExecutionSummary(
      session.questionIds.length,
      submissions.length,
      totalExecutionCount,
      reportQuestions,
      latestSubmissionByQuestion.size,
      latestExecutions
    );

    const completedEvaluations = Array.from(evaluationBySubmission.values()).filter((e) => e.status === 'completed');
    const codeQuality = this.aggregateQualityLevels(completedEvaluations, 'codeQuality', QUALITY_DIMENSIONS);
    const reasoning = this.aggregateQualityLevels(completedEvaluations, 'reasoning', REASONING_DIMENSIONS);
    const competencyEvidence = this.aggregateCompetencyEvidence(completedEvaluations);
    const summary = this.buildSummary(reportQuestions, codeQuality, reasoning, latestExecutions);

    if (!interview.employerApplicationId || !interview.employerJobId) {
      throw new ApiError(409, 'This interview is not linked to a hiring application/job.');
    }

    const generatedAt = new Date();
    const doc = await EmployerCodingAssessmentReport.findOneAndUpdate(
      { organizationId: organization._id, interviewId: interview._id },
      {
        $set: {
          applicationId: interview.employerApplicationId,
          jobId: interview.employerJobId,
          codingSessionId: session._id,
          reportVersion: REPORT_VERSION,
          generatedAt,
          execution: executionSummary,
          questions: reportQuestions,
          codeQuality,
          reasoning,
          competencyEvidence,
          summary,
        },
      },
      { upsert: true, new: true }
    );

    // Best-effort (31C) — a workflow-automation failure must never affect the primary report result.
    try {
      await employerHiringWorkflowService.evaluateTrigger({
        organizationId: organization._id.toString(),
        applicationId: interview.employerApplicationId.toString(),
        interviewId: interview._id.toString(),
        trigger: 'report_ready',
      });
    } catch (workflowError) {
      console.error('[EmployerCodingAssessmentReportService] Workflow trigger evaluation failed (non-fatal)', workflowError);
    }

    // Best-effort (31D) — emitEvent never throws.
    await employerIntegrationEventService.emitEvent({
      organizationId: organization._id,
      eventType: 'report_ready',
      applicationId: interview.employerApplicationId,
      interviewId: interview._id,
      sourceArtifactType: 'EmployerCodingAssessmentReport',
      sourceArtifactId: doc!._id.toString(),
      data: { reportType: 'coding' },
    });

    return this.toDetail(doc!);
  }

  /** GET .../coding-report — requires REPORTS_VIEW. Read-only; never builds. */
  async getReport(organizationId: string, actingRole: OrganizationMemberRole, interviewId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.REPORTS_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id }).select('_id purpose');
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }

    const doc = await EmployerCodingAssessmentReport.findOne({ organizationId: organization._id, interviewId: interview._id });
    if (!doc) {
      return { built: false };
    }
    return this.toDetail(doc);
  }

  private computeExecutionSummary(
    assignedQuestionCount: number,
    totalSubmissionCount: number,
    totalExecutionCount: number,
    reportQuestions: Array<{ executionStatus?: string; passPercent?: number; evaluationStatus?: string }>,
    attemptedQuestionCount: number,
    latestExecutions: IEmployerCodingExecution[]
  ) {
    const executedQuestions = reportQuestions.filter((q) => q.executionStatus === 'completed');
    const evaluatedQuestionCount = reportQuestions.filter((q) => q.evaluationStatus === 'completed').length;

    // Aggregate test totals from the LATEST completed execution per assigned
    // question only — retries never inflate the pass rate.
    let totalTests = 0;
    let passedTests = 0;
    for (const execution of latestExecutions) {
      if (execution.status === 'completed' && execution.summary) {
        totalTests += execution.summary.totalTests;
        passedTests += execution.summary.passedTests;
      }
    }
    const failedTests = totalTests - passedTests;
    const passPercent = totalTests > 0 ? round2((passedTests / totalTests) * 100) : 0;

    return {
      assignedQuestionCount,
      attemptedQuestionCount,
      executedQuestionCount: executedQuestions.length,
      evaluatedQuestionCount,
      totalSubmissionCount,
      totalExecutionCount,
      totalTests,
      passedTests,
      failedTests,
      passPercent,
    };
  }

  private aggregateQualityLevels(
    completedEvaluations: IEmployerCodingEvaluation[],
    group: 'codeQuality' | 'reasoning',
    dimensions: readonly string[]
  ): Record<string, ICodingReportQualityLevelCounts> {
    const result: Record<string, ICodingReportQualityLevelCounts> = {};
    for (const dim of dimensions) {
      result[dim] = emptyQualityCounts();
    }
    for (const evaluation of completedEvaluations) {
      const source = group === 'codeQuality' ? evaluation.codeQuality : evaluation.reasoning;
      if (!source) continue;
      for (const dim of dimensions) {
        const level = (source as unknown as Record<string, string>)[dim];
        const counts = result[dim] as unknown as Record<string, number>;
        if (level && level in counts) {
          counts[level]++;
        }
      }
    }
    return result;
  }

  private aggregateCompetencyEvidence(completedEvaluations: IEmployerCodingEvaluation[]): ICodingReportCompetencyEvidence[] {
    const byCompetency = new Map<string, { states: ICodingReportCompetencyEvidenceStates; evidence: string[] }>();

    for (const evaluation of completedEvaluations) {
      for (const entry of evaluation.competencyEvidence ?? []) {
        let bucket = byCompetency.get(entry.competencyName);
        if (!bucket) {
          bucket = { states: { strong: 0, sufficient: 0, partial: 0, insufficient: 0, notObserved: 0 }, evidence: [] };
          byCompetency.set(entry.competencyName, bucket);
        }
        if (entry.evidenceState === 'not_observed') {
          bucket.states.notObserved++;
        } else {
          bucket.states[entry.evidenceState]++;
        }
        for (const item of entry.evidence ?? []) {
          if (!bucket.evidence.includes(item)) {
            bucket.evidence.push(item);
          }
        }
      }
    }

    return Array.from(byCompetency.entries()).map(([competencyName, bucket]) => {
      const evaluatedSubmissionCount =
        bucket.states.strong + bucket.states.sufficient + bucket.states.partial + bucket.states.insufficient + bucket.states.notObserved;
      return {
        competencyName,
        evaluatedSubmissionCount,
        states: bucket.states,
        overallEvidenceState: this.computeOverallEvidenceState(bucket.states),
        evidence: bucket.evidence.slice(0, MAX_EVIDENCE_ITEMS),
      };
    });
  }

  /**
   * Simple, transparent, deterministic rule (30E section 9 / 28E style):
   * - no evaluated (non-"not observed") evidence => not_observed
   * - a clear strong plurality (strong alone outweighs everything else
   *   combined) => strong
   * - strong+sufficient together outweigh partial+insufficient => sufficient
   * - insufficient alone outweighs strong+sufficient combined => insufficient
   * - otherwise => partial (mixed evidence)
   */
  private computeOverallEvidenceState(states: ICodingReportCompetencyEvidenceStates): CodingReportEvidenceState {
    const { strong, sufficient, partial, insufficient } = states;
    const observedTotal = strong + sufficient + partial + insufficient;
    if (observedTotal === 0) return 'not_observed';
    if (insufficient > strong + sufficient) return 'insufficient';
    if (strong > sufficient + partial + insufficient) return 'strong';
    if (strong + sufficient > partial + insufficient) return 'sufficient';
    return 'partial';
  }

  /** Deterministic, rule-based narrative only — never AI-generated, never a hire/reject/recommendation/ranking word. */
  private buildSummary(
    reportQuestions: Array<{
      title: string;
      executionStatus?: string;
      passPercent?: number;
      evaluationStatus?: string;
    }>,
    codeQuality: Record<string, ICodingReportQualityLevelCounts>,
    reasoning: Record<string, ICodingReportQualityLevelCounts>,
    latestExecutions: IEmployerCodingExecution[]
  ) {
    const strengths: string[] = [];
    const concerns: string[] = [];
    const evidenceGaps: string[] = [];

    for (const q of reportQuestions) {
      if (q.executionStatus === 'completed' && q.passPercent === 100) {
        strengths.push(`All deterministic tests passed for ${q.title}.`);
      }
      if (q.evaluationStatus !== 'completed') {
        evidenceGaps.push(`No completed evaluation is available for ${q.title}.`);
      }
    }

    const allDimensions: Array<{ label: string; counts: ICodingReportQualityLevelCounts }> = [
      ...QUALITY_DIMENSIONS.map((d) => ({ label: labelizeDimension(d), counts: codeQuality[d] })),
      ...REASONING_DIMENSIONS.map((d) => ({ label: labelizeDimension(d), counts: reasoning[d] })),
    ];
    for (const { label, counts } of allDimensions) {
      const { strong, sufficient, limited, insufficient } = counts;
      if (strong > 0 && strong > sufficient + limited + insufficient) {
        strengths.push(`Strong ${label.toLowerCase()} evidence observed across evaluated submissions.`);
      }
      const weak = Math.max(limited, insufficient);
      if (weak > 0 && limited + insufficient > strong + sufficient) {
        const weakLabel = insufficient >= limited ? 'insufficient' : 'limited';
        concerns.push(`${label} was ${weakLabel} in ${weak} evaluated submission${weak === 1 ? '' : 's'}.`);
      }
    }

    const hiddenFailed = latestExecutions
      .filter((e) => e.status === 'completed' && e.summary)
      .reduce((sum, e) => sum + (e.summary!.hiddenTests - e.summary!.hiddenPassed), 0);
    if (hiddenFailed > 0) {
      concerns.push(`${hiddenFailed} hidden test${hiddenFailed === 1 ? '' : 's'} failed across latest executed attempts.`);
    }

    return {
      strengths: strengths.slice(0, MAX_EVIDENCE_ITEMS),
      concerns: concerns.slice(0, MAX_EVIDENCE_ITEMS),
      evidenceGaps: evidenceGaps.slice(0, MAX_EVIDENCE_ITEMS),
    };
  }

  private async loadInterview(organization: IOrganization, interviewId: string): Promise<IInterview> {
    const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id });
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }
    return interview;
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

  private toDetail(doc: IEmployerCodingAssessmentReport): Record<string, unknown> {
    return {
      built: true,
      reportVersion: doc.reportVersion,
      generatedAt: doc.generatedAt,
      execution: doc.execution,
      questions: doc.questions.map((q) => ({
        codingQuestionId: q.codingQuestionId.toString(),
        title: q.title,
        difficulty: q.difficulty,
        submittedAttemptCount: q.submittedAttemptCount,
        latestSubmissionId: q.latestSubmissionId?.toString(),
        executionStatus: q.executionStatus,
        passPercent: q.passPercent,
        evaluationStatus: q.evaluationStatus,
        correctnessAssessment: q.correctnessAssessment,
      })),
      codeQuality: doc.codeQuality,
      reasoning: doc.reasoning,
      competencyEvidence: doc.competencyEvidence,
      summary: doc.summary,
    };
  }
}

export const employerCodingAssessmentReportService = new EmployerCodingAssessmentReportService();
export default employerCodingAssessmentReportService;
