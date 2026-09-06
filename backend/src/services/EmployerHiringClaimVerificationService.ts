import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import Interview, { IInterview } from '../models/interview.model';
import { InterviewPurpose } from '../constants/interview';
import EmployerHiringAssessmentResult from '../models/EmployerHiringAssessmentResult.model';
import EmployerHiringEvidenceMatrix from '../models/EmployerHiringEvidenceMatrix.model';
import EmployerHiringAssessmentConsistency from '../models/EmployerHiringAssessmentConsistency.model';
import { employerCandidateResumeAnalysisService } from './EmployerCandidateResumeAnalysisService';
import { employerCandidateScreeningService } from './EmployerCandidateScreeningService';
import EmployerHiringClaimVerification, {
  IEmployerHiringClaimVerification,
  IVerifiedClaim,
  IClaimEvidenceSource,
  IEmployerHiringAnswerAIUsage,
  EmployerHiringClaimCategory,
  EmployerHiringClaimAlignment,
  EmployerHiringClaimEvidenceSourceType,
} from '../models/EmployerHiringClaimVerification.model';
import { getAIService } from '../ai';
import type { AIResponseMetadata } from '../ai';
import { getModelPricing } from '../config/openaiPricing';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const MAX_CLAIMS = 20;
const MAX_CLAIM_SUMMARY_LENGTH = 300;
const MAX_EVIDENCE_SUMMARY_LENGTH = 350;
const MAX_LIMITATION_LENGTH = 300;
const MAX_SOURCES_PER_CLAIM = 5;
const MAX_LIMITATIONS = 5;
const MAX_STRING_LENGTH = 200;

const ALLOWED_CATEGORIES: EmployerHiringClaimCategory[] = [
  'experience',
  'skill',
  'project',
  'responsibility',
  'achievement',
  'education',
  'domain',
  'other',
];
const ALLOWED_ALIGNMENTS: EmployerHiringClaimAlignment[] = ['supported', 'partially_supported', 'unsupported', 'conflicting', 'unverifiable'];
const ALLOWED_SOURCE_TYPES: EmployerHiringClaimEvidenceSourceType[] = ['resume', 'screening', 'assessment', 'evidence_matrix', 'consistency'];

interface AllowedSource {
  id: string;
  summaryForPrompt: unknown;
}

function round(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}

/**
 * Evaluates whether important claims made in a hiring assessment ALIGN with
 * structured evidence already available inside this hiring chain (26D) —
 * internal evidence alignment only, NOT external fact-checking or
 * background verification, NEVER lie/deception detection. Lack of evidence
 * is never treated as proof a claim is false. Read-only intelligence
 * layer: never mutates answers, evaluations, the 21E aggregate, the 22A
 * evidence matrix, resume analysis, or screening. 26C is OPTIONAL
 * enrichment only — this service never auto-generates it.
 */
export class EmployerHiringClaimVerificationService {
  /** POST .../claim-verification/generate — requires INTERVIEWS_MANAGE. No source artifact IDs are ever accepted from the client. */
  async generateClaimVerification(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    interviewId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const interview = await this.loadInterview(organization, interviewId);

    const existing = await EmployerHiringClaimVerification.findOne({ organizationId: organization._id, interviewId: interview._id });
    if (existing) {
      return this.handleExisting(existing, organization, interview, actingRole);
    }

    return this.claimAndGenerate(organization, interview, actingRole);
  }

