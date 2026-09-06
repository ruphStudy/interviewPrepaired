import Organization, { IOrganization } from '../models/Organization.model';
import Interview, { IInterview } from '../models/interview.model';
import { InterviewPurpose } from '../constants/interview';
import EmployerHiringAnswerReasoningSignal from '../models/EmployerHiringAnswerReasoningSignal.model';
import EmployerHiringAnswerConfidenceSignal from '../models/EmployerHiringAnswerConfidenceSignal.model';
import EmployerHiringAssessmentConsistency, {
  IEmployerHiringAssessmentConsistency,
  IConsistencyFinding,
  IEmployerHiringAnswerAIUsage,
  EmployerHiringConsistencyFindingType,
  EmployerHiringConsistencyFindingSeverity,
  EmployerHiringOverallConsistency,
} from '../models/EmployerHiringAssessmentConsistency.model';
import { getAIService } from '../ai';
import type { AIResponseMetadata } from '../ai';
import { getModelPricing } from '../config/openaiPricing';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const MIN_ANSWERED_FOR_COMPARISON = 2;
const MAX_FINDINGS = 12;
const MAX_QUESTION_INDEXES_PER_FINDING = 6;
const MAX_EVIDENCE_PER_FINDING = 4;
const MAX_SUMMARY_LENGTH = 350;
const MAX_THEMES = 10;
const MAX_LIMITATIONS = 5;
const MAX_STRING_LENGTH = 200;

const ALLOWED_FINDING_TYPES: EmployerHiringConsistencyFindingType[] = [
  'direct_contradiction',
  'factual_inconsistency',
  'scope_change',
  'timeline_inconsistency',
  'terminology_inconsistency',
  'unsupported_change',
];
const ALLOWED_SEVERITIES: EmployerHiringConsistencyFindingSeverity[] = ['high', 'medium', 'low'];
const ALLOWED_OVERALL: EmployerHiringOverallConsistency[] = ['consistent', 'mostly_consistent', 'mixed', 'inconsistent', 'insufficient_evidence'];

function round(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}

/**
 * Analyzes OBSERVABLE answer-to-answer consistency across one completed
 * hiring-assessment interview (26C) — never deception/lie detection, never
 * infers honesty, intent, personality, memory ability, intelligence, or
 * protected traits. Read-only intelligence layer: never mutates answers,
 * evaluations, the 21E aggregate, or the 22A evidence matrix.
 */
export class EmployerHiringAssessmentConsistencyService {
  /** POST .../consistency/generate — requires INTERVIEWS_MANAGE. No client artifact IDs are ever accepted. */
  async generateAssessmentConsistency(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    interviewId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const interview = await this.loadInterview(organization, interviewId);
    const answeredQuestions = interview.questions
      .map((q, index) => ({ index, questionText: q.questionText, answerText: q.answerText, evaluation: q.evaluation }))
      .filter((q) => q.answerText && q.answerText.trim().length > 0);

    const existing = await EmployerHiringAssessmentConsistency.findOne({ organizationId: organization._id, interviewId: interview._id });
    if (existing) {
      return this.handleExisting(existing, organization, interview, answeredQuestions);
    }

    if (answeredQuestions.length < MIN_ANSWERED_FOR_COMPARISON) {
      return this.createDeterministicInsufficientEvidence(organization, interview);
    }

    return this.claimAndGenerate(organization, interview, answeredQuestions);
  }

