import Organization, { IOrganization } from '../models/Organization.model';
import Interview from '../models/interview.model';
import { InterviewPurpose } from '../constants/interview';
import EmployerInterviewCompetencyRubric from '../models/EmployerInterviewCompetencyRubric.model';
import EmployerInterviewScenario, { IEmployerInterviewScenario } from '../models/EmployerInterviewScenario.model';
import EmployerInterviewScenarioQuestionSet, { IScenarioQuestion } from '../models/EmployerInterviewScenarioQuestionSet.model';
import { Types } from 'mongoose';
import EmployerInterviewScenarioSession from '../models/EmployerInterviewScenarioSession.model';
import EmployerInterviewScenarioResponseEvaluation, {
  IEmployerInterviewScenarioResponseEvaluation,
  IScenarioCompetencyEvidence,
  IScenarioResponseAssessment,
  IEmployerScenarioResponseEvaluationAIUsage,
  EmployerScenarioEvidenceState,
  EmployerScenarioAssessmentLevel,
} from '../models/EmployerInterviewScenarioResponseEvaluation.model';
import { getAIService } from '../ai';
import type { AIResponseMetadata } from '../ai';
import { getModelPricing } from '../config/openaiPricing';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const EVALUATION_VERSION = 'scenario-response-evaluation-v1';
const ALLOWED_EVIDENCE_STATES: EmployerScenarioEvidenceState[] = ['strong', 'sufficient', 'partial', 'insufficient', 'not_observed'];
const ALLOWED_ASSESSMENT_LEVELS: EmployerScenarioAssessmentLevel[] = ['strong', 'sufficient', 'limited', 'insufficient'];
const MAX_EVIDENCE_ITEMS = 6;
const MAX_STRING_LENGTH = 300;
const MAX_EVIDENCE_SUMMARY_LENGTH = 1000;
const MAX_FOLLOWUP_REASON_LENGTH = 300;

function round(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}

/**
 * Evaluates ONE candidate response to ONE 28B scenario question against
 * the scenario's own evidence expectations + relevant 20B rubric (28C) —
 * hiring assessment evidence collection only. NEVER coaching, never a
 * candidate-facing score, never a hiring recommendation, never infers
 * personality/honesty/deception. Absence of evidence is never proof of
 * anything false. Read-only over the scenario/question-set/session.
 */
export class EmployerInterviewScenarioResponseEvaluationService {
  /** POST .../responses/:questionSequence/evaluate — requires INTERVIEWS_MANAGE. No client rubric/questionSet/application IDs. */
  async generateEvaluation(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    interviewId: string,
    scenarioId: string,
    questionSequence: number
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const { scenario, question, questionSetId } = await this.resolveEligibility(organization, interviewId, scenarioId, questionSequence);

    const existing = await EmployerInterviewScenarioResponseEvaluation.findOne({
      organizationId: organization._id,
      interviewId: scenario.interviewId,
      scenarioId: scenario._id,
      questionSequence,
    });
    if (existing) {
      return this.handleExisting(existing, organization, scenario, question, questionSequence);
    }

    return this.claimAndGenerate(organization, scenario, question, questionSequence, questionSetId);
  }

  /** GET .../responses/:questionSequence/evaluate — requires ORGANIZATION_VIEW. Read-only; never generates, never exposes raw prompt/provider response. */
  async getEvaluation(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    interviewId: string,
    scenarioId: string,
    questionSequence: number
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
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

    const doc = await EmployerInterviewScenarioResponseEvaluation.findOne({
      organizationId: organization._id,
      interviewId: interview._id,
      scenarioId: scenario._id,
      questionSequence,
    });
    if (!doc) {
      return { evaluated: false };
    }
    return this.toDetail(doc);
  }

  private async resolveEligibility(
    organization: IOrganization,
    interviewId: string,
    scenarioId: string,
    questionSequence: number
  ): Promise<{ scenario: IEmployerInterviewScenario; question: IScenarioQuestion; questionSetId: Types.ObjectId }> {
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
    if (!questionSet || !questionSet.questions) {
      throw new ApiError(409, 'Scenario question plan is not ready.');
    }
    const question = questionSet.questions.find((q) => q.sequence === questionSequence);
    if (!question) {
      throw new ApiError(404, 'Scenario question not found');
    }

    const session = await EmployerInterviewScenarioSession.findOne({
      organizationId: organization._id,
      interviewId: interview._id,
      scenarioId: scenario._id,
    });
    const response = session?.responses.find((r) => r.questionSequence === questionSequence);
    if (!response || !response.answerText || response.answerText.trim().length === 0) {
      throw new ApiError(409, 'No response has been submitted for this scenario step yet.');
    }

    return { scenario, question, questionSetId: questionSet._id as Types.ObjectId };
  }

