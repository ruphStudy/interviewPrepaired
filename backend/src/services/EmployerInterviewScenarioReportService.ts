import Organization, { IOrganization } from '../models/Organization.model';
import Interview from '../models/interview.model';
import { InterviewPurpose } from '../constants/interview';
import EmployerInterviewScenario from '../models/EmployerInterviewScenario.model';
import EmployerInterviewScenarioQuestionSet from '../models/EmployerInterviewScenarioQuestionSet.model';
import EmployerInterviewScenarioSession from '../models/EmployerInterviewScenarioSession.model';
import EmployerInterviewScenarioResponseEvaluation, {
  IEmployerInterviewScenarioResponseEvaluation,
} from '../models/EmployerInterviewScenarioResponseEvaluation.model';
import EmployerInterviewScenarioReport, {
  IEmployerInterviewScenarioReport,
  IScenarioReportCompetencyEvidence,
  IScenarioReportEvidenceStateCounts,
  IScenarioReportAssessmentLevelCounts,
  EmployerScenarioEvidenceState,
  EmployerScenarioAssessmentLevel,
} from '../models/EmployerInterviewScenarioReport.model';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const REPORT_VERSION = 'scenario-report-v1';
const MAX_LIST_ITEMS = 10;
const MAX_SUMMARY_ITEMS = 20;

/** Shape needed from a `.lean()`-read completed evaluation — deliberately not the full Mongoose Document type, since `.lean()` returns plain objects. */
type LeanScenarioEvaluation = Pick<
  IEmployerInterviewScenarioResponseEvaluation,
  'competencyEvidence' | 'responseAssessment' | 'followUpUseful' | 'followUpReason'
>;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function dedupeCap(items: string[], maxItems = MAX_LIST_ITEMS): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
    if (result.length >= maxItems) break;
  }
  return result;
}

/** Transparent, deterministic precedence — never a numeric competency score. See Sprint 28E section 5 for the rule this implements. */
function deriveOverallEvidenceState(counts: IScenarioReportEvidenceStateCounts): EmployerScenarioEvidenceState {
  const total = counts.strong + counts.sufficient + counts.partial + counts.insufficient + counts.notObserved;
  if (total === 0) return 'not_observed';

  const values = [counts.strong, counts.sufficient, counts.partial, counts.insufficient, counts.notObserved];
  const maxCount = Math.max(...values);
  const isClearPlurality = (value: number) => value === maxCount && values.filter((v) => v === maxCount).length === 1;

  if (isClearPlurality(counts.strong) && counts.insufficient === 0) return 'strong';
  if (counts.strong + counts.sufficient > total / 2) return 'sufficient';
  if (isClearPlurality(counts.partial)) return 'partial';
  if (isClearPlurality(counts.insufficient)) return 'insufficient';
  if (counts.notObserved === total) return 'not_observed';
  return 'partial'; // mixed/no clear signal
}

/**
 * Deterministic (NO AI) aggregate report over one completed 28D scenario
 * session's completed 28C response evaluations (28E) — evidence
 * aggregation and coverage only. Never a hiring recommendation, candidate
 * ranking, personality assessment, or numeric competency/performance
 * score. Read-only over 28A/28B/28C/28D; never mutates them, never
 * auto-evaluates missing steps.
 */
