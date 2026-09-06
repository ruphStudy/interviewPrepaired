import Organization, { IOrganization } from '../models/Organization.model';
import Interview, { IInterview, IQuestion } from '../models/interview.model';
import { InterviewPurpose } from '../constants/interview';
import EmployerInterviewCompetencyRubric from '../models/EmployerInterviewCompetencyRubric.model';
import EmployerInterviewGraph, { IEmployerInterviewGraph } from '../models/EmployerInterviewGraph.model';
import EmployerHiringAssessmentFinalization from '../models/EmployerHiringAssessmentFinalization.model';
import EmployerInterviewFollowUpRoute, {
  IEmployerInterviewFollowUpRoute,
  IEmployerInterviewFollowUpRouteAIUsage,
  EmployerInterviewFollowUpDecision,
  EmployerInterviewFollowUpReasonType,
} from '../models/EmployerInterviewFollowUpRoute.model';
import { getAIService } from '../ai';
import type { AIResponseMetadata } from '../ai';
import { getModelPricing } from '../config/openaiPricing';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const MAX_FOLLOWUP_QUESTION_LENGTH = 500;
const ALLOWED_DECISIONS: EmployerInterviewFollowUpDecision[] = ['follow_up', 'continue'];
const ALLOWED_REASON_TYPES: EmployerInterviewFollowUpReasonType[] = [
  'insufficient_evidence',
  'partial_answer',
  'competency_gap',
  'clarification_needed',
];

function round(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}

/** Live per-competency question-index coverage recomputed directly from CURRENT `interview.questions` — never from the possibly-stale 27A stored graph, so it stays correct even after a dynamic follow-up was appended. Duplicated (not imported) from the 27C service — a small, deliberately separate read-only helper per this codebase's established "reuse the public method OR deliberately duplicate the private helper" convention. */
function buildLiveCompetencyCoverage(interview: IInterview, competencyNames: string[]): Record<string, number[]> {
  const coverage: Record<string, number[]> = {};
  for (const name of competencyNames) coverage[name] = [];
  interview.questions.forEach((q, index) => {
    for (const name of q.competencyNames ?? []) {
      if (coverage[name]) coverage[name].push(index);
    }
  });
  return coverage;
}

/**
 * Decides whether a hiring-assessment SOURCE question needs ONE targeted
 * dynamic follow-up question (27B) — hiring-assessment routing, not
 * coaching. Never recursively follows up a dynamic follow-up; at most one
 * generated follow-up per source question. Read-only over answers/
 * evaluations/rubric/graph; the ONLY mutation this service ever makes to
 * `Interview` is appending ONE new answerable question when a follow-up is
 * validated.
 */
export class EmployerInterviewFollowUpRouteService {
  /** POST .../questions/:questionIndex/follow-up-route — requires INTERVIEWS_MANAGE. No client graph/rubric/evaluation IDs accepted. */
  async generateFollowUpRoute(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    interviewId: string,
    sourceQuestionIndex: number
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const { interview, sourceQuestion, graph } = await this.resolveEligibility(organization, interviewId, sourceQuestionIndex);

    const existing = await EmployerInterviewFollowUpRoute.findOne({
      organizationId: organization._id,
      interviewId: interview._id,
      sourceQuestionIndex,
    });

    if (existing) {
      return this.handleExisting(existing, organization, interview, sourceQuestion, sourceQuestionIndex, graph);
    }

    return this.claimAndGenerate(organization, interview, sourceQuestion, sourceQuestionIndex, graph);
  }

