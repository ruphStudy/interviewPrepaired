import Organization, { IOrganization } from '../models/Organization.model';
import Interview, { IInterview, IQuestion } from '../models/interview.model';
import { InterviewPurpose } from '../constants/interview';
import EmployerInterviewCompetencyRubric, { IEmployerInterviewCompetencyRubric } from '../models/EmployerInterviewCompetencyRubric.model';
import EmployerHiringAnswerReasoningSignal from '../models/EmployerHiringAnswerReasoningSignal.model';
import EmployerHiringAnswerConfidenceSignal, {
  IEmployerHiringAnswerConfidenceSignal,
  IConfidenceClaim,
  IEmployerHiringAnswerAIUsage,
  EmployerHiringExpressionConfidence,
  EmployerHiringUncertaintyAwareness,
  EmployerHiringCalibration,
  EmployerHiringClaimConfidenceExpression,
  EmployerHiringClaimSupportLevel,
} from '../models/EmployerHiringAnswerConfidenceSignal.model';
import { getAIService } from '../ai';
import type { AIResponseMetadata } from '../ai';
import { getModelPricing } from '../config/openaiPricing';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const MAX_CLAIMS = 8;
const MAX_CLAIM_SUMMARY_LENGTH = 250;
const MAX_LIST_ITEMS = 5;
const MAX_STRING_LENGTH = 200;

const ALLOWED_EXPRESSION_CONFIDENCE: EmployerHiringExpressionConfidence[] = ['high', 'moderate', 'low', 'mixed'];
const ALLOWED_UNCERTAINTY_AWARENESS: EmployerHiringUncertaintyAwareness[] = ['strong', 'present', 'limited', 'not_observed'];
const ALLOWED_CALIBRATION: EmployerHiringCalibration[] = [
  'well_calibrated',
  'possibly_overconfident',
  'possibly_underconfident',
  'insufficient_evidence',
];
const ALLOWED_CLAIM_CONFIDENCE: EmployerHiringClaimConfidenceExpression[] = ['high', 'moderate', 'low', 'uncertain'];
const ALLOWED_SUPPORT_LEVEL: EmployerHiringClaimSupportLevel[] = ['supported_by_answer', 'partially_supported', 'unsupported'];

function round(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}

/**
 * Analyzes OBSERVABLE confidence/uncertainty handling in a single hiring-
 * assessment answer (26B) — distinguishes how assertively claims are
 * phrased (expression confidence) from whether limitations/assumptions/
 * unknowns are acknowledged (uncertainty awareness). This is NOT lie/
 * deception detection, NOT a truth-probability/honesty score, NOT
 * personality or psychological confidence, and never infers protected
 * traits. Read-only intelligence layer: never mutates the answer, its 21D
 * evaluation, 21E aggregate, 22A evidence matrix, or 22E finalization.
 * 26A is OPTIONAL enrichment only — this service never auto-generates it.
 */
export class EmployerHiringAnswerConfidenceService {
  /** POST .../confidence-signals/generate — requires INTERVIEWS_MANAGE. Same exact prerequisites as 26A. No client artifact IDs are ever accepted. */
  async generateAnswerConfidenceSignals(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    interviewId: string,
    questionIndex: number
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const { interview, question, rubric } = await this.resolveQuestion(organization, interviewId, questionIndex);

    // 26A is OPTIONAL enrichment only — read if already completed, never generated here.
    const reasoningSignal = await EmployerHiringAnswerReasoningSignal.findOne({
      organizationId: organization._id,
      interviewId: interview._id,
      questionIndex,
      status: 'completed',
    }).select('_id signals');

    const existing = await EmployerHiringAnswerConfidenceSignal.findOne({
      organizationId: organization._id,
      interviewId: interview._id,
      questionIndex,
    });

    if (existing) {
      return this.handleExisting(existing, interview, question, rubric, reasoningSignal);
    }

    return this.claimAndGenerate(organization, interview, question, rubric, questionIndex, reasoningSignal);
  }