export class EmployerInterviewScenarioReportService {
  /** POST .../scenarios/:scenarioId/report/build — requires INTERVIEWS_MANAGE. Deterministic upsert-in-place; no client session/questionSet/rubric/application/job IDs accepted. */
  async buildScenarioReport(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    interviewId: string,
    scenarioId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id }).select('_id purpose');
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }
    const scenario = await EmployerInterviewScenario.findOne({ _id: scenarioId, organizationId: organization._id, interviewId: interview._id });
    if (!scenario) {
      throw new ApiError(404, 'Scenario not found');
    }
    const questionSet = await EmployerInterviewScenarioQuestionSet.findOne({
      organizationId: organization._id,
      scenarioId: scenario._id,
      status: 'completed',
    });
    if (!questionSet || !questionSet.questions || questionSet.questions.length === 0) {
      throw new ApiError(409, 'Scenario question plan is not ready.');
    }
    const session = await EmployerInterviewScenarioSession.findOne({
      organizationId: organization._id,
      interviewId: interview._id,
      scenarioId: scenario._id,
    });
    if (!session) {
      throw new ApiError(409, 'Scenario session does not exist yet.');
    }
    if (session.status !== 'completed') {
      throw new ApiError(409, 'Scenario session is not completed yet.');
    }
    if (session.responses.length === 0) {
      throw new ApiError(409, 'No responses have been submitted for this scenario.');
    }

    const evaluations = await EmployerInterviewScenarioResponseEvaluation.find({
      organizationId: organization._id,
      interviewId: interview._id,
      scenarioId: scenario._id,
      status: 'completed',
    }).lean();

    const totalSteps = questionSet.questions.length;
    const answeredSteps = session.responses.length;
    const evaluatedSteps = evaluations.length;
    const durationSeconds =
      session.startedAt && session.completedAt ? Math.max(0, Math.round((session.completedAt.getTime() - session.startedAt.getTime()) / 1000)) : undefined;

    const competencyEvidence = this.buildCompetencyEvidence(scenario.targetCompetencies, evaluations);
    const responseSignals = this.buildResponseSignals(evaluations);
    const followUp = this.buildFollowUp(evaluations);
    const coverage = this.buildCoverage(scenario.targetCompetencies, competencyEvidence);
    const summary = this.buildSummary(competencyEvidence);

    const generatedAt = new Date();
    const doc = await EmployerInterviewScenarioReport.findOneAndUpdate(
      { organizationId: organization._id, interviewId: interview._id, scenarioId: scenario._id },
      {
        $set: {
          applicationId: scenario.applicationId,
          jobId: scenario.jobId,
          sessionId: session._id,
          questionSetId: questionSet._id,
          reportVersion: REPORT_VERSION,
          generatedAt,
          scenarioSnapshot: {
            title: scenario.title,
            category: scenario.category,
            difficulty: scenario.difficulty,
            targetCompetencies: scenario.targetCompetencies,
          },
          execution: { totalSteps, answeredSteps, evaluatedSteps, durationSeconds, completed: session.status === 'completed' },
          competencyEvidence,
          responseSignals,
          followUp,
          coverage,
          summary,
        },
      },
      { upsert: true, new: true }
    );

    return this.toDetail(doc!);
  }

  /** GET .../scenarios/:scenarioId/report — requires REPORTS_VIEW. Read-only; never builds. */
  async getScenarioReport(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    interviewId: string,
    scenarioId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.REPORTS_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id }).select('_id purpose');
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }
    const scenario = await EmployerInterviewScenario.findOne({ _id: scenarioId, organizationId: organization._id, interviewId: interview._id }).select(
      '_id'
    );
    if (!scenario) {
      throw new ApiError(404, 'Scenario not found');
    }

    const doc = await EmployerInterviewScenarioReport.findOne({
      organizationId: organization._id,
      interviewId: interview._id,
      scenarioId: scenario._id,
    });
    if (!doc) {
      return { built: false };
    }
    return this.toDetail(doc);
  }

  private buildCompetencyEvidence(
    targetCompetencies: string[],
    evaluations: LeanScenarioEvaluation[]
  ): IScenarioReportCompetencyEvidence[] {
    return targetCompetencies.map((name) => {
      const states: IScenarioReportEvidenceStateCounts = { strong: 0, sufficient: 0, partial: 0, insufficient: 0, notObserved: 0 };
      const evidence: string[] = [];
      const missingEvidence: string[] = [];
      let evaluatedStepCount = 0;

      for (const evaluation of evaluations) {
        const entry = (evaluation.competencyEvidence ?? []).find((e) => e.competencyName === name);
        if (!entry) continue;
        evaluatedStepCount += 1;
        switch (entry.evidenceState) {
          case 'strong':
            states.strong += 1;
            break;
          case 'sufficient':
            states.sufficient += 1;
            break;
          case 'partial':
            states.partial += 1;
            break;
          case 'insufficient':
            states.insufficient += 1;
            break;
          case 'not_observed':
          default:
            states.notObserved += 1;
            break;
        }
        evidence.push(...entry.evidence);
        missingEvidence.push(...entry.missingEvidence);
      }

      return {
        competencyName: name,
        evaluatedStepCount,
        states,
        overallEvidenceState: deriveOverallEvidenceState(states),
        evidence: dedupeCap(evidence),
        missingEvidence: dedupeCap(missingEvidence),
      };
    });
  }

  private buildResponseSignals(evaluations: LeanScenarioEvaluation[]) {
    const empty = (): IScenarioReportAssessmentLevelCounts => ({ strong: 0, sufficient: 0, limited: 0, insufficient: 0 });
    const signals = {
      relevance: empty(),
      reasoningQuality: empty(),
      decisionClarity: empty(),
      constraintAwareness: empty(),
    };

    const bump = (counts: IScenarioReportAssessmentLevelCounts, level: EmployerScenarioAssessmentLevel | undefined) => {
      if (!level) return;
      counts[level] += 1;
    };

    for (const evaluation of evaluations) {
      const assessment = evaluation.responseAssessment;
      if (!assessment) continue;
      bump(signals.relevance, assessment.relevance);
      bump(signals.reasoningQuality, assessment.reasoningQuality);
      bump(signals.decisionClarity, assessment.decisionClarity);
      bump(signals.constraintAwareness, assessment.constraintAwareness);
    }

    return signals;
  }

  private buildFollowUp(evaluations: LeanScenarioEvaluation[]) {
    const usefulCount = evaluations.filter((e) => e.followUpUseful === true).length;
    const notUsefulCount = evaluations.filter((e) => e.followUpUseful === false).length;
    const reasons = dedupeCap(
      evaluations.map((e) => e.followUpReason).filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
    );
    return { usefulCount, notUsefulCount, reasons };
  }

  private buildCoverage(targetCompetencies: string[], competencyEvidence: IScenarioReportCompetencyEvidence[]) {
    const targetCompetencyCount = targetCompetencies.length;
    const observedCompetencyCount = competencyEvidence.filter((c) => c.overallEvidenceState !== 'not_observed').length;
    const missingCompetencyCount = targetCompetencyCount - observedCompetencyCount;
    return {
      targetCompetencyCount,
      observedCompetencyCount,
      missingCompetencyCount,
      coveragePercent: targetCompetencyCount > 0 ? round2((observedCompetencyCount / targetCompetencyCount) * 100) : 0,
    };
  }

  private buildSummary(competencyEvidence: IScenarioReportCompetencyEvidence[]) {
    const strengths: string[] = [];
    const evidenceGaps: string[] = [];
    for (const c of competencyEvidence) {
      if (c.overallEvidenceState === 'strong') {
        strengths.push(`Strong evidence observed for ${c.competencyName}.`);
      } else if (c.overallEvidenceState === 'sufficient') {
        strengths.push(`Sufficient evidence observed for ${c.competencyName}.`);
      } else if (c.overallEvidenceState === 'partial' || c.overallEvidenceState === 'insufficient') {
        evidenceGaps.push(`Limited evidence observed for ${c.competencyName}.`);
      } else {
        evidenceGaps.push(`No evidence observed for ${c.competencyName}.`);
      }
    }
    return { strengths: strengths.slice(0, MAX_SUMMARY_ITEMS), evidenceGaps: evidenceGaps.slice(0, MAX_SUMMARY_ITEMS) };
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

  private toDetail(doc: IEmployerInterviewScenarioReport): Record<string, unknown> {
    return {
      built: true,
      reportVersion: doc.reportVersion,
      generatedAt: doc.generatedAt,
      scenarioSnapshot: doc.scenarioSnapshot,
      execution: doc.execution,
      competencyEvidence: doc.competencyEvidence,
      responseSignals: doc.responseSignals,
      followUp: doc.followUp,
      coverage: doc.coverage,
      summary: doc.summary,
    };
  }
}

export const employerInterviewScenarioReportService = new EmployerInterviewScenarioReportService();
export default employerInterviewScenarioReportService;
