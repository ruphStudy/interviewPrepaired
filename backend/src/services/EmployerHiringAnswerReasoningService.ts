import Organization, { IOrganization } from '../models/Organization.model';
import Interview, { IInterview, IQuestion } from '../models/interview.model';
import { InterviewPurpose } from '../constants/interview';
import EmployerInterviewCompetencyRubric, { IEmployerInterviewCompetencyRubric } from '../models/EmployerInterviewCompetencyRubric.model';
import EmployerHiringAnswerReasoningSignal, {
  IEmployerHiringAnswerReasoningSignal,
  IReasoningSignal,
  IEmployerHiringAnswerAIUsage,
  EmployerHiringReasoningSignalType,
  EmployerHiringReasoningSignalLevel,
  EmployerHiringOverallReasoningEvidence,
} from '../models/EmployerHiringAnswerReasoningSignal.model';
import { getAIService } from '../ai';
import type { AIResponseMetadata } from '../ai';
import { getModelPricing } from '../config/openaiPricing';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const MAX_EVIDENCE_SUMMARY_LENGTH = 300;
const MAX_LIMITATIONS = 5;
const MAX_LIMITATION_LENGTH = 200;

const REQUIRED_SIGNAL_TYPES: EmployerHiringReasoningSignalType[] = [
  'problem_decomposition',
  'tradeoff_awareness',
  'assumption_awareness',
  'evidence_usage',
  'causal_reasoning',
  'alternative_consideration',
  'decision_clarity',
];
const ALLOWED_LEVELS: EmployerHiringReasoningSignalLevel[] = ['strong', 'present', 'limited', 'not_observed'];
const ALLOWED_OVERALL: EmployerHiringOverallReasoningEvidence[] = ['strong', 'sufficient', 'limited', 'insufficient'];

function round(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}

/**
 * Analyzes OBSERVABLE reasoning expressed in a single hiring-assessment
 * answer (26A) — never chain-of-thought, never hidden mental process,
 * never intelligence/personality/psychological-state/protected-trait
 * inference. Read-only intelligence layer: never mutates the answer, its
 * 21D evaluation, 21E aggregate, 22A evidence matrix, or 22E finalization.
 */
export class EmployerHiringAnswerReasoningService {
  /** POST .../reasoning-signals/generate — requires INTERVIEWS_MANAGE. Requires a completed 21D evaluation for this exact question and its exact rubric. No client artifact IDs are ever accepted. */
  async generateAnswerReasoningSignals(
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

    const existing = await EmployerHiringAnswerReasoningSignal.findOne({
      organizationId: organization._id,
      interviewId: interview._id,
      questionIndex,
    });

    if (existing) {
      return this.handleExisting(existing, interview, question, rubric);
    }

    return this.claimAndGenerate(organization, interview, question, rubric, questionIndex);
  }

  /** GET .../reasoning-signals — requires ORGANIZATION_VIEW. Read-only; never generates, never exposes raw prompt/provider response. */
  async getAnswerReasoningSignals(
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

    const doc = await EmployerHiringAnswerReasoningSignal.findOne({ organizationId: organization._id, interviewId: interview._id, questionIndex });
    if (!doc) {
      return { generated: false };
    }
    return this.toDetail(doc);
  }

  private async handleExisting(
    existing: IEmployerHiringAnswerReasoningSignal,
    interview: IInterview,
    question: IQuestion,
    rubric: IEmployerInterviewCompetencyRubric
  ): Promise<Record<string, unknown>> {
    if (existing.status === 'completed') {
      return this.toDetail(existing);
    }
    if (existing.status === 'processing') {
      throw new ApiError(409, 'Reasoning evidence is already being prepared — please try again shortly');
    }

    // failed -> safe CAS retry
    const reclaimed = await EmployerHiringAnswerReasoningSignal.findOneAndUpdate(
      { _id: existing._id, status: 'failed' },
      { $set: { status: 'processing' }, $unset: { errorMessage: 1 } },
      { new: true }
    );
    if (!reclaimed) {
      const refetched = await EmployerHiringAnswerReasoningSignal.findById(existing._id);
      if (refetched?.status === 'completed') {
        return this.toDetail(refetched);
      }
      throw new ApiError(409, 'Reasoning evidence is already being prepared — please try again shortly');
    }

    return this.generate(reclaimed, interview, question, rubric);
  }