  private async handleExisting(
    existing: IEmployerInterviewScenarioResponseEvaluation,
    organization: IOrganization,
    scenario: IEmployerInterviewScenario,
    question: IScenarioQuestion,
    questionSequence: number
  ): Promise<Record<string, unknown>> {
    if (existing.status === 'completed') {
      return this.toDetail(existing);
    }
    if (existing.status === 'processing') {
      throw new ApiError(409, 'Response evaluation is already being prepared — please try again shortly');
    }

    const reclaimed = await EmployerInterviewScenarioResponseEvaluation.findOneAndUpdate(
      { _id: existing._id, status: 'failed' },
      { $set: { status: 'processing' }, $unset: { errorMessage: 1 } },
      { new: true }
    );
    if (!reclaimed) {
      const refetched = await EmployerInterviewScenarioResponseEvaluation.findById(existing._id);
      if (refetched?.status === 'completed') {
        return this.toDetail(refetched);
      }
      throw new ApiError(409, 'Response evaluation is already being prepared — please try again shortly');
    }

    return this.generate(reclaimed, organization, scenario, question, questionSequence);
  }

  private async claimAndGenerate(
    organization: IOrganization,
    scenario: IEmployerInterviewScenario,
    question: IScenarioQuestion,
    questionSequence: number,
    questionSetId: Types.ObjectId
  ): Promise<Record<string, unknown>> {
    let claimed: IEmployerInterviewScenarioResponseEvaluation;
    try {
      claimed = await EmployerInterviewScenarioResponseEvaluation.create({
        organizationId: organization._id,
        applicationId: scenario.applicationId,
        interviewId: scenario.interviewId,
        scenarioId: scenario._id,
        questionSetId,
        questionSequence,
        status: 'processing',
        evaluationVersion: EVALUATION_VERSION,
        targetedCompetencies: question.targetCompetencies,
      });
    } catch (error: any) {
      if (error?.code !== 11000) {
        throw error;
      }
      const winner = await EmployerInterviewScenarioResponseEvaluation.findOne({
        organizationId: organization._id,
        interviewId: scenario.interviewId,
        scenarioId: scenario._id,
        questionSequence,
      });
      if (!winner) {
        throw new ApiError(409, 'Response evaluation is already being prepared — please try again shortly');
      }
      return this.handleExisting(winner, organization, scenario, question, questionSequence);
    }

    return this.generate(claimed, organization, scenario, question, questionSequence);
  }

  private async generate(
    claimed: IEmployerInterviewScenarioResponseEvaluation,
    organization: IOrganization,
    scenario: IEmployerInterviewScenario,
    question: IScenarioQuestion,
    questionSequence: number
  ): Promise<Record<string, unknown>> {
    try {
      const rubric = await EmployerInterviewCompetencyRubric.findOne({ _id: scenario.rubricId, organizationId: organization._id });
      if (!rubric) {
        throw new ApiError(409, 'Interview evaluation rubric is not ready');
      }
      const session = await EmployerInterviewScenarioSession.findOne({
        organizationId: organization._id,
        interviewId: scenario.interviewId,
        scenarioId: scenario._id,
      });
      const response = session?.responses.find((r) => r.questionSequence === questionSequence);
      if (!response || !response.answerText.trim()) {
        throw new ApiError(409, 'No response has been submitted for this scenario step yet.');
      }

      const allowedCompetencyNames = new Set(question.targetCompetencies);
      const relevantRubric = rubric.rubric.competencies
        .filter((c) => allowedCompetencyNames.has(c.competencyName))
        .map((c) => ({ competencyName: c.competencyName, evidenceSignals: c.evidenceSignals, scoringAnchors: c.scoringAnchors }));

      const prompt = this.buildPrompt(scenario, question, response.answerText, relevantRubric);
      const result = await getAIService().generateStructured<unknown>(
        { prompt, temperature: 0.2, maxTokens: 1500 },
        { organizationId: organization._id.toString(), operation: 'hiring-scenario-response-evaluation' }
      );

      const validated = this.validateResult(result.data, question.targetCompetencies);
      const aiUsage = this.computeUsage(result.metadata);

      const updated = await EmployerInterviewScenarioResponseEvaluation.findOneAndUpdate(
        { _id: claimed._id },
        { $set: { status: 'completed', ...validated, aiUsage, evaluatedAt: new Date() }, $unset: { errorMessage: 1 } },
        { new: true }
      );
      return this.toDetail(updated!);
    } catch (error) {
      await EmployerInterviewScenarioResponseEvaluation.updateOne(
        { _id: claimed._id },
        { $set: { status: 'failed', errorMessage: this.safeErrorMessage(error) } }
      );
      throw error;
    }
  }

