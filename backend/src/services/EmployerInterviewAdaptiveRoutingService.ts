import Organization, { IOrganization } from '../models/Organization.model';
import Interview, { IInterview, IQuestion } from '../models/interview.model';
import { InterviewPurpose } from '../constants/interview';
import EmployerInterviewGraph from '../models/EmployerInterviewGraph.model';
import EmployerInterviewCompetencyCoverage from '../models/EmployerInterviewCompetencyCoverage.model';
import EmployerHiringAssessmentFinalization from '../models/EmployerHiringAssessmentFinalization.model';
import EmployerInterviewAdaptiveRoute, {
  IEmployerInterviewAdaptiveRoute,
  IAdaptiveConsideredQuestion,
  EmployerInterviewAdaptiveDecision,
  EmployerInterviewAdaptiveReasonType,
} from '../models/EmployerInterviewAdaptiveRoute.model';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const ROUTE_VERSION = 'adaptive-route-v1';
const DIFFICULTY_ORDER = ['easy', 'medium', 'hard'];
const FOLLOW_UP_PRIORITY_BONUS = 100;
const NOT_STARTED_COMPETENCY_BONUS = 50;
const PARTIAL_COMPETENCY_BONUS = 25;
const DIFFICULTY_TARGET_BONUS = 15;

type CompetencyEvidenceState = 'not_started' | 'partial' | 'covered';

function isAnswered(q: IQuestion): boolean {
  return Boolean(q.answerText && q.answerText.trim().length > 0);
}

function stepDifficulty(current: string, delta: number): string | undefined {
  const idx = DIFFICULTY_ORDER.indexOf(current);
  if (idx === -1) return undefined;
  const target = idx + delta;
  if (target < 0 || target >= DIFFICULTY_ORDER.length) return undefined;
  return DIFFICULTY_ORDER[target];
}

interface DecisionResult {
  decision: EmployerInterviewAdaptiveDecision;
  reasonType?: EmployerInterviewAdaptiveReasonType;
  selectedQuestionIndex?: number;
  selectedCompetencyNames: string[];
  selectedDifficulty?: string;
  consideredQuestions: IAdaptiveConsideredQuestion[];
}

/**
 * Deterministic (NO AI) selection of the next EXISTING unanswered hiring
 * question (27D) — chooses among already-materialized questions and valid
 * 27B dynamic follow-ups using the current 27A graph, 27C competency
 * coverage (if built), and observed 21D evaluation scores. NEVER generates
 * a new question (27B owns generation), never creates a candidate score,
 * never infers ability/personality. Append-only routing history — a
 * genuinely new interview state always gets its own new route row.
 */
export class EmployerInterviewAdaptiveRoutingService {
  /** POST .../adaptive-route — requires INTERVIEWS_MANAGE. No candidate artifact IDs; body may only carry an optional `sourceQuestionIndex`. */
  async selectNextQuestion(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    interviewId: string,
    sourceQuestionIndex?: number
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const interview = await this.loadInterview(organization, interviewId);

    if (sourceQuestionIndex !== undefined) {
      if (!Number.isInteger(sourceQuestionIndex) || sourceQuestionIndex < 0 || sourceQuestionIndex >= interview.questions.length) {
        throw new ApiError(404, 'Source question not found');
      }
    }

    const graph = await EmployerInterviewGraph.findOne({ organizationId: organization._id, interviewId: interview._id });
    if (!graph) {
      throw new ApiError(409, 'Interview graph has not been built yet. Build the interview graph first.');
    }

    const coverage = await EmployerInterviewCompetencyCoverage.findOne({ organizationId: organization._id, interviewId: interview._id }).select(
      'competencies'
    );

    const stepKey = this.computeStepKey(interview, sourceQuestionIndex);
    const existing = await EmployerInterviewAdaptiveRoute.findOne({ organizationId: organization._id, interviewId: interview._id, stepKey });
    if (existing) {
      return this.toDetail(existing);
    }

    const result = this.computeDecision(interview, coverage?.competencies ?? [], sourceQuestionIndex);

    try {
      const doc = await EmployerInterviewAdaptiveRoute.create({
        organizationId: organization._id,
        applicationId: interview.employerApplicationId,
        interviewId: interview._id,
        graphId: graph._id,
        routeVersion: ROUTE_VERSION,
        generatedAt: new Date(),
        stepKey,
        sourceQuestionIndex,
        selectedQuestionIndex: result.selectedQuestionIndex,
        selectedCompetencyNames: result.selectedCompetencyNames,
        selectedDifficulty: result.selectedDifficulty,
        decision: result.decision,
        reasonType: result.reasonType,
        consideredQuestions: result.consideredQuestions,
      });
      return this.toDetail(doc);
    } catch (error: any) {
      if (error?.code !== 11000) {
        throw error;
      }
      const winner = await EmployerInterviewAdaptiveRoute.findOne({ organizationId: organization._id, interviewId: interview._id, stepKey });
      if (!winner) {
        throw new ApiError(409, 'Adaptive routing is already being prepared — please try again shortly');
      }
      return this.toDetail(winner);
    }
  }