  private async claimAndGenerate(
    organization: IOrganization,
    interview: IInterview,
    question: IQuestion,
    rubric: IEmployerInterviewCompetencyRubric,
    questionIndex: number
  ): Promise<Record<string, unknown>> {
    let claimed: IEmployerHiringAnswerReasoningSignal;
    try {
      claimed = await EmployerHiringAnswerReasoningSignal.create({
        organizationId: organization._id,
        applicationId: interview.employerApplicationId,
        interviewId: interview._id,
        questionIndex,
        rubricId: rubric._id,
        status: 'processing',
        limitations: [],
      });
    } catch (error: any) {
      if (error?.code !== 11000) {
        throw error;
      }
      const winner = await EmployerHiringAnswerReasoningSignal.findOne({
        organizationId: organization._id,
        interviewId: interview._id,
        questionIndex,
      });
      if (!winner) {
        throw new ApiError(409, 'Reasoning evidence is already being prepared — please try again shortly');
      }
      return this.handleExisting(winner, interview, question, rubric);
    }

    return this.generate(claimed, interview, question, rubric);
  }

  private async generate(
    claimed: IEmployerHiringAnswerReasoningSignal,
    interview: IInterview,
    question: IQuestion,
    rubric: IEmployerInterviewCompetencyRubric
  ): Promise<Record<string, unknown>> {
    try {
      const prompt = this.buildPrompt(question, rubric);
      const result = await getAIService().generateStructured<unknown>(
        { prompt, temperature: 0.2, maxTokens: 1500 },
        { interviewId: interview._id.toString(), operation: 'hiring-answer-reasoning-signals' }
      );

      const { signals, overallReasoningEvidence, limitations } = this.validateSignals(result.data);
      const aiUsage = this.computeUsage(result.metadata);

      const updated = await EmployerHiringAnswerReasoningSignal.findOneAndUpdate(
        { _id: claimed._id },
        { $set: { status: 'completed', signals, overallReasoningEvidence, limitations, aiUsage }, $unset: { errorMessage: 1 } },
        { new: true }
      );
      return this.toDetail(updated!);
    } catch (error) {
      await EmployerHiringAnswerReasoningSignal.updateOne(
        { _id: claimed._id },
        { $set: { status: 'failed', errorMessage: this.safeErrorMessage(error) } }
      );
      throw error;
    }
  }

  /** Re-derives + validates the exact tenant-scoped question/rubric — never trusts any artifact id from the caller. `questionIndex` is the SAME identifier `Interview.evaluateQuestion` already uses (questions have no persisted `_id`). */
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
   * question text, the candidate's own answer text, the completed 21D
   * evaluation output, and the rubric expectations for this question's own
   * competencies — never candidate name/contact, resume/JD raw text,
   * recruiter notes, decisions, communications, final hiring result,
   * pipeline status, or other candidates.
   */
  private buildPrompt(question: IQuestion, rubric: IEmployerInterviewCompetencyRubric): string {
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

    return `You are analyzing OBSERVABLE reasoning expressed in a candidate's answer to a hiring assessment question. This is production hiring infrastructure, NOT coaching — do not address the candidate, do not give tips.

STRICT RULES:
- Analyze ONLY observable reasoning expressed in the answer text below.
- Do NOT infer or reveal private chain-of-thought, hidden mental processes, personality, intelligence, psychological state, or protected traits (age, gender, religion, race, disability, etc.).
- Every "evidenceSummary" must describe ONLY visible answer content — quote or closely paraphrase the answer, never invent reasoning that isn't shown.
- Output EXACTLY one entry for EACH of these 7 signal types, no more, no fewer: problem_decomposition, tradeoff_awareness, assumption_awareness, evidence_usage, causal_reasoning, alternative_consideration, decision_clarity.
- For each signal, "level" must be one of: strong, present, limited, not_observed — use "not_observed" honestly when the answer does not demonstrate that signal at all (this is normal and expected for many answers).
- "overallReasoningEvidence" reflects the amount of observable reasoning evidence in THIS answer only — one of: strong, sufficient, limited, insufficient. Never a general ability/intelligence judgment.
- "limitations" should list genuine constraints on this analysis (e.g. "Answer was brief", "Question did not call for tradeoff analysis") — empty array if none.
- JSON only — no prose, no markdown code fences, no explanation.

QUESTION:
${question.questionText}

CANDIDATE ANSWER:
${question.answerText}

EXISTING COMPLETED EVALUATION (for context only — do not re-score it):
${JSON.stringify(existingEvaluation)}

RUBRIC EXPECTATIONS (competencies this question targets):
${JSON.stringify(relevantRubric)}

Return ONLY a single JSON object with EXACTLY this shape:
{
  "signals": [
    { "type": string, "level": string, "evidenceSummary": string }
  ],
  "overallReasoningEvidence": string,
  "limitations": string[]
}

Return JSON only.`;
  }

