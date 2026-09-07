import Organization, { IOrganization } from '../models/Organization.model';
import Interview, { IInterview } from '../models/interview.model';
import { InterviewPurpose } from '../constants/interview';
import EmployerInterviewCompetencyRubric from '../models/EmployerInterviewCompetencyRubric.model';
import EmployerCodingQuestion, { IEmployerCodingQuestion } from '../models/EmployerCodingQuestion.model';
import EmployerCodingSubmission, { IEmployerCodingSubmission } from '../models/EmployerCodingSubmission.model';
import EmployerCodingExecution, { IEmployerCodingExecution } from '../models/EmployerCodingExecution.model';
import EmployerCodingEvaluation, {
  IEmployerCodingEvaluation,
  IEmployerCodingEvaluationAIUsage,
  ICodingCompetencyEvidence,
  CorrectnessAssessment,
  QualityLevel,
  CompetencyEvidenceState,
} from '../models/EmployerCodingEvaluation.model';
import { getAIService } from '../ai';
import type { AIResponseMetadata } from '../ai';
import { getModelPricing } from '../config/openaiPricing';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const EVALUATION_VERSION = 'coding-evaluation-v1';
const QUALITY_LEVELS: QualityLevel[] = ['strong', 'sufficient', 'limited', 'insufficient'];
const CORRECTNESS_LEVELS: CorrectnessAssessment[] = ['strong', 'sufficient', 'partial', 'insufficient'];
const EVIDENCE_STATES: CompetencyEvidenceState[] = ['strong', 'sufficient', 'partial', 'insufficient', 'not_observed'];
const MAX_LIST_ITEMS = 6;
const MAX_STRING_LENGTH = 300;
const MAX_SAMPLE_OUTCOMES = 10;

function round(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}

/**
 * Employer-internal AI evaluation of ONE submitted coding attempt (30D) —
 * built from the 30A problem definition, the candidate's own source code,
 * and the DETERMINISTIC 30C execution results. AI NEVER executes code;
 * `correctness.executionPassPercent` is always taken verbatim from 30C and
 * never trusted from the model. Never a numeric overall coding score,
 * never a hiring recommendation, never exposed to any candidate/public
 * API.
 */
export class EmployerCodingEvaluationService {
  /** POST .../coding-submissions/:submissionId/evaluate — requires INTERVIEWS_MANAGE. */
  async generateEvaluation(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    interviewId: string,
    submissionId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const { interview, submission, execution, question } = await this.resolveEligibility(organization, interviewId, submissionId);

    const existing = await EmployerCodingEvaluation.findOne({ organizationId: organization._id, submissionId: submission._id });
    if (existing) {
      return this.handleExisting(existing, organization, interview, submission, execution, question);
    }

    return this.claimAndGenerate(organization, interview, submission, execution, question);
  }

  /** GET .../coding-submissions/:submissionId/evaluate — requires ORGANIZATION_VIEW. Read-only; never generates. */
  async getEvaluation(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    interviewId: string,
    submissionId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const submission = await EmployerCodingSubmission.findOne({ _id: submissionId, organizationId: organization._id, interviewId }).select('_id');
    if (!submission) {
      throw new ApiError(404, 'Submission not found');
    }

    const doc = await EmployerCodingEvaluation.findOne({ organizationId: organization._id, submissionId: submission._id });
    if (!doc) {
      return { evaluated: false };
    }
    return this.toDetail(doc);
  }