  /** GET .../adaptive-routes — requires ORGANIZATION_VIEW. Read-only chronological history; never selects. */
  async getRouteHistory(organizationId: string, actingRole: OrganizationMemberRole, interviewId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id }).select('_id purpose');
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }

    const routes = await EmployerInterviewAdaptiveRoute.find({ organizationId: organization._id, interviewId: interview._id })
      .sort({ createdAt: 1 })
      .lean();

    return { routes: routes.map((r) => this.toDetail(r as unknown as IEmployerInterviewAdaptiveRoute)) };
  }

  private async loadInterview(organization: IOrganization, interviewId: string): Promise<IInterview> {
    const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id });
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }
    const finalization = await EmployerHiringAssessmentFinalization.findOne({ organizationId: organization._id, interviewId: interview._id }).select(
      '_id'
    );
    if (finalization) {
      throw new ApiError(409, 'This assessment has already been finalized and can no longer be routed.');
    }
    return interview;
  }

  /** Deterministic snapshot of interview progress + the requested source — a duplicate request at the exact same state is idempotent; real progress always produces a new step. */
  private computeStepKey(interview: IInterview, sourceQuestionIndex?: number): string {
    const totalCount = interview.questions.length;
    const answeredCount = interview.questions.filter((q) => isAnswered(q)).length;
    const evaluatedCount = interview.questions.filter((q) => q.evaluation).length;
    return `${totalCount}:${answeredCount}:${evaluatedCount}:${sourceQuestionIndex ?? 'none'}`;
  }

  /** Live per-competency evidence state — prefers the existing 27C coverage artifact when built, otherwise derives the SAME "≥1 evaluated ⇒ covered" rule directly from current `interview.questions` (never rebuilds/mutates 27C). */
  private resolveCompetencyState(
    name: string,
    interview: IInterview,
    coverageEntries: Array<{ competencyName: string; evidenceState: CompetencyEvidenceState }>
  ): CompetencyEvidenceState {
    const fromCoverage = coverageEntries.find((c) => c.competencyName === name);
    if (fromCoverage) return fromCoverage.evidenceState;

    let answered = false;
    let evaluated = false;
    for (const q of interview.questions) {
      if (!(q.competencyNames ?? []).includes(name)) continue;
      if (isAnswered(q)) answered = true;
      if (q.evaluation) evaluated = true;
    }
    if (evaluated) return 'covered';
    if (answered) return 'partial';
    return 'not_started';
  }

  /**
   * Pure deterministic derivation — NO AI, NO ML. Priority is a simple,
   * transparent sum of understandable bonuses (immediate follow-up >
   * under-covered competency > difficulty target), with reasons returned
   * for every consideration. Ties broken by lower original questionIndex.
   */
  private computeDecision(
    interview: IInterview,
    coverageEntries: Array<{ competencyName: string; evidenceState: CompetencyEvidenceState }>,
    sourceQuestionIndex?: number
  ): DecisionResult {
    if (sourceQuestionIndex !== undefined) {
      const sourceQuestion = interview.questions[sourceQuestionIndex];
      const sourceAnswered = isAnswered(sourceQuestion);
      const sourceEvaluated = Boolean(sourceQuestion.evaluation);
      const immediateFollowUpExists = interview.questions.some(
        (q) => q.dynamicFollowUp && q.followUpSourceQuestionIndex === sourceQuestionIndex && !isAnswered(q)
      );
      if (sourceAnswered && !sourceEvaluated && !immediateFollowUpExists) {
        return {
          decision: 'wait_for_evaluation',
          selectedCompetencyNames: [],
          consideredQuestions: this.buildConsideredList(interview, null),
        };
      }
    }

    const eligibleIndexes = interview.questions
      .map((q, index) => ({ q, index }))
      .filter(({ q }) => !isAnswered(q))
      .map(({ index }) => index);

    if (eligibleIndexes.length === 0) {
      return {
        decision: 'complete',
        selectedCompetencyNames: [],
        consideredQuestions: this.buildConsideredList(interview, null),
      };
    }

    // Difficulty adaptation target — only when the source question carries a REAL existing 1-5 hiring rubric score.
    let difficultyTarget: string | undefined;
    let difficultyDirection: 'harder' | 'easier' | undefined;
    if (sourceQuestionIndex !== undefined) {
      const sourceQuestion = interview.questions[sourceQuestionIndex];
      const score = sourceQuestion.evaluation?.hiringRubricScore ?? sourceQuestion.evaluation?.overallScore;
      const sourceDifficulty = sourceQuestion.difficulty;
      if (typeof score === 'number' && sourceDifficulty) {
        if (score >= 4) {
          difficultyTarget = stepDifficulty(sourceDifficulty, 1);
          difficultyDirection = 'harder';
        } else if (score >= 2.5) {
          difficultyTarget = sourceDifficulty;
        } else {
          difficultyTarget = stepDifficulty(sourceDifficulty, -1);
          difficultyDirection = 'easier';
        }
      }
    }

    interface Scored {
      index: number;
      priority: number;
      reasons: string[];
      reasonType: EmployerInterviewAdaptiveReasonType;
    }

    const scored: Scored[] = eligibleIndexes.map((index) => {
      const q = interview.questions[index];
      const competencyNames = q.competencyNames ?? [];
      let priority = 0;
      const reasons: string[] = [];
      let reasonType: EmployerInterviewAdaptiveReasonType = 'remaining_question';

      const isImmediateFollowUp = sourceQuestionIndex !== undefined && q.dynamicFollowUp && q.followUpSourceQuestionIndex === sourceQuestionIndex;
      if (isImmediateFollowUp) {
        priority += FOLLOW_UP_PRIORITY_BONUS;
        reasons.push('Immediate follow-up generated from the previous source question');
        reasonType = 'follow_up_priority';
      }

      let coveredNotStarted = false;
      let coveredPartial = false;
      for (const name of competencyNames) {
        const state = this.resolveCompetencyState(name, interview, coverageEntries);
        if (state === 'not_started') {
          priority += NOT_STARTED_COMPETENCY_BONUS;
          reasons.push(`Covers not-yet-started competency: ${name}`);
          coveredNotStarted = true;
        } else if (state === 'partial') {
          priority += PARTIAL_COMPETENCY_BONUS;
          reasons.push(`Covers partially-covered competency: ${name}`);
          coveredPartial = true;
        }
      }
      if (!isImmediateFollowUp) {
        if (coveredNotStarted) reasonType = 'uncovered_competency';
        else if (coveredPartial) reasonType = 'partial_coverage';
      }

      if (difficultyTarget && q.difficulty === difficultyTarget) {
        priority += DIFFICULTY_TARGET_BONUS;
        reasons.push(`Matches ${difficultyDirection ?? 'same'} difficulty target (${difficultyTarget})`);
        if (!isImmediateFollowUp && !coveredNotStarted && !coveredPartial) {
          reasonType = difficultyDirection === 'harder' ? 'difficulty_progression' : difficultyDirection === 'easier' ? 'difficulty_recovery' : reasonType;
        }
      }

      if (reasons.length === 0) {
        reasons.push('Next remaining unanswered question');
      }

      return { index, priority, reasons, reasonType };
    });

    scored.sort((a, b) => b.priority - a.priority || a.index - b.index);
    const winner = scored[0];
    const winningQuestion = interview.questions[winner.index];

    return {
      decision: 'select_question',
      reasonType: winner.reasonType,
      selectedQuestionIndex: winner.index,
      selectedCompetencyNames: winningQuestion.competencyNames ?? [],
      selectedDifficulty: winningQuestion.difficulty,
      consideredQuestions: this.buildConsideredList(interview, scored),
    };
  }

  private buildConsideredList(
    interview: IInterview,
    scored: Array<{ index: number; priority: number; reasons: string[] }> | null
  ): IAdaptiveConsideredQuestion[] {
    const scoredByIndex = new Map((scored ?? []).map((s) => [s.index, s]));
    return interview.questions.map((q, index) => {
      const answered = isAnswered(q);
      const scoredEntry = scoredByIndex.get(index);
      const eligible = !answered;
      const reasons = scoredEntry
        ? scoredEntry.reasons
        : answered
          ? ['Already answered']
          : ['Not selected for this routing step'];
      return {
        questionIndex: index,
        competencyNames: q.competencyNames ?? [],
        difficulty: q.difficulty,
        eligible,
        priority: scoredEntry?.priority ?? 0,
        reasons,
      };
    });
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

  private toDetail(doc: IEmployerInterviewAdaptiveRoute): Record<string, unknown> {
    return {
      id: doc._id.toString(),
      routeVersion: doc.routeVersion,
      generatedAt: doc.generatedAt,
      sourceQuestionIndex: doc.sourceQuestionIndex,
      selectedQuestionIndex: doc.selectedQuestionIndex,
      selectedCompetencyNames: doc.selectedCompetencyNames,
      selectedDifficulty: doc.selectedDifficulty,
      decision: doc.decision,
      reasonType: doc.reasonType,
      consideredQuestions: doc.consideredQuestions,
      createdAt: doc.createdAt,
    };
  }
}

export const employerInterviewAdaptiveRoutingService = new EmployerInterviewAdaptiveRoutingService();
export default employerInterviewAdaptiveRoutingService;