  /**
   * Strict, defensive normalization of untrusted AI JSON. All 7 required
   * signal types must be present exactly once (duplicates are dropped,
   * keeping the first occurrence) or the whole batch is rejected — no
   * partial/fabricated persistence.
   */
  private validateSignals(data: unknown): {
    signals: IReasoningSignal[];
    overallReasoningEvidence: EmployerHiringOverallReasoningEvidence;
    limitations: string[];
  } {
    const source = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
    const rawSignals = source && Array.isArray(source.signals) ? (source.signals as unknown[]) : null;
    if (!rawSignals || rawSignals.length === 0) {
      throw new ApiError(502, 'Reasoning signals were structurally invalid');
    }

    const asObject = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' ? (value as Record<string, unknown>) : {});

    const byType = new Map<string, IReasoningSignal>();
    for (const raw of rawSignals) {
      const item = asObject(raw);
      const type = typeof item.type === 'string' ? item.type : '';
      if (!REQUIRED_SIGNAL_TYPES.includes(type as EmployerHiringReasoningSignalType) || byType.has(type)) continue;
      const level = typeof item.level === 'string' && ALLOWED_LEVELS.includes(item.level as EmployerHiringReasoningSignalLevel)
        ? (item.level as EmployerHiringReasoningSignalLevel)
        : null;
      if (!level) continue;
      const evidenceSummary = typeof item.evidenceSummary === 'string' ? item.evidenceSummary.trim().slice(0, MAX_EVIDENCE_SUMMARY_LENGTH) : '';
      if (!evidenceSummary) continue;
      byType.set(type, { type: type as EmployerHiringReasoningSignalType, level, evidenceSummary });
    }

    if (REQUIRED_SIGNAL_TYPES.some((type) => !byType.has(type))) {
      throw new ApiError(502, 'Reasoning signals were incomplete');
    }
    const signals = REQUIRED_SIGNAL_TYPES.map((type) => byType.get(type)!);

    const overallRaw = typeof source?.overallReasoningEvidence === 'string' ? source.overallReasoningEvidence : '';
    if (!ALLOWED_OVERALL.includes(overallRaw as EmployerHiringOverallReasoningEvidence)) {
      throw new ApiError(502, 'Reasoning signals were structurally invalid');
    }
    const overallReasoningEvidence = overallRaw as EmployerHiringOverallReasoningEvidence;

    const rawLimitations = Array.isArray(source?.limitations) ? (source!.limitations as unknown[]) : [];
    const seen = new Set<string>();
    const limitations: string[] = [];
    for (const item of rawLimitations) {
      if (typeof item !== 'string') continue;
      const trimmed = item.trim().slice(0, MAX_LIMITATION_LENGTH);
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      limitations.push(trimmed);
      if (limitations.length >= MAX_LIMITATIONS) break;
    }

    return { signals, overallReasoningEvidence, limitations };
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
    return 'Reasoning evidence generation failed';
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

  private toDetail(doc: IEmployerHiringAnswerReasoningSignal): Record<string, unknown> {
    if (doc.status !== 'completed') {
      return { generated: false, status: doc.status, errorMessage: doc.status === 'failed' ? doc.errorMessage : undefined };
    }
    return {
      generated: true,
      overallReasoningEvidence: doc.overallReasoningEvidence,
      signals: doc.signals,
      limitations: doc.limitations,
      generatedAt: doc.updatedAt,
    };
  }
}

export const employerHiringAnswerReasoningService = new EmployerHiringAnswerReasoningService();
export default employerHiringAnswerReasoningService;