  /**
   * Strict, non-coaching, JSON-only prompt. Sends ONLY the scenario's own
   * job-relevant definition, the exact 28B question (+ its scenarioUpdate),
   * the candidate's response to THIS step, and relevant rubric
   * expectations. Never sends resume, screening, notes, decisions,
   * communications, other candidate answers, or protected traits.
   */
  private buildPrompt(
    scenario: IEmployerInterviewScenario,
    question: IScenarioQuestion,
    answerText: string,
    relevantRubric: Array<{ competencyName: string; evidenceSignals: string[]; scoringAnchors: unknown }>
  ): string {
    return `You are performing an evidence-based hiring evaluation of a candidate's response to ONE step of a structured workplace scenario. This is production hiring infrastructure, NOT coaching — do not address the candidate, do not give tips.

STRICT RULES:
- Evaluate ONLY the observable content of the response below. Do not infer personality, honesty, deception, or protected traits.
- Absence of evidence is NOT proof that something is false — use "not_observed" honestly rather than inventing evidence.
- Do not compare this candidate with any other candidate. Do not produce a hiring recommendation.
- "competencyEvidence" must have EXACTLY one entry for each of these target competencies, no more, no fewer: ${JSON.stringify(question.targetCompetencies)}. Each entry needs "evidenceState" (one of: strong, sufficient, partial, insufficient, not_observed), "evidence" (grounded in the response), and "missingEvidence".
- "responseAssessment" has exactly 4 fields, each one of: strong, sufficient, limited, insufficient — "relevance" (did the response address this question), "reasoningQuality", "decisionClarity", "constraintAwareness" (whether stated scenario constraints were respected).
- "evidenceSummary": concise, evidence-only summary (max ~1000 characters).
- "followUpUseful": true only if a follow-up question would materially help collect missing evidence; "followUpReason" is a short optional reason.
- JSON only — no prose, no markdown code fences, no explanation.

SCENARIO:
Title: ${scenario.title}
Situation: ${scenario.context.situation}
Candidate role: ${scenario.context.candidateRole}
Constraints: ${JSON.stringify(scenario.context.constraints)}
Objectives: ${JSON.stringify(scenario.objectives)}
Success evidence guidance: ${JSON.stringify(scenario.successEvidence)}
Failure signal guidance: ${JSON.stringify(scenario.failureSignals)}

QUESTION (step ${question.sequence}, type ${question.type}):
${question.questionText}
${question.scenarioUpdate ? `Scenario update introduced before this step: ${question.scenarioUpdate}` : ''}
Evidence expected for this question: ${JSON.stringify(question.evidenceExpected)}

CANDIDATE RESPONSE:
${answerText}

RELEVANT RUBRIC EXPECTATIONS:
${JSON.stringify(relevantRubric)}

Return ONLY a single JSON object with EXACTLY this shape:
{
  "competencyEvidence": [
    { "competencyName": string, "evidenceState": string, "evidence": string[], "missingEvidence": string[] }
  ],
  "responseAssessment": {
    "relevance": string,
    "reasoningQuality": string,
    "decisionClarity": string,
    "constraintAwareness": string
  },
  "evidenceSummary": string,
  "followUpUseful": boolean,
  "followUpReason": string
}

Return JSON only.`;
  }