  /** GET .../questions/:questionIndex/follow-up-route — requires ORGANIZATION_VIEW. Read-only; never generates, never exposes raw prompt/provider response. */
  async getFollowUpRoute(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    interviewId: string,
    sourceQuestionIndex: number
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id }).select('_id purpose');
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }

    const doc = await EmployerInterviewFollowUpRoute.findOne({
      organizationId: organization._id,
      interviewId: interview._id,
      sourceQuestionIndex,
    });
    if (!doc) {
      return { generated: false };
    }
    return this.toDetail(doc);
  }

  private async resolveEligibility(
    organization: IOrganization,
    interviewId: string,
    sourceQuestionIndex: number
  ): Promise<{ interview: IInterview; sourceQuestion: IQuestion; graph: IEmployerInterviewGraph }> {
    const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id });
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }

    const finalization = await EmployerHiringAssessmentFinalization.findOne({ organizationId: organization._id, interviewId: interview._id }).select(
      '_id'
    );
    if (finalization) {
      throw new ApiError(409, 'This assessment has already been finalized and can no longer be routed for follow-ups.');
    }

    if (!Number.isInteger(sourceQuestionIndex) || sourceQuestionIndex < 0 || sourceQuestionIndex >= interview.questions.length) {
      throw new ApiError(404, 'Question not found');
    }
    const sourceQuestion = interview.questions[sourceQuestionIndex];
    if (!sourceQuestion.answerText || sourceQuestion.answerText.trim().length === 0) {
      throw new ApiError(409, 'This question has not been answered yet.');
    }
    if (interview.hiringEvaluationStatus !== 'completed' || !sourceQuestion.evaluation) {
      throw new ApiError(409, 'This answer has not been evaluated yet. Evaluate the assessment first.');
    }
    if (sourceQuestion.dynamicFollowUp) {
      throw new ApiError(409, 'A dynamic follow-up question cannot itself be routed for another follow-up.');
    }

    const graph = await EmployerInterviewGraph.findOne({ organizationId: organization._id, interviewId: interview._id });
    if (!graph) {
      throw new ApiError(409, 'Interview graph has not been built yet. Build the interview graph first.');
    }

    return { interview, sourceQuestion, graph };
  }

  private async handleExisting(
    existing: IEmployerInterviewFollowUpRoute,
    organization: IOrganization,
    interview: IInterview,
    sourceQuestion: IQuestion,
    sourceQuestionIndex: number,
    graph: IEmployerInterviewGraph
  ): Promise<Record<string, unknown>> {
    if (existing.status === 'completed') {
      return this.toDetail(existing);
    }
    if (existing.status === 'processing') {
      throw new ApiError(409, 'Follow-up routing is already being prepared — please try again shortly');
    }

    const reclaimed = await EmployerInterviewFollowUpRoute.findOneAndUpdate(
      { _id: existing._id, status: 'failed' },
      { $set: { status: 'processing' }, $unset: { errorMessage: 1 } },
      { new: true }
    );
    if (!reclaimed) {
      const refetched = await EmployerInterviewFollowUpRoute.findById(existing._id);
      if (refetched?.status === 'completed') {
        return this.toDetail(refetched);
      }
      throw new ApiError(409, 'Follow-up routing is already being prepared — please try again shortly');
    }

    return this.generate(reclaimed, organization, interview, sourceQuestion, sourceQuestionIndex, graph);
  }

  private async claimAndGenerate(
    organization: IOrganization,
    interview: IInterview,
    sourceQuestion: IQuestion,
    sourceQuestionIndex: number,
    graph: IEmployerInterviewGraph
  ): Promise<Record<string, unknown>> {
    let claimed: IEmployerInterviewFollowUpRoute;
    try {
      claimed = await EmployerInterviewFollowUpRoute.create({
        organizationId: organization._id,
        applicationId: interview.employerApplicationId,
        interviewId: interview._id,
        graphId: graph._id,
        sourceQuestionIndex,
        sourceCompetencyNames: sourceQuestion.competencyNames ?? [],
        status: 'processing',
      });
    } catch (error: any) {
      if (error?.code !== 11000) {
        throw error;
      }
      const winner = await EmployerInterviewFollowUpRoute.findOne({
        organizationId: organization._id,
        interviewId: interview._id,
        sourceQuestionIndex,
      });
      if (!winner) {
        throw new ApiError(409, 'Follow-up routing is already being prepared — please try again shortly');
      }
      return this.handleExisting(winner, organization, interview, sourceQuestion, sourceQuestionIndex, graph);
    }

    return this.generate(claimed, organization, interview, sourceQuestion, sourceQuestionIndex, graph);
  }

  private async generate(
    claimed: IEmployerInterviewFollowUpRoute,
    organization: IOrganization,
    interview: IInterview,
    sourceQuestion: IQuestion,
    sourceQuestionIndex: number,
    graph: IEmployerInterviewGraph
  ): Promise<Record<string, unknown>> {
    try {
      const rubric = await EmployerInterviewCompetencyRubric.findOne({ _id: interview.employerRubricId, organizationId: organization._id });
      if (!rubric) {
        throw new ApiError(409, 'Interview evaluation rubric is not ready');
      }

      const allowedCompetencyNames = graph.nodes.filter((n) => n.type === 'competency').map((n) => n.competencyName!).filter(Boolean);
      const coverage = buildLiveCompetencyCoverage(interview, allowedCompetencyNames);

      const prompt = this.buildPrompt(sourceQuestion, sourceQuestionIndex, rubric.rubric.competencies, allowedCompetencyNames, coverage);
      const result = await getAIService().generateStructured<unknown>(
        { prompt, temperature: 0.2, maxTokens: 1200 },
        { interviewId: interview._id.toString(), operation: 'hiring-dynamic-followup-routing' }
      );

      const allowedSet = new Set(allowedCompetencyNames);
      const existingQuestionTexts = new Set(interview.questions.map((q) => q.questionText.trim().toLowerCase()));
      const validated = this.validateRouteDecision(result.data, allowedSet, existingQuestionTexts);
      const aiUsage = this.computeUsage(result.metadata);

      if (validated.decision === 'continue') {
        const updated = await EmployerInterviewFollowUpRoute.findOneAndUpdate(
          { _id: claimed._id },
          { $set: { decision: 'continue', aiUsage }, $unset: { errorMessage: 1 } },
          { new: true }
        );
        return this.finalizeCompleted(updated!);
      }

      // Atomic append — safe under concurrency for OTHER source questions
      // routing at the same time; this exact source question is already
      // serialized by the unique-index claim above.
      const updatedInterview = await Interview.findOneAndUpdate(
        { _id: interview._id },
        {
          $push: {
            questions: {
              questionText: validated.followUpQuestion,
              competencyNames: [validated.targetCompetencyName],
              dynamicFollowUp: true,
              followUpSourceQuestionIndex: sourceQuestionIndex,
            },
          },
          $inc: { totalQuestions: 1 },
        },
        { new: true }
      ).select('questions');
      if (!updatedInterview) {
        throw new ApiError(404, 'Interview session not found');
      }
      const generatedQuestionIndex = updatedInterview.questions.length - 1;

      const updated = await EmployerInterviewFollowUpRoute.findOneAndUpdate(
        { _id: claimed._id },
        {
          $set: {
            decision: 'follow_up',
            reasonType: validated.reasonType,
            targetCompetencyName: validated.targetCompetencyName,
            generatedQuestionIndex,
            generatedQuestionText: validated.followUpQuestion,
            aiUsage,
          },
          $unset: { errorMessage: 1 },
        },
        { new: true }
      );
      return this.finalizeCompleted(updated!);
    } catch (error) {
      await EmployerInterviewFollowUpRoute.updateOne(
        { _id: claimed._id },
        { $set: { status: 'failed', errorMessage: this.safeErrorMessage(error) } }
      );
      throw error;
    }
  }

  private async finalizeCompleted(doc: IEmployerInterviewFollowUpRoute): Promise<Record<string, unknown>> {
    const updated = await EmployerInterviewFollowUpRoute.findOneAndUpdate({ _id: doc._id }, { $set: { status: 'completed' } }, { new: true });
    return this.toDetail(updated!);
  }

  /**
   * Strict, non-coaching, JSON-only prompt. Sends ONLY the source question/
   * answer, its completed 21D evaluation, the relevant rubric competency
   * expectations, the graph's exact competency universe, and a LIVE
   * per-competency answered-question-index snapshot. Never sends recruiter
   * notes, decisions, communications, other candidates, final hiring
   * recommendation, or protected traits.
   */
  private buildPrompt(
    sourceQuestion: IQuestion,
    sourceQuestionIndex: number,
    rubricCompetencies: Array<{ competencyName: string; evidenceSignals: string[]; scoringAnchors: unknown }>,
    allowedCompetencyNames: string[],
    coverage: Record<string, number[]>
  ): string {
    const sourceCompetencyNames = new Set(sourceQuestion.competencyNames ?? []);
    const relevantRubric = rubricCompetencies
      .filter((c) => sourceCompetencyNames.has(c.competencyName))
      .map((c) => ({ competencyName: c.competencyName, evidenceSignals: c.evidenceSignals, scoringAnchors: c.scoringAnchors }));

    const evaluation = sourceQuestion.evaluation;
    const existingEvaluation = evaluation
      ? {
          overallScore: evaluation.hiringRubricScore ?? evaluation.overallScore,
          competencyScores: (evaluation.hiringCompetencyScores ?? []).map((cs) => ({
            competencyName: cs.competencyName,
            score: cs.score,
            evidence: cs.evidence,
            missingEvidence: cs.missingEvidence,
          })),
          strengths: evaluation.strengths,
          concerns: evaluation.weaknesses,
          evidenceSummary: evaluation.hiringEvidenceSummary,
        }
      : null;

    return `You are deciding whether a hiring-assessment source question/answer needs ONE targeted follow-up question to collect materially missing evidence. This is production hiring infrastructure, NOT coaching — do not address the candidate with tips, hints, a suggested answer, feedback, or praise. Never use candidate evaluation/judgment language.

STRICT RULES:
- Ask a follow-up ONLY when it can collect materially missing evidence — if the existing answer/evaluation already provides sufficient evidence, decide "continue".
- "targetCompetencyName" MUST be exactly one of the ALLOWED COMPETENCIES listed below — never invent a new competency name.
- If deciding "follow_up", "reasonType" must be exactly one of: insufficient_evidence, partial_answer, competency_gap, clarification_needed.
- "followUpQuestion" must be ONE concise, standalone, professional interview question — no hints, no suggested answer, no feedback, no praise, no evaluation language. Max ~500 characters. Must not repeat/duplicate an existing question in this interview.
- JSON only — no prose, no markdown code fences, no explanation.

SOURCE QUESTION (index ${sourceQuestionIndex}):
${sourceQuestion.questionText}

CANDIDATE ANSWER:
${sourceQuestion.answerText}

EXISTING COMPLETED EVALUATION (for context only — do not re-score it):
${JSON.stringify(existingEvaluation)}

RUBRIC EXPECTATIONS FOR THIS QUESTION'S OWN COMPETENCIES:
${JSON.stringify(relevantRubric)}

ALLOWED COMPETENCIES (the full graph competency universe — pick "targetCompetencyName" from here only):
${JSON.stringify(allowedCompetencyNames)}

CURRENT INTERVIEW COMPETENCY COVERAGE (question indexes already targeting each competency, for context — a competency with few/no indexes may need more evidence):
${JSON.stringify(coverage)}

Return ONLY a single JSON object with EXACTLY this shape:
{
  "decision": "follow_up" | "continue",
  "reasonType": string,
  "targetCompetencyName": string,
  "followUpQuestion": string
}

Omit "reasonType"/"targetCompetencyName"/"followUpQuestion" entirely when "decision" is "continue".

Return JSON only.`;
  }

  /** Strict, defensive normalization of untrusted AI JSON — no partial/fabricated persistence. */
  private validateRouteDecision(
    data: unknown,
    allowedCompetencyNames: Set<string>,
    existingQuestionTexts: Set<string>
  ):
    | { decision: 'continue' }
    | {
        decision: 'follow_up';
        reasonType: EmployerInterviewFollowUpReasonType;
        targetCompetencyName: string;
        followUpQuestion: string;
      } {
    const source = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
    const decision = typeof source?.decision === 'string' ? source.decision : '';
    if (!ALLOWED_DECISIONS.includes(decision as EmployerInterviewFollowUpDecision)) {
      throw new ApiError(502, 'Follow-up routing decision was structurally invalid');
    }
    if (decision === 'continue') {
      return { decision: 'continue' };
    }

    const reasonType = typeof source?.reasonType === 'string' ? source.reasonType : '';
    if (!ALLOWED_REASON_TYPES.includes(reasonType as EmployerInterviewFollowUpReasonType)) {
      throw new ApiError(502, 'Follow-up routing reason type was structurally invalid');
    }

    const targetCompetencyName = typeof source?.targetCompetencyName === 'string' ? source.targetCompetencyName.trim() : '';
    if (!targetCompetencyName || !allowedCompetencyNames.has(targetCompetencyName)) {
      throw new ApiError(502, 'Follow-up routing selected an invalid target competency');
    }

    const followUpQuestion = typeof source?.followUpQuestion === 'string' ? source.followUpQuestion.trim().slice(0, MAX_FOLLOWUP_QUESTION_LENGTH) : '';
    if (!followUpQuestion) {
      throw new ApiError(502, 'Follow-up question was empty');
    }
    if (existingQuestionTexts.has(followUpQuestion.toLowerCase())) {
      throw new ApiError(502, 'Generated follow-up question duplicates an existing question');
    }

    return {
      decision: 'follow_up',
      reasonType: reasonType as EmployerInterviewFollowUpReasonType,
      targetCompetencyName,
      followUpQuestion,
    };
  }

  /** Reuses the SAME shared pricing config/formula every other single-AI-call sprint uses — never a parallel pricing calculator. */
  private computeUsage(metadata: AIResponseMetadata): IEmployerInterviewFollowUpRouteAIUsage {
    const cachedInputTokens = metadata.cachedInputTokens ?? 0;
    const pricing = getModelPricing(metadata.model);
    const nonCachedInputTokens = Math.max(metadata.inputTokens - cachedInputTokens, 0);

    let inputCostUsd = 0;
    let cachedInputCostUsd = 0;
    let outputCostUsd = 0;
    let pricingStatus: 'calculated' | 'unknown' = 'unknown';

    if (pricing) {
      inputCostUsd = round((nonCachedInputTokens / 1_000_000) * pricing.inputPerMillionUsd);
      cachedInputCostUsd = pricing.cachedInputPerMillionUsd ? round((cachedInputTokens / 1_000_000) * pricing.cachedInputPerMillionUsd) : 0;
      outputCostUsd = round((metadata.outputTokens / 1_000_000) * pricing.outputPerMillionUsd);
      pricingStatus = 'calculated';
    }

    const totalCostUsd = pricingStatus === 'calculated' ? round(inputCostUsd + cachedInputCostUsd + outputCostUsd) : 0;

    return {
      provider: metadata.provider,
      model: metadata.model,
      inputTokens: metadata.inputTokens,
      cachedInputTokens,
      outputTokens: metadata.outputTokens,
      totalTokens: metadata.totalTokens,
      inputCostUsd,
      cachedInputCostUsd,
      outputCostUsd,
      totalCostUsd,
      pricingStatus,
    };
  }

  private safeErrorMessage(error: unknown): string {
    if (error instanceof ApiError) return error.message.slice(0, 500);
    return 'Follow-up routing generation failed';
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

  private toDetail(doc: IEmployerInterviewFollowUpRoute): Record<string, unknown> {
    if (doc.status !== 'completed') {
      return { generated: false, status: doc.status, errorMessage: doc.status === 'failed' ? doc.errorMessage : undefined };
    }
    return {
      generated: true,
      decision: doc.decision,
      reasonType: doc.reasonType,
      targetCompetencyName: doc.targetCompetencyName,
      generatedQuestionIndex: doc.generatedQuestionIndex,
      generatedQuestionText: doc.generatedQuestionText,
      generatedAt: doc.updatedAt,
    };
  }
}

export const employerInterviewFollowUpRouteService = new EmployerInterviewFollowUpRouteService();
export default employerInterviewFollowUpRouteService;