  /** GET .../claim-verification — requires ORGANIZATION_VIEW. Read-only; never generates, never exposes raw prompt/provider response. */
  async getClaimVerification(organizationId: string, actingRole: OrganizationMemberRole, interviewId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id }).select('_id purpose');
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }

    const doc = await EmployerHiringClaimVerification.findOne({ organizationId: organization._id, interviewId: interview._id });
    if (!doc) {
      return { generated: false };
    }
    return this.toDetail(doc);
  }

  private async handleExisting(
    existing: IEmployerHiringClaimVerification,
    organization: IOrganization,
    interview: IInterview,
    actingRole: OrganizationMemberRole
  ): Promise<Record<string, unknown>> {
    if (existing.status === 'completed') {
      return this.toDetail(existing);
    }
    if (existing.status === 'processing') {
      throw new ApiError(409, 'Claim evidence alignment is already being prepared — please try again shortly');
    }

    const reclaimed = await EmployerHiringClaimVerification.findOneAndUpdate(
      { _id: existing._id, status: 'failed' },
      { $set: { status: 'processing' }, $unset: { errorMessage: 1 } },
      { new: true }
    );
    if (!reclaimed) {
      const refetched = await EmployerHiringClaimVerification.findById(existing._id);
      if (refetched?.status === 'completed') {
        return this.toDetail(refetched);
      }
      throw new ApiError(409, 'Claim evidence alignment is already being prepared — please try again shortly');
    }

    return this.generate(reclaimed, organization, interview, actingRole);
  }

  private async claimAndGenerate(
    organization: IOrganization,
    interview: IInterview,
    actingRole: OrganizationMemberRole
  ): Promise<Record<string, unknown>> {
    let claimed: IEmployerHiringClaimVerification;
    try {
      claimed = await EmployerHiringClaimVerification.create({
        organizationId: organization._id,
        applicationId: interview.employerApplicationId,
        interviewId: interview._id,
        status: 'processing',
        limitations: [],
      });
    } catch (error: any) {
      if (error?.code !== 11000) {
        throw error;
      }
      const winner = await EmployerHiringClaimVerification.findOne({ organizationId: organization._id, interviewId: interview._id });
      if (!winner) {
        throw new ApiError(409, 'Claim evidence alignment is already being prepared — please try again shortly');
      }
      return this.handleExisting(winner, organization, interview, actingRole);
    }

    return this.generate(claimed, organization, interview, actingRole);
  }

  private async generate(
    claimed: IEmployerHiringClaimVerification,
    organization: IOrganization,
    interview: IInterview,
    actingRole: OrganizationMemberRole
  ): Promise<Record<string, unknown>> {
    try {
      const answeredQuestions = interview.questions
        .map((q, index) => ({ index, questionText: q.questionText, answerText: q.answerText, evaluation: q.evaluation }))
        .filter((q) => q.answerText && q.answerText.trim().length > 0);

      const { promptSources, allowedSourceIds } = await this.resolveEvidenceSources(organization, interview, actingRole);

      const prompt = this.buildPrompt(answeredQuestions, promptSources);
      const result = await getAIService().generateStructured<unknown>(
        { prompt, temperature: 0.2, maxTokens: 3000 },
        { interviewId: interview._id.toString(), operation: 'hiring-claim-evidence-alignment' }
      );

      const validQuestionIndexes = new Set(answeredQuestions.map((q) => q.index));
      const { claims, limitations } = this.validateResult(result.data, validQuestionIndexes, allowedSourceIds);
      const summary = this.computeSummary(claims);
      const aiUsage = this.computeUsage(result.metadata);

      const updated = await EmployerHiringClaimVerification.findOneAndUpdate(
        { _id: claimed._id },
        { $set: { status: 'completed', claims, summary, limitations, aiUsage }, $unset: { errorMessage: 1 } },
        { new: true }
      );
      return this.toDetail(updated!);
    } catch (error) {
      await EmployerHiringClaimVerification.updateOne(
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
   * Structured evidence may be PARTIALLY unavailable — every source below
   * is optional; `unverifiable` is used where a source is missing. Never
   * requires every source type, never auto-generates 26C. Resume input is
   * minimized to skills/experience roles-titles-dates/education/projects —
   * never contact details, never raw resume text.
   */
  private async resolveEvidenceSources(
    organization: IOrganization,
    interview: IInterview,
    actingRole: OrganizationMemberRole
  ): Promise<{ promptSources: Record<string, unknown>; allowedSourceIds: Map<EmployerHiringClaimEvidenceSourceType, AllowedSource> }> {
    const allowedSourceIds = new Map<EmployerHiringClaimEvidenceSourceType, AllowedSource>();
    const promptSources: Record<string, unknown> = {};

    if (interview.employerCandidateId) {
      const resumeAnalysis = await employerCandidateResumeAnalysisService.getCurrentAnalysis(
        organization._id.toString(),
        actingRole,
        interview.employerCandidateId.toString()
      );
      const profile = resumeAnalysis && (resumeAnalysis as any).status === 'completed' ? (resumeAnalysis as any).profile : null;
      if (resumeAnalysis && profile) {
        allowedSourceIds.set('resume', { id: (resumeAnalysis as any).id, summaryForPrompt: null });
        promptSources.resume = {
          skills: profile.skills ?? [],
          toolsTechnologies: profile.toolsTechnologies ?? [],
          experience: (profile.experience ?? []).map((e: any) => ({
            title: e.title,
            company: e.company,
            startDate: e.startDate,
            endDate: e.endDate,
            isCurrent: e.isCurrent,
            responsibilities: e.responsibilities,
            achievements: e.achievements,
            technologies: e.technologies,
          })),
          education: (profile.education ?? []).map((e: any) => ({ institution: e.institution, degree: e.degree, field: e.field })),
          projects: (profile.projects ?? []).map((p: any) => ({ name: p.name, description: p.description, technologies: p.technologies })),
          certifications: profile.certifications ?? [],
        };
      }
    }

    if (interview.employerApplicationId) {
      const screening = await employerCandidateScreeningService.getCurrentScreening(
        organization._id.toString(),
        actingRole,
        interview.employerApplicationId.toString()
      );
      if (screening && (screening as any).status === 'completed' && (screening as any).result) {
        allowedSourceIds.set('screening', { id: (screening as any).id, summaryForPrompt: null });
        promptSources.screening = (screening as any).result;
      }
    }

    const assessmentResult = await EmployerHiringAssessmentResult.findOne({ organizationId: organization._id, interviewId: interview._id })
      .select('_id result')
      .lean();
    if (assessmentResult) {
      allowedSourceIds.set('assessment', { id: assessmentResult._id.toString(), summaryForPrompt: null });
      promptSources.assessmentResult = assessmentResult.result;
    }

    const evidenceMatrix = await EmployerHiringEvidenceMatrix.findOne({ organizationId: organization._id, interviewId: interview._id })
      .select('_id matrix')
      .lean();
    if (evidenceMatrix) {
      allowedSourceIds.set('evidence_matrix', { id: evidenceMatrix._id.toString(), summaryForPrompt: null });
      promptSources.evidenceMatrix = evidenceMatrix.matrix;
    }

    // 26C is OPTIONAL enrichment only — read if already completed, never generated here.
    const consistency = await EmployerHiringAssessmentConsistency.findOne({
      organizationId: organization._id,
      interviewId: interview._id,
      status: 'completed',
    })
      .select('_id findings overallConsistency')
      .lean();
    if (consistency) {
      allowedSourceIds.set('consistency', { id: consistency._id.toString(), summaryForPrompt: null });
      promptSources.consistency = { overallConsistency: consistency.overallConsistency, findings: consistency.findings };
    }

    return { promptSources, allowedSourceIds };
  }

  /**
   * Strict, non-coaching, JSON-only prompt. Sends ONLY question+answer
   * material and MINIMIZED structured evidence fields already resolved
   * above — never candidate contact details, recruiter notes, decision
   * logs, communication history, or anything from outside this hiring
   * chain.
   */
  private buildPrompt(
    answeredQuestions: Array<{ index: number; questionText: string; answerText?: string; evaluation?: any }>,
    promptSources: Record<string, unknown>
  ): string {
    const compactQuestions = answeredQuestions.map((q) => ({
      questionIndex: q.index,
      questionText: q.questionText,
      answerText: q.answerText,
    }));

    return `You are checking whether important claims a candidate made in a hiring assessment ALIGN with structured evidence ALREADY available internally. This is production hiring infrastructure, NOT coaching — do not address the candidate.

STRICT RULES:
- Evaluate EVIDENCE ALIGNMENT ONLY. Do not determine truthfulness, deception, dishonesty, fraud, intent, character, or protected attributes.
- Lack of evidence is NOT proof that a claim is false.
- Extract AT MOST 20 meaningful, concrete claims from the answers below — prioritize claims about experience, skill usage, projects, responsibility, achievements, education/domain facts. Avoid trivial conversational statements.
- Each claim needs: "questionIndex" (which answer it came from), "claimSummary" (concise paraphrase grounded in the answer, max ~300 chars, never invent facts), "category" (one of: experience, skill, project, responsibility, achievement, education, domain, other), "alignment" (one of: supported, partially_supported, unsupported, conflicting, unverifiable).
- "supported": a structured source below clearly supports the claim. "partially_supported": some material support exists but the claim is broader/stronger than the evidence. "unsupported": no supporting structured evidence was found, but nothing conflicts either — this does NOT mean the claim is false. "conflicting": a structured source materially conflicts with the claim — this does NOT mean the candidate is lying. "unverifiable": the available internal sources cannot evaluate this claim at all.
- For each claim, list "evidenceSources": each with "type" (one of: resume, screening, assessment, evidence_matrix, consistency — ONLY use a type that actually appears in the STRUCTURED EVIDENCE SOURCES below) and a short "evidenceSummary" (max ~350 chars) explaining what that source shows. Omit evidenceSources entirely if alignment is "unverifiable" and nothing applies.
- Optional "limitation": one short sentence if there's a genuine caveat for this specific claim.
- JSON only — no prose, no markdown code fences, no explanation.

ANSWERED QUESTIONS:
${JSON.stringify(compactQuestions)}

STRUCTURED EVIDENCE SOURCES AVAILABLE (only these types are usable — a source that is absent below was not available and should make relevant claims "unverifiable" or "unsupported"):
${JSON.stringify(promptSources)}

Return ONLY a single JSON object with EXACTLY this shape:
{
  "claims": [
    {
      "questionIndex": number,
      "claimSummary": string,
      "category": string,
      "alignment": string,
      "evidenceSources": [ { "type": string, "evidenceSummary": string } ],
      "limitation": string
    }
  ],
  "limitations": string[]
}

Return JSON only.`;
  }

  /**
   * Strict, defensive normalization of untrusted AI JSON. Every
   * evidenceSources entry's "type" must be one of the ACTUALLY resolved
   * source types for this exact interview (`allowedSourceIds`) — the
   * server pins the real `sourceArtifactId` itself; it never trusts an id
   * from AI output, and drops any source reference to a type that wasn't
   * actually resolved. Claim ids are assigned deterministically by the
   * server (never trusted from AI). Summary counts are computed
   * server-side from the validated claims below, never trusted from AI.
   */
  private validateResult(
    data: unknown,
    validQuestionIndexes: Set<number>,
    allowedSourceIds: Map<EmployerHiringClaimEvidenceSourceType, AllowedSource>
  ): { claims: IVerifiedClaim[]; limitations: string[] } {
    const source = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
    const rawClaims = source && Array.isArray(source.claims) ? (source.claims as unknown[]) : null;
    if (!rawClaims) {
      throw new ApiError(502, 'Claim evidence alignment was structurally invalid');
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

    const claims: IVerifiedClaim[] = [];
    let claimSeq = 1;
    for (const raw of rawClaims) {
      if (claims.length >= MAX_CLAIMS) break;
      const item = asObject(raw);

      const questionIndex = typeof item.questionIndex === 'number' && validQuestionIndexes.has(item.questionIndex) ? item.questionIndex : null;
      const claimSummary = typeof item.claimSummary === 'string' ? item.claimSummary.trim().slice(0, MAX_CLAIM_SUMMARY_LENGTH) : '';
      const category = ALLOWED_CATEGORIES.includes(item.category as EmployerHiringClaimCategory) ? (item.category as EmployerHiringClaimCategory) : null;
      const alignment = ALLOWED_ALIGNMENTS.includes(item.alignment as EmployerHiringClaimAlignment)
        ? (item.alignment as EmployerHiringClaimAlignment)
        : null;
      if (questionIndex === null || !claimSummary || !category || !alignment) continue;

      const rawSources = Array.isArray(item.evidenceSources) ? (item.evidenceSources as unknown[]) : [];
      const evidenceSources: IClaimEvidenceSource[] = [];
      for (const srcRaw of rawSources) {
        if (evidenceSources.length >= MAX_SOURCES_PER_CLAIM) break;
        const srcItem = asObject(srcRaw);
        const type = ALLOWED_SOURCE_TYPES.includes(srcItem.type as EmployerHiringClaimEvidenceSourceType)
          ? (srcItem.type as EmployerHiringClaimEvidenceSourceType)
          : null;
        if (!type) continue;
        const allowed = allowedSourceIds.get(type);
        if (!allowed) continue; // this source type was never actually resolved for this interview — dropped defensively
        const evidenceSummary =
          typeof srcItem.evidenceSummary === 'string' ? srcItem.evidenceSummary.trim().slice(0, MAX_EVIDENCE_SUMMARY_LENGTH) : '';
        if (!evidenceSummary) continue;
        evidenceSources.push({ type, sourceArtifactId: new Types.ObjectId(allowed.id), evidenceSummary });
      }

      const limitation = typeof item.limitation === 'string' ? item.limitation.trim().slice(0, MAX_LIMITATION_LENGTH) || undefined : undefined;

      claims.push({
        claimId: `c${claimSeq++}`,
        questionIndex,
        claimSummary,
        category,
        alignment,
        evidenceSources,
        limitation,
      });
    }

    return { claims, limitations: asStringArray(source?.limitations, MAX_LIMITATIONS) };
  }

  private computeSummary(claims: IVerifiedClaim[]): {
    totalClaims: number;
    supported: number;
    partiallySupported: number;
    unsupported: number;
    conflicting: number;
    unverifiable: number;
  } {
    return {
      totalClaims: claims.length,
      supported: claims.filter((c) => c.alignment === 'supported').length,
      partiallySupported: claims.filter((c) => c.alignment === 'partially_supported').length,
      unsupported: claims.filter((c) => c.alignment === 'unsupported').length,
      conflicting: claims.filter((c) => c.alignment === 'conflicting').length,
      unverifiable: claims.filter((c) => c.alignment === 'unverifiable').length,
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
    return 'Claim evidence alignment generation failed';
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

  private toDetail(doc: IEmployerHiringClaimVerification): Record<string, unknown> {
    if (doc.status !== 'completed') {
      return { generated: false, status: doc.status, errorMessage: doc.status === 'failed' ? doc.errorMessage : undefined };
    }
    return {
      generated: true,
      claims: doc.claims,
      summary: doc.summary,
      limitations: doc.limitations,
      generatedAt: doc.updatedAt,
    };
  }
}

export const employerHiringClaimVerificationService = new EmployerHiringClaimVerificationService();
export default employerHiringClaimVerificationService;