  /**
   * Strict, defensive normalization of untrusted AI JSON. Every targeted
   * competency gets EXACTLY one entry — a missing one is filled as
   * `not_observed` with empty evidence (never invented), an unknown one is
   * dropped. Summary/counts are never trusted from AI (this model has no
   * summary field at all — every field is either validated enum/string or
   * omitted).
   */
  private validateResult(
    data: unknown,
    targetCompetencies: string[]
  ): {
    competencyEvidence: IScenarioCompetencyEvidence[];
    responseAssessment: IScenarioResponseAssessment;
    evidenceSummary: string;
    followUpUseful: boolean;
    followUpReason?: string;
  } {
    const source = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
    if (!source) {
      throw new ApiError(502, 'Scenario response evaluation was structurally invalid');
    }

    const asObject = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' ? (value as Record<string, unknown>) : {});
    const asStringArray = (value: unknown, maxItems: number, maxLength = MAX_STRING_LENGTH): string[] => {
      if (!Array.isArray(value)) return [];
      const seen = new Set<string>();
      const result: string[] = [];
      for (const item of value) {
        if (typeof item !== 'string') continue;
        const trimmed = item.trim().slice(0, maxLength);
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(trimmed);
        if (result.length >= maxItems) break;
      }
      return result;
    };

    const rawEvidence = Array.isArray(source.competencyEvidence) ? (source.competencyEvidence as unknown[]) : [];
    const byCompetency = new Map<string, IScenarioCompetencyEvidence>();
    for (const raw of rawEvidence) {
      const item = asObject(raw);
      const competencyName = typeof item.competencyName === 'string' ? item.competencyName.trim() : '';
      if (!competencyName || !targetCompetencies.includes(competencyName) || byCompetency.has(competencyName)) continue;
      const evidenceState = ALLOWED_EVIDENCE_STATES.includes(item.evidenceState as EmployerScenarioEvidenceState)
        ? (item.evidenceState as EmployerScenarioEvidenceState)
        : 'not_observed';
      byCompetency.set(competencyName, {
        competencyName,
        evidenceState,
        evidence: asStringArray(item.evidence, MAX_EVIDENCE_ITEMS),
        missingEvidence: asStringArray(item.missingEvidence, MAX_EVIDENCE_ITEMS),
      });
    }
    const competencyEvidence: IScenarioCompetencyEvidence[] = targetCompetencies.map(
      (name) => byCompetency.get(name) ?? { competencyName: name, evidenceState: 'not_observed', evidence: [], missingEvidence: [] }
    );

    const assessmentRaw = asObject(source.responseAssessment);
    const asLevel = (value: unknown): EmployerScenarioAssessmentLevel | null =>
      ALLOWED_ASSESSMENT_LEVELS.includes(value as EmployerScenarioAssessmentLevel) ? (value as EmployerScenarioAssessmentLevel) : null;
    const relevance = asLevel(assessmentRaw.relevance);
    const reasoningQuality = asLevel(assessmentRaw.reasoningQuality);
    const decisionClarity = asLevel(assessmentRaw.decisionClarity);
    const constraintAwareness = asLevel(assessmentRaw.constraintAwareness);
    if (!relevance || !reasoningQuality || !decisionClarity || !constraintAwareness) {
      throw new ApiError(502, 'Scenario response evaluation was structurally invalid');
    }

    const evidenceSummary = typeof source.evidenceSummary === 'string' ? source.evidenceSummary.trim().slice(0, MAX_EVIDENCE_SUMMARY_LENGTH) : '';
    const followUpUseful = typeof source.followUpUseful === 'boolean' ? source.followUpUseful : false;
    const followUpReason =
      typeof source.followUpReason === 'string' ? source.followUpReason.trim().slice(0, MAX_FOLLOWUP_REASON_LENGTH) || undefined : undefined;

    return {
      competencyEvidence,
      responseAssessment: { relevance, reasoningQuality, decisionClarity, constraintAwareness },
      evidenceSummary,
      followUpUseful,
      followUpReason,
    };
  }

  /** Reuses the SAME shared pricing config/formula every other single-AI-call sprint uses — never a parallel pricing calculator. */
  private computeUsage(metadata: AIResponseMetadata): IEmployerScenarioResponseEvaluationAIUsage {
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
    return 'Scenario response evaluation failed';
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

  private toDetail(doc: IEmployerInterviewScenarioResponseEvaluation): Record<string, unknown> {
    if (doc.status !== 'completed') {
      return { evaluated: false, status: doc.status, errorMessage: doc.status === 'failed' ? doc.errorMessage : undefined };
    }
    return {
      evaluated: true,
      evaluationVersion: doc.evaluationVersion,
      targetedCompetencies: doc.targetedCompetencies,
      competencyEvidence: doc.competencyEvidence,
      responseAssessment: doc.responseAssessment,
      evidenceSummary: doc.evidenceSummary,
      followUpUseful: doc.followUpUseful,
      followUpReason: doc.followUpReason,
      evaluatedAt: doc.evaluatedAt,
    };
  }
}

export const employerInterviewScenarioResponseEvaluationService = new EmployerInterviewScenarioResponseEvaluationService();
export default employerInterviewScenarioResponseEvaluationService;