  /** GET .../consistency — requires ORGANIZATION_VIEW. Read-only; never generates, never exposes raw prompt/provider response. */
  async getAssessmentConsistency(organizationId: string, actingRole: OrganizationMemberRole, interviewId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id }).select('_id purpose');
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }

    const doc = await EmployerHiringAssessmentConsistency.findOne({ organizationId: organization._id, interviewId: interview._id });
    if (!doc) {
      return { generated: false };
    }
    return this.toDetail(doc);
  }

  private async createDeterministicInsufficientEvidence(
    organization: IOrganization,
    interview: IInterview
  ): Promise<Record<string, unknown>> {
    try {
      const doc = await EmployerHiringAssessmentConsistency.create({
        organizationId: organization._id,
        applicationId: interview.employerApplicationId,
        interviewId: interview._id,
        status: 'completed',
        findings: [],
        overallConsistency: 'insufficient_evidence',
        consistentThemes: [],
        limitations: ['Too few answered questions to compare for consistency.'],
      });
      return this.toDetail(doc);
    } catch (error: any) {
      if (error?.code !== 11000) {
        throw error;
      }
      const winner = await EmployerHiringAssessmentConsistency.findOne({ organizationId: organization._id, interviewId: interview._id });
      if (!winner) {
        throw new ApiError(409, 'Consistency analysis is already being prepared — please try again shortly');
      }
      return this.toDetail(winner);
    }
  }

  private async handleExisting(
    existing: IEmployerHiringAssessmentConsistency,
    organization: IOrganization,
    interview: IInterview,
    answeredQuestions: Array<{ index: number; questionText: string; answerText?: string; evaluation?: unknown }>
  ): Promise<Record<string, unknown>> {
    if (existing.status === 'completed') {
      return this.toDetail(existing);
    }
    if (existing.status === 'processing') {
      throw new ApiError(409, 'Consistency analysis is already being prepared — please try again shortly');
    }

    const reclaimed = await EmployerHiringAssessmentConsistency.findOneAndUpdate(
      { _id: existing._id, status: 'failed' },
      { $set: { status: 'processing' }, $unset: { errorMessage: 1 } },
      { new: true }
    );
    if (!reclaimed) {
      const refetched = await EmployerHiringAssessmentConsistency.findById(existing._id);
      if (refetched?.status === 'completed') {
        return this.toDetail(refetched);
      }
      throw new ApiError(409, 'Consistency analysis is already being prepared — please try again shortly');
    }

    return this.generate(reclaimed, organization, interview, answeredQuestions);
  }

  private async claimAndGenerate(
    organization: IOrganization,
    interview: IInterview,
    answeredQuestions: Array<{ index: number; questionText: string; answerText?: string; evaluation?: unknown }>
  ): Promise<Record<string, unknown>> {
    let claimed: IEmployerHiringAssessmentConsistency;
    try {
      claimed = await EmployerHiringAssessmentConsistency.create({
        organizationId: organization._id,
        applicationId: interview.employerApplicationId,
        interviewId: interview._id,
        status: 'processing',
        consistentThemes: [],
        limitations: [],
      });
    } catch (error: any) {
      if (error?.code !== 11000) {
        throw error;
      }
      const winner = await EmployerHiringAssessmentConsistency.findOne({ organizationId: organization._id, interviewId: interview._id });
      if (!winner) {
        throw new ApiError(409, 'Consistency analysis is already being prepared — please try again shortly');
      }
      return this.handleExisting(winner, organization, interview, answeredQuestions);
    }

    return this.generate(claimed, organization, interview, answeredQuestions);
  }

  private async generate(
    claimed: IEmployerHiringAssessmentConsistency,
    organization: IOrganization,
    interview: IInterview,
    answeredQuestions: Array<{ index: number; questionText: string; answerText?: string; evaluation?: unknown }>
  ): Promise<Record<string, unknown>> {
    try {
      // 26A/26B are OPTIONAL enrichment only — read if already completed, never generated here.
      const [reasoningRows, confidenceRows] = await Promise.all([
        EmployerHiringAnswerReasoningSignal.find({ organizationId: organization._id, interviewId: interview._id, status: 'completed' })
          .select('questionIndex signals overallReasoningEvidence')
          .lean(),
        EmployerHiringAnswerConfidenceSignal.find({ organizationId: organization._id, interviewId: interview._id, status: 'completed' })
          .select('questionIndex expressionConfidence uncertaintyAwareness claims')
          .lean(),
      ]);

      const prompt = this.buildPrompt(answeredQuestions, reasoningRows, confidenceRows);
      const result = await getAIService().generateStructured<unknown>(
        { prompt, temperature: 0.2, maxTokens: 2500 },
        { interviewId: interview._id.toString(), operation: 'hiring-assessment-consistency' }
      );

      const validQuestionIndexes = new Set(answeredQuestions.map((q) => q.index));
      const { findings, overallConsistency, consistentThemes, limitations } = this.validateResult(result.data, validQuestionIndexes);
      const aiUsage = this.computeUsage(result.metadata);

      const updated = await EmployerHiringAssessmentConsistency.findOneAndUpdate(
        { _id: claimed._id },
        { $set: { status: 'completed', findings, overallConsistency, consistentThemes, limitations, aiUsage }, $unset: { errorMessage: 1 } },
        { new: true }
      );
      return this.toDetail(updated!);
    } catch (error) {
      await EmployerHiringAssessmentConsistency.updateOne(
        { _id: claimed._id },
        { $set: { status: 'failed', errorMessage: this.safeErrorMessage(error) } }
      );
      throw error;
    }
  }

  private async loadInterview(organization: IOrganization, interviewId: string): Promise<IInterview> {
    const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id });
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }
    if (interview.hiringEvaluationStatus !== 'completed') {
      throw new ApiError(409, 'This assessment has not been evaluated yet. Evaluate the assessment first.');
    }
    return interview;
  }

  /**
   * Strict, non-coaching, JSON-only prompt. Sends ONLY candidate-facing
   * question text, the candidate's own answer text, completed 21D
   * evaluations, and — when already completed — 26A/26B structured signal
   * labels/summaries. Never sends resume, notes, decisions, communications,
   * pipeline status, final hiring recommendation, or other candidates.
   */
  private buildPrompt(
    answeredQuestions: Array<{ index: number; questionText: string; answerText?: string; evaluation?: any }>,
    reasoningRows: Array<{ questionIndex: number; signals?: unknown; overallReasoningEvidence?: unknown }>,
    confidenceRows: Array<{ questionIndex: number; expressionConfidence?: unknown; uncertaintyAwareness?: unknown; claims?: unknown }>
  ): string {
    const reasoningByIndex = new Map(reasoningRows.map((r) => [r.questionIndex, r]));
    const confidenceByIndex = new Map(confidenceRows.map((r) => [r.questionIndex, r]));

    const compactQuestions = answeredQuestions.map((q) => ({
      questionIndex: q.index,
      questionText: q.questionText,
      answerText: q.answerText,
      existingEvaluation: q.evaluation
        ? {
            overallScore: q.evaluation.hiringRubricScore ?? q.evaluation.overallScore,
            strengths: q.evaluation.strengths,
            concerns: q.evaluation.weaknesses,
            evidenceSummary: q.evaluation.hiringEvidenceSummary,
          }
        : null,
      reasoningSignalSummary: reasoningByIndex.get(q.index)?.signals ?? null,
      confidenceSummary: confidenceByIndex.get(q.index)
        ? {
            expressionConfidence: confidenceByIndex.get(q.index)!.expressionConfidence,
            uncertaintyAwareness: confidenceByIndex.get(q.index)!.uncertaintyAwareness,
            claims: confidenceByIndex.get(q.index)!.claims,
          }
        : null,
    }));

    return `You are comparing OBSERVABLE statements ACROSS multiple answers within ONE candidate's hiring assessment, looking for genuine contradictions or unsupported changes. This is production hiring infrastructure, NOT coaching — do not address the candidate.

STRICT RULES:
- Compare observable statements across the answers below. Do NOT infer deception, lying, honesty, intent, personality, memory ability, intelligence, or hidden mental state.
- A "direct_contradiction" or "factual_inconsistency" finding requires GENUINELY conflicting statements. Different examples, different scope, or added detail across answers are NOT automatically contradictions — do not report a finding for those.
- "scope_change": the candidate's described scope/ownership of something materially changed between answers without acknowledgment.
- "timeline_inconsistency": stated dates/durations/sequences conflict.
- "terminology_inconsistency": the same thing is named/described in the incompatible ways that create ambiguity or confusion (not just synonyms).
- "unsupported_change": a later answer asserts something that contradicts an earlier answer's specific detail, with no acknowledgment of the change.
- Output AT MOST 12 findings. Each finding needs "questionIndexes" (the "questionIndex" values involved, normally at least 2 when comparing across answers), a concise "summary" (max 350 chars), and up to 4 "evidence" entries (each an exact/paraphrased excerpt from the relevant answer, with its "questionIndex").
- If there is no meaningful contradiction, "findings" may be an empty array — do not invent findings to fill a quota.
- "overallConsistency" reflects the consistency of THIS assessment's observable responses only — one of: consistent, mostly_consistent, mixed, inconsistent, insufficient_evidence. Never a honesty/deception judgment.
- "consistentThemes" lists genuinely consistent themes across answers (empty array if none stand out).
- "limitations" lists genuine constraints on this analysis (e.g. "Few answers overlapped in topic") — empty array if none.
- JSON only — no prose, no markdown code fences, no explanation.

ANSWERED QUESTIONS (with existing completed evaluation and, where already generated, 26A/26B structured summaries — context only):
${JSON.stringify(compactQuestions)}

Return ONLY a single JSON object with EXACTLY this shape:
{
  "findings": [
    {
      "type": string,
      "severity": string,
      "questionIndexes": number[],
      "summary": string,
      "evidence": [ { "questionIndex": number, "answerExcerptOrSummary": string } ]
    }
  ],
  "overallConsistency": string,
  "consistentThemes": string[],
  "limitations": string[]
}

Return JSON only.`;
  }

  /** Strict, defensive normalization of untrusted AI JSON — no partial/fabricated persistence. */
  private validateResult(
    data: unknown,
    validQuestionIndexes: Set<number>
  ): {
    findings: IConsistencyFinding[];
    overallConsistency: EmployerHiringOverallConsistency;
    consistentThemes: string[];
    limitations: string[];
  } {
    const source = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
    if (!source) {
      throw new ApiError(502, 'Consistency analysis was structurally invalid');
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

    const overallRaw = typeof source.overallConsistency === 'string' ? source.overallConsistency : '';
    if (!ALLOWED_OVERALL.includes(overallRaw as EmployerHiringOverallConsistency)) {
      throw new ApiError(502, 'Consistency analysis was structurally invalid');
    }
    const overallConsistency = overallRaw as EmployerHiringOverallConsistency;

    const rawFindings = Array.isArray(source.findings) ? (source.findings as unknown[]) : [];
    const findings: IConsistencyFinding[] = [];
    for (const raw of rawFindings) {
      if (findings.length >= MAX_FINDINGS) break;
      const item = asObject(raw);
      const type = ALLOWED_FINDING_TYPES.includes(item.type as EmployerHiringConsistencyFindingType)
        ? (item.type as EmployerHiringConsistencyFindingType)
        : null;
      const severity = ALLOWED_SEVERITIES.includes(item.severity as EmployerHiringConsistencyFindingSeverity)
        ? (item.severity as EmployerHiringConsistencyFindingSeverity)
        : null;
      const summary = typeof item.summary === 'string' ? item.summary.trim().slice(0, MAX_SUMMARY_LENGTH) : '';
      if (!type || !severity || !summary) continue;

      const rawIndexes = Array.isArray(item.questionIndexes) ? (item.questionIndexes as unknown[]) : [];
      const questionIndexes = [...new Set(rawIndexes.filter((v): v is number => typeof v === 'number' && validQuestionIndexes.has(v)))].slice(
        0,
        MAX_QUESTION_INDEXES_PER_FINDING
      );
      if (questionIndexes.length === 0) continue;

      const rawEvidence = Array.isArray(item.evidence) ? (item.evidence as unknown[]) : [];
      const evidence = [];
      for (const evRaw of rawEvidence) {
        if (evidence.length >= MAX_EVIDENCE_PER_FINDING) break;
        const evItem = asObject(evRaw);
        const questionIndex = typeof evItem.questionIndex === 'number' && validQuestionIndexes.has(evItem.questionIndex) ? evItem.questionIndex : null;
        const answerExcerptOrSummary =
          typeof evItem.answerExcerptOrSummary === 'string' ? evItem.answerExcerptOrSummary.trim().slice(0, MAX_SUMMARY_LENGTH) : '';
        if (questionIndex === null || !answerExcerptOrSummary) continue;
        evidence.push({ questionIndex, answerExcerptOrSummary });
      }

      findings.push({ type, severity, questionIndexes, summary, evidence });
    }

    return {
      findings,
      overallConsistency,
      consistentThemes: asStringArray(source.consistentThemes, MAX_THEMES),
      limitations: asStringArray(source.limitations, MAX_LIMITATIONS),
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
    return 'Consistency analysis generation failed';
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

  private toDetail(doc: IEmployerHiringAssessmentConsistency): Record<string, unknown> {
    if (doc.status !== 'completed') {
      return { generated: false, status: doc.status, errorMessage: doc.status === 'failed' ? doc.errorMessage : undefined };
    }
    return {
      generated: true,
      overallConsistency: doc.overallConsistency,
      findings: doc.findings,
      consistentThemes: doc.consistentThemes,
      limitations: doc.limitations,
      generatedAt: doc.updatedAt,
    };
  }
}

export const employerHiringAssessmentConsistencyService = new EmployerHiringAssessmentConsistencyService();
export default employerHiringAssessmentConsistencyService;