  /** GET .../confidence-signals — requires ORGANIZATION_VIEW. Read-only; never exposes raw prompt/provider response. */
  async getAnswerConfidenceSignals(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    interviewId: string,
    questionIndex: number
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id }).select('_id purpose');
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }

    const doc = await EmployerHiringAnswerConfidenceSignal.findOne({ organizationId: organization._id, interviewId: interview._id, questionIndex });
    if (!doc) {
      return { generated: false };
    }
    return this.toDetail(doc);
  }

  private async handleExisting(
    existing: IEmployerHiringAnswerConfidenceSignal,
    interview: IInterview,
    question: IQuestion,
    rubric: IEmployerInterviewCompetencyRubric,
    reasoningSignal: { _id: unknown; signals?: unknown } | null
  ): Promise<Record<string, unknown>> {
    if (existing.status === 'completed') {
      return this.toDetail(existing);
    }
    if (existing.status === 'processing') {
      throw new ApiError(409, 'Confidence intelligence is already being prepared — please try again shortly');
    }

    const reclaimed = await EmployerHiringAnswerConfidenceSignal.findOneAndUpdate(
      { _id: existing._id, status: 'failed' },
      { $set: { status: 'processing' }, $unset: { errorMessage: 1 } },
      { new: true }
    );
    if (!reclaimed) {
      const refetched = await EmployerHiringAnswerConfidenceSignal.findById(existing._id);
      if (refetched?.status === 'completed') {
        return this.toDetail(refetched);
      }
      throw new ApiError(409, 'Confidence intelligence is already being prepared — please try again shortly');
    }

    return this.generate(reclaimed, interview, question, rubric, reasoningSignal);
  }

  private async claimAndGenerate(
    organization: IOrganization,
    interview: IInterview,
    question: IQuestion,
    rubric: IEmployerInterviewCompetencyRubric,
    questionIndex: number,
    reasoningSignal: { _id: unknown; signals?: unknown } | null
  ): Promise<Record<string, unknown>> {
    let claimed: IEmployerHiringAnswerConfidenceSignal;
    try {
      claimed = await EmployerHiringAnswerConfidenceSignal.create({
        organizationId: organization._id,
        applicationId: interview.employerApplicationId,
        interviewId: interview._id,
        questionIndex,
        reasoningSignalId: reasoningSignal?._id,
        rubricId: rubric._id,
        status: 'processing',
        strengths: [],
        concerns: [],
        limitations: [],
      });
    } catch (error: any) {
      if (error?.code !== 11000) {
        throw error;
      }
      const winner = await EmployerHiringAnswerConfidenceSignal.findOne({
        organizationId: organization._id,
        interviewId: interview._id,
        questionIndex,
      });
      if (!winner) {
        throw new ApiError(409, 'Confidence intelligence is already being prepared — please try again shortly');
      }
      return this.handleExisting(winner, interview, question, rubric, reasoningSignal);
    }

    return this.generate(claimed, interview, question, rubric, reasoningSignal);
  }

  private async generate(
    claimed: IEmployerHiringAnswerConfidenceSignal,
    interview: IInterview,
    question: IQuestion,
    rubric: IEmployerInterviewCompetencyRubric,
    reasoningSignal: { _id: unknown; signals?: unknown } | null
  ): Promise<Record<string, unknown>> {
    try {
      const prompt = this.buildPrompt(question, rubric, reasoningSignal);
      const result = await getAIService().generateStructured<unknown>(
        { prompt, temperature: 0.2, maxTokens: 1500 },
        { interviewId: interview._id.toString(), operation: 'hiring-answer-confidence-signals' }
      );

      const validated = this.validateResult(result.data);
      const aiUsage = this.computeUsage(result.metadata);

      const updated = await EmployerHiringAnswerConfidenceSignal.findOneAndUpdate(
        { _id: claimed._id },
        { $set: { ...validated, aiUsage, status: 'completed' }, $unset: { errorMessage: 1 } },
        { new: true }
      );
      return this.toDetail(updated!);
    } catch (error) {
      await EmployerHiringAnswerConfidenceSignal.updateOne(
        { _id: claimed._id },
        { $set: { status: 'failed', errorMessage: this.safeErrorMessage(error) } }
      );
      throw error;
    }
  }

  /** Re-derives + validates the exact tenant-scoped question/rubric — same exact prerequisites as 26A; never trusts any artifact id from the caller. */
  private async resolveQuestion(
    organization: IOrganization,
    interviewId: string,
    questionIndex: number
  ): Promise<{ interview: IInterview; question: IQuestion; rubric: IEmployerInterviewCompetencyRubric }> {
    const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id });
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }

    if (!Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex >= interview.questions.length) {
      throw new ApiError(404, 'Question not found');
    }
    const question = interview.questions[questionIndex];
    if (!question.answerText || question.answerText.trim().length === 0) {
      throw new ApiError(409, 'This question has not been answered yet.');
    }
    if (interview.hiringEvaluationStatus !== 'completed' || !question.evaluation) {
      throw new ApiError(409, 'This answer has not been evaluated yet. Evaluate the assessment first.');
    }

    const rubric = await EmployerInterviewCompetencyRubric.findOne({ _id: interview.employerRubricId, organizationId: organization._id });
    if (!rubric) {
      throw new ApiError(409, 'Interview evaluation rubric is not ready');
    }

    return { interview, question, rubric };
  }

  /**
   * Strict, non-coaching, JSON-only prompt. Sends ONLY the candidate-facing
   * question, the candidate's own answer text, the completed 21D
   * evaluation, the relevant rubric expectations, and — when a completed
   * 26A row already exists — ONLY its structured signal labels/evidence
   * summaries (never any hidden/private reasoning). Never sends candidate
   * name/contact, resume/JD raw text, recruiter notes, decisions,
   * communications, final hiring result, pipeline status, or other
   * candidates.
   */
  private buildPrompt(
    question: IQuestion,
    rubric: IEmployerInterviewCompetencyRubric,
    reasoningSignal: { _id: unknown; signals?: unknown } | null
  ): string {
    const questionCompetencyNames = new Set(question.competencyNames ?? []);
    const relevantRubric = rubric.rubric.competencies
      .filter((c) => questionCompetencyNames.has(c.competencyName))
      .map((c) => ({ competencyName: c.competencyName, evidenceSignals: c.evidenceSignals, scoringAnchors: c.scoringAnchors }));

    const evaluation = question.evaluation;
    const existingEvaluation = evaluation
      ? {
          overallScore: evaluation.hiringRubricScore ?? evaluation.overallScore,
          competencyScores: (evaluation.hiringCompetencyScores ?? []).map((cs) => ({
            competencyName: cs.competencyName,
            score: cs.score,
            evidence: cs.evidence,
          })),
          strengths: evaluation.strengths,
          concerns: evaluation.weaknesses,
          evidenceSummary: evaluation.hiringEvidenceSummary,
        }
      : null;

    const reasoningSummary = reasoningSignal?.signals
      ? (reasoningSignal.signals as Array<{ type: string; level: string; evidenceSummary: string }>).map((s) => ({
          type: s.type,
          level: s.level,
          evidenceSummary: s.evidenceSummary,
        }))
      : null;

    return `You are evaluating OBSERVABLE claim confidence and uncertainty handling in a candidate's answer to a hiring assessment question. This is production hiring infrastructure, NOT coaching — do not address the candidate, do not give tips.

STRICT RULES:
- Do NOT determine whether the candidate is lying, truthful, intelligent, psychologically confident, or possessing any hidden trait. This is NOT lie detection, NOT deception detection, NOT a truth-probability or honesty score.
- Do NOT infer private thoughts. Analyze ONLY the phrasing and content visible in the answer text below.
- Extract AT MOST 8 meaningful claims from the answer. Each claim's "claimSummary" must be a concise paraphrase grounded in the answer — never invent facts not present in the answer. Max ~250 characters.
- For each claim: "confidenceExpression" (how assertively it is phrased) is one of: high, moderate, low, uncertain. "supportLevel" (how much visible support the answer itself gives for the claim) is one of: supported_by_answer, partially_supported, unsupported. "uncertaintyAcknowledged" is true only if the candidate explicitly acknowledged a limitation, assumption, unknown, or risk for that claim.
- "expressionConfidence" (overall) is one of: high, moderate, low, mixed.
- "uncertaintyAwareness" (overall) is one of: strong, present, limited, not_observed.
- "calibration" describes ONLY the relationship between how strongly claims are expressed and how much support/uncertainty is visible in the answer — one of: well_calibrated (expression generally matches visible support/uncertainty), possibly_overconfident (strong assertions with weak/limited visible support), possibly_underconfident (tentative language despite strong visible support), insufficient_evidence (not enough answer content to judge). Keep "possibly_" labels as-is — never state this as a certainty, and never convert it into a personality or honesty judgment.
- "strengths"/"concerns"/"limitations" must describe only how confidence/uncertainty was expressed — never a hiring recommendation, never a skill judgment.
- JSON only — no prose, no markdown code fences, no explanation.

QUESTION:
${question.questionText}

CANDIDATE ANSWER:
${question.answerText}

EXISTING COMPLETED EVALUATION (for context only — do not re-score it):
${JSON.stringify(existingEvaluation)}

RUBRIC EXPECTATIONS (competencies this question targets):
${JSON.stringify(relevantRubric)}

${reasoningSummary ? `EXISTING REASONING-EVIDENCE SIGNAL SUMMARY (optional context only — labels/evidence summaries, no hidden reasoning):\n${JSON.stringify(reasoningSummary)}\n` : ''}
Return ONLY a single JSON object with EXACTLY this shape:
{
  "expressionConfidence": string,
  "uncertaintyAwareness": string,
  "calibration": string,
  "claims": [
    { "claimSummary": string, "confidenceExpression": string, "supportLevel": string, "uncertaintyAcknowledged": boolean }
  ],
  "strengths": string[],
  "concerns": string[],
  "limitations": string[]
}

Return JSON only.`;
  }

  /** Strict, defensive normalization of untrusted AI JSON — no partial/fabricated persistence. */
  private validateResult(data: unknown): {
    expressionConfidence: EmployerHiringExpressionConfidence;
    uncertaintyAwareness: EmployerHiringUncertaintyAwareness;
    calibration: EmployerHiringCalibration;
    claims: IConfidenceClaim[];
    strengths: string[];
    concerns: string[];
    limitations: string[];
  } {
    const source = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
    if (!source) {
      throw new ApiError(502, 'Confidence signals were structurally invalid');
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

    const expressionConfidence = ALLOWED_EXPRESSION_CONFIDENCE.includes(source.expressionConfidence as EmployerHiringExpressionConfidence)
      ? (source.expressionConfidence as EmployerHiringExpressionConfidence)
      : null;
    const uncertaintyAwareness = ALLOWED_UNCERTAINTY_AWARENESS.includes(source.uncertaintyAwareness as EmployerHiringUncertaintyAwareness)
      ? (source.uncertaintyAwareness as EmployerHiringUncertaintyAwareness)
      : null;
    const calibration = ALLOWED_CALIBRATION.includes(source.calibration as EmployerHiringCalibration)
      ? (source.calibration as EmployerHiringCalibration)
      : null;
    if (!expressionConfidence || !uncertaintyAwareness || !calibration) {
      throw new ApiError(502, 'Confidence signals were structurally invalid');
    }

    const rawClaims = Array.isArray(source.claims) ? (source.claims as unknown[]) : [];
    const claims: IConfidenceClaim[] = [];
    for (const raw of rawClaims) {
      if (claims.length >= MAX_CLAIMS) break;
      const item = asObject(raw);
      const claimSummary = typeof item.claimSummary === 'string' ? item.claimSummary.trim().slice(0, MAX_CLAIM_SUMMARY_LENGTH) : '';
      if (!claimSummary) continue;
      const confidenceExpression = ALLOWED_CLAIM_CONFIDENCE.includes(item.confidenceExpression as EmployerHiringClaimConfidenceExpression)
        ? (item.confidenceExpression as EmployerHiringClaimConfidenceExpression)
        : null;
      const supportLevel = ALLOWED_SUPPORT_LEVEL.includes(item.supportLevel as EmployerHiringClaimSupportLevel)
        ? (item.supportLevel as EmployerHiringClaimSupportLevel)
        : null;
      if (!confidenceExpression || !supportLevel) continue;
      const uncertaintyAcknowledged = typeof item.uncertaintyAcknowledged === 'boolean' ? item.uncertaintyAcknowledged : false;
      claims.push({ claimSummary, confidenceExpression, supportLevel, uncertaintyAcknowledged });
    }
    if (claims.length === 0) {
      throw new ApiError(502, 'No usable claims were extracted');
    }

    return {
      expressionConfidence,
      uncertaintyAwareness,
      calibration,
      claims,
      strengths: asStringArray(source.strengths, MAX_LIST_ITEMS),
      concerns: asStringArray(source.concerns, MAX_LIST_ITEMS),
      limitations: asStringArray(source.limitations, MAX_LIST_ITEMS),
    };
  }

  /** Reuses the SAME shared pricing config/formula every other single-AI-call sprint uses — never a parallel pricing calculator. */
  private computeUsage(metadata: AIResponseMetadata): IEmployerHiringAnswerAIUsage {
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
    return 'Confidence intelligence generation failed';
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

  private toDetail(doc: IEmployerHiringAnswerConfidenceSignal): Record<string, unknown> {
    if (doc.status !== 'completed') {
      return { generated: false, status: doc.status, errorMessage: doc.status === 'failed' ? doc.errorMessage : undefined };
    }
    return {
      generated: true,
      expressionConfidence: doc.expressionConfidence,
      uncertaintyAwareness: doc.uncertaintyAwareness,
      calibration: doc.calibration,
      claims: doc.claims,
      strengths: doc.strengths,
      concerns: doc.concerns,
      limitations: doc.limitations,
      generatedAt: doc.updatedAt,
    };
  }
}

export const employerHiringAnswerConfidenceService = new EmployerHiringAnswerConfidenceService();
export default employerHiringAnswerConfidenceService;