  private async resolveEligibility(
    organization: IOrganization,
    interviewId: string,
    submissionId: string
  ): Promise<{ interview: IInterview; submission: IEmployerCodingSubmission; execution: IEmployerCodingExecution; question: IEmployerCodingQuestion }> {
    const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id });
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }

    const submission = await EmployerCodingSubmission.findOne({ _id: submissionId, organizationId: organization._id, interviewId: interview._id });
    if (!submission) {
      throw new ApiError(404, 'Submission not found');
    }
    if (submission.status !== 'executed') {
      throw new ApiError(409, 'This submission has not been successfully executed yet.');
    }
    if (!submission.sourceCode || submission.sourceCode.trim().length === 0) {
      throw new ApiError(409, 'This submission has no source code.');
    }

    const execution = await EmployerCodingExecution.findOne({ organizationId: organization._id, submissionId: submission._id });
    if (!execution || execution.status !== 'completed') {
      throw new ApiError(409, 'This submission does not have a completed execution yet.');
    }

    const question = await EmployerCodingQuestion.findOne({ _id: submission.codingQuestionId, organizationId: organization._id });
    if (!question) {
      throw new ApiError(404, 'Coding question not found');
    }

    return { interview, submission, execution, question };
  }

  private async handleExisting(
    existing: IEmployerCodingEvaluation,
    organization: IOrganization,
    interview: IInterview,
    submission: IEmployerCodingSubmission,
    execution: IEmployerCodingExecution,
    question: IEmployerCodingQuestion
  ): Promise<Record<string, unknown>> {
    if (existing.status === 'completed') {
      return this.toDetail(existing);
    }
    if (existing.status === 'processing') {
      throw new ApiError(409, 'Coding evaluation is already being prepared — please try again shortly');
    }

    const reclaimed = await EmployerCodingEvaluation.findOneAndUpdate(
      { _id: existing._id, status: 'failed' },
      { $set: { status: 'processing' }, $unset: { errorMessage: 1 } },
      { new: true }
    );
    if (!reclaimed) {
      const refetched = await EmployerCodingEvaluation.findById(existing._id);
      if (refetched?.status === 'completed') {
        return this.toDetail(refetched);
      }
      throw new ApiError(409, 'Coding evaluation is already being prepared — please try again shortly');
    }

    return this.generate(reclaimed, organization, interview, submission, execution, question);
  }

  private async claimAndGenerate(
    organization: IOrganization,
    interview: IInterview,
    submission: IEmployerCodingSubmission,
    execution: IEmployerCodingExecution,
    question: IEmployerCodingQuestion
  ): Promise<Record<string, unknown>> {
    let claimed: IEmployerCodingEvaluation;
    try {
      claimed = await EmployerCodingEvaluation.create({
        organizationId: organization._id,
        applicationId: submission.applicationId,
        interviewId: interview._id,
        codingSessionId: submission.codingSessionId,
        codingQuestionId: question._id,
        submissionId: submission._id,
        executionId: execution._id,
        status: 'processing',
        evaluationVersion: EVALUATION_VERSION,
      });
    } catch (error: any) {
      if (error?.code !== 11000) {
        throw error;
      }
      const winner = await EmployerCodingEvaluation.findOne({ organizationId: organization._id, submissionId: submission._id });
      if (!winner) {
        throw new ApiError(409, 'Coding evaluation is already being prepared — please try again shortly');
      }
      return this.handleExisting(winner, organization, interview, submission, execution, question);
    }

    return this.generate(claimed, organization, interview, submission, execution, question);
  }

  private async generate(
    claimed: IEmployerCodingEvaluation,
    organization: IOrganization,
    interview: IInterview,
    submission: IEmployerCodingSubmission,
    execution: IEmployerCodingExecution,
    question: IEmployerCodingQuestion
  ): Promise<Record<string, unknown>> {
    try {
      const relevantRubric = await this.loadRelevantRubric(organization, interview, question);

      const prompt = this.buildPrompt(question, submission, execution, relevantRubric);
      const result = await getAIService().generateStructured<unknown>(
        { prompt, temperature: 0.2, maxTokens: 2000 },
        { interviewId: interview._id.toString(), operation: 'hiring-coding-evaluation' }
      );

      const passPercent = execution.summary?.passPercent ?? 0;
      const validated = this.validateEvaluation(result.data, passPercent, question.competencyNames);
      const aiUsage = this.computeUsage(result.metadata);

      const updated = await EmployerCodingEvaluation.findOneAndUpdate(
        { _id: claimed._id },
        {
          $set: {
            status: 'completed',
            correctness: validated.correctness,
            codeQuality: validated.codeQuality,
            reasoning: validated.reasoning,
            strengths: validated.strengths,
            concerns: validated.concerns,
            evidence: validated.evidence,
            competencyEvidence: validated.competencyEvidence,
            summary: validated.summary,
            aiUsage,
            evaluatedAt: new Date(),
          },
          $unset: { errorMessage: 1 },
        },
        { new: true }
      );
      return this.toDetail(updated!);
    } catch (error) {
      await EmployerCodingEvaluation.updateOne(
        { _id: claimed._id },
        { $set: { status: 'failed', errorMessage: this.safeErrorMessage(error) } }
      );
      throw error;
    }
  }

  /** Same rubric-relevance derivation as every other hiring-assessment evaluation prompt in this codebase — only when interview-linked and a rubric exists; job-level questions simply omit it. */
  private async loadRelevantRubric(
    organization: IOrganization,
    interview: IInterview,
    question: IEmployerCodingQuestion
  ): Promise<Array<{ competencyName: string; evidenceSignals: string[]; scoringAnchors: unknown }>> {
    if (!interview.employerRubricId || question.competencyNames.length === 0) return [];
    const rubric = await EmployerInterviewCompetencyRubric.findOne({ _id: interview.employerRubricId, organizationId: organization._id });
    if (!rubric) return [];
    const competencySet = new Set(question.competencyNames);
    return rubric.rubric.competencies
      .filter((c) => competencySet.has(c.competencyName))
      .map((c) => ({ competencyName: c.competencyName, evidenceSignals: c.evidenceSignals, scoringAnchors: c.scoringAnchors }));
  }

  /**
   * Strict, non-coaching, JSON-only prompt. Sends ONLY the question
   * definition, the candidate's own source code, a SANITIZED execution
   * summary, and safe per-test outcome metadata. Sample test IO is
   * candidate-visible already and included for context; hidden tests are
   * reduced to bare pass/fail/error/timeout COUNTS — never their
   * input/expected/actual output.
   */
  private buildPrompt(
    question: IEmployerCodingQuestion,
    submission: IEmployerCodingSubmission,
    execution: IEmployerCodingExecution,
    relevantRubric: Array<{ competencyName: string; evidenceSignals: string[]; scoringAnchors: unknown }>
  ): string {
    const sampleOutcomes = execution.results
      .filter((r) => r.type === 'sample')
      .slice(0, MAX_SAMPLE_OUTCOMES)
      .map((r) => ({ status: r.status, actualOutput: r.actualOutput?.slice(0, 500), errorMessage: r.errorMessage }));

    const hiddenResults = execution.results.filter((r) => r.type === 'hidden');
    const hiddenOutcomeCounts = {
      passed: hiddenResults.filter((r) => r.status === 'passed').length,
      failed: hiddenResults.filter((r) => r.status === 'failed').length,
      runtimeError: hiddenResults.filter((r) => r.status === 'runtime_error').length,
      timeout: hiddenResults.filter((r) => r.status === 'timeout').length,
    };

    return `You are evaluating ONE candidate's submitted CODE for a hiring-assessment coding question. This is production hiring infrastructure, NOT coaching — do not address the candidate, do not give tips or encouragement. You do NOT execute code; deterministic test execution has already happened and its results are authoritative for pass/fail. Never claim the code passed a test it failed.

STRICT RULES:
- Deterministic execution results (below) are authoritative for correctness — you are assessing OBSERVABLE code quality/reasoning, not re-judging pass/fail.
- Do NOT infer personality, intelligence, or cultural fit. Do NOT compare this candidate to anyone else. Do NOT produce a hiring recommendation.
- Absence of demonstrated evidence for a competency means "not_observed" — never guess.
- Do not penalize subjective style preferences (naming conventions, formatting) as correctness issues.
- "competencyEvidence" entries must use ONLY the exact competency names listed in "targetCompetencies" below — one entry per name.
- All evidence must be grounded in the actual submitted source code — never invented.
- JSON only — no prose, no markdown code fences, no explanation.

CODING QUESTION:
Title: ${question.title}
Description: ${question.description}
Constraints: ${JSON.stringify(question.constraints)}
Function signature: ${JSON.stringify(question.functionSignature)}

CANDIDATE LANGUAGE: ${submission.language}

CANDIDATE SOURCE CODE:
${submission.sourceCode.slice(0, 20000)}

DETERMINISTIC EXECUTION SUMMARY (authoritative — you cannot change this):
${JSON.stringify(execution.summary)}

SAMPLE TEST OUTCOMES (candidate-visible tests only):
${JSON.stringify(sampleOutcomes)}

HIDDEN TEST OUTCOME COUNTS ONLY (never shown their input/output to you or the candidate):
${JSON.stringify(hiddenOutcomeCounts)}

TARGET COMPETENCIES (evaluate ONLY these, exactly once each):
${JSON.stringify(question.competencyNames)}

RELEVANT RUBRIC EXPECTATIONS (internal calibration only, may be empty):
${JSON.stringify(relevantRubric)}

Return ONLY a single JSON object with EXACTLY this shape:
{
  "correctness": { "assessment": "strong" | "sufficient" | "partial" | "insufficient" },
  "codeQuality": {
    "readability": "strong" | "sufficient" | "limited" | "insufficient",
    "maintainability": "strong" | "sufficient" | "limited" | "insufficient",
    "structure": "strong" | "sufficient" | "limited" | "insufficient"
  },
  "reasoning": {
    "algorithmChoice": "strong" | "sufficient" | "limited" | "insufficient",
    "complexityAwareness": "strong" | "sufficient" | "limited" | "insufficient",
    "edgeCaseHandling": "strong" | "sufficient" | "limited" | "insufficient"
  },
  "strengths": string[],
  "concerns": string[],
  "evidence": string[],
  "competencyEvidence": [
    { "competencyName": string, "evidenceState": "strong" | "sufficient" | "partial" | "insufficient" | "not_observed", "evidence": string[] }
  ],
  "summary": string
}

Return JSON only.`;
  }

  /**
   * Strict, defensive normalization of untrusted AI JSON.
   * `correctness.executionPassPercent` is ALWAYS the server-computed 30C
   * value, never read from the model; `correctness.assessment` is clamped
   * so a low pass rate cannot be reported as "strong" (or better than the
   * pass rate plausibly supports). Every target competency appears exactly
   * once — missing ones default to "not_observed"; unknown AI-reported
   * competency names are dropped.
   */
  private validateEvaluation(
    data: unknown,
    executionPassPercent: number,
    targetCompetencyNames: string[]
  ): {
    correctness: { executionPassPercent: number; assessment: CorrectnessAssessment };
    codeQuality: { readability: QualityLevel; maintainability: QualityLevel; structure: QualityLevel };
    reasoning: { algorithmChoice: QualityLevel; complexityAwareness: QualityLevel; edgeCaseHandling: QualityLevel };
    strengths: string[];
    concerns: string[];
    evidence: string[];
    competencyEvidence: ICodingCompetencyEvidence[];
    summary: string;
  } {
    const source = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
    if (!source) {
      throw new ApiError(502, 'Coding evaluation was structurally invalid');
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
    const asQualityLevel = (value: unknown, fallback: QualityLevel = 'insufficient'): QualityLevel =>
      QUALITY_LEVELS.includes(value as QualityLevel) ? (value as QualityLevel) : fallback;

    const correctnessRaw = asObject(source.correctness);
    const aiAssessment = CORRECTNESS_LEVELS.includes(correctnessRaw.assessment as CorrectnessAssessment)
      ? (correctnessRaw.assessment as CorrectnessAssessment)
      : 'insufficient';
    const assessment = this.clampCorrectnessAssessment(aiAssessment, executionPassPercent);

    const codeQualityRaw = asObject(source.codeQuality);
    const codeQuality = {
      readability: asQualityLevel(codeQualityRaw.readability),
      maintainability: asQualityLevel(codeQualityRaw.maintainability),
      structure: asQualityLevel(codeQualityRaw.structure),
    };

    const reasoningRaw = asObject(source.reasoning);
    const reasoning = {
      algorithmChoice: asQualityLevel(reasoningRaw.algorithmChoice),
      complexityAwareness: asQualityLevel(reasoningRaw.complexityAwareness),
      edgeCaseHandling: asQualityLevel(reasoningRaw.edgeCaseHandling),
    };

    const rawCompetencyEvidence = Array.isArray(source.competencyEvidence) ? (source.competencyEvidence as unknown[]) : [];
    const evidenceByName = new Map<string, ICodingCompetencyEvidence>();
    const allowedNames = new Set(targetCompetencyNames);
    for (const raw of rawCompetencyEvidence) {
      const item = asObject(raw);
      const competencyName = typeof item.competencyName === 'string' ? item.competencyName.trim() : '';
      if (!competencyName || !allowedNames.has(competencyName) || evidenceByName.has(competencyName)) continue;
      const evidenceState = EVIDENCE_STATES.includes(item.evidenceState as CompetencyEvidenceState)
        ? (item.evidenceState as CompetencyEvidenceState)
        : 'not_observed';
      evidenceByName.set(competencyName, {
        competencyName,
        evidenceState,
        evidence: asStringArray(item.evidence, MAX_LIST_ITEMS),
      });
    }
    const competencyEvidence: ICodingCompetencyEvidence[] = targetCompetencyNames.map(
      (name) => evidenceByName.get(name) ?? { competencyName: name, evidenceState: 'not_observed', evidence: [] }
    );

    const summary = typeof source.summary === 'string' ? source.summary.trim().slice(0, 800) : '';

    return {
      correctness: { executionPassPercent, assessment },
      codeQuality,
      reasoning,
      strengths: asStringArray(source.strengths, MAX_LIST_ITEMS),
      concerns: asStringArray(source.concerns, MAX_LIST_ITEMS),
      evidence: asStringArray(source.evidence, MAX_LIST_ITEMS),
      competencyEvidence,
      summary,
    };
  }

  /**
   * Simple, transparent consistency guard (30D section 14) — a low
   * deterministic pass rate cannot be reported as a strong correctness
   * assessment, regardless of what the model said.
   */
  private clampCorrectnessAssessment(aiAssessment: CorrectnessAssessment, executionPassPercent: number): CorrectnessAssessment {
    const order: CorrectnessAssessment[] = ['insufficient', 'partial', 'sufficient', 'strong'];
    let maxAllowed: CorrectnessAssessment;
    if (executionPassPercent <= 0) {
      maxAllowed = 'insufficient';
    } else if (executionPassPercent < 50) {
      maxAllowed = 'partial';
    } else if (executionPassPercent < 90) {
      maxAllowed = 'sufficient';
    } else {
      maxAllowed = 'strong';
    }
    const aiIndex = order.indexOf(aiAssessment);
    const maxIndex = order.indexOf(maxAllowed);
    return order[Math.min(aiIndex, maxIndex)];
  }

  /** Reuses the SAME shared pricing config/formula every other single-AI-call sprint uses — never a parallel pricing calculator. */
  private computeUsage(metadata: AIResponseMetadata): IEmployerCodingEvaluationAIUsage {
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
    return 'Coding evaluation failed';
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

  private toDetail(doc: IEmployerCodingEvaluation): Record<string, unknown> {
    if (doc.status !== 'completed') {
      return { evaluated: true, status: doc.status, errorMessage: doc.status === 'failed' ? doc.errorMessage : undefined };
    }
    return {
      evaluated: true,
      status: 'completed',
      evaluationVersion: doc.evaluationVersion,
      evaluatedAt: doc.evaluatedAt,
      correctness: doc.correctness,
      codeQuality: doc.codeQuality,
      reasoning: doc.reasoning,
      strengths: doc.strengths,
      concerns: doc.concerns,
      evidence: doc.evidence,
      competencyEvidence: doc.competencyEvidence,
      summary: doc.summary,
    };
  }
}

export const employerCodingEvaluationService = new EmployerCodingEvaluationService();
export default employerCodingEvaluationService;
