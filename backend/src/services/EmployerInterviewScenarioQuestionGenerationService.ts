import Organization, { IOrganization } from '../models/Organization.model';
import Interview from '../models/interview.model';
import { InterviewPurpose } from '../constants/interview';
import EmployerInterviewCompetencyRubric from '../models/EmployerInterviewCompetencyRubric.model';
import EmployerInterviewScenario, { IEmployerInterviewScenario } from '../models/EmployerInterviewScenario.model';
import EmployerInterviewScenarioQuestionSet, {
  IEmployerInterviewScenarioQuestionSet,
  IScenarioQuestion,
  IEmployerScenarioQuestionSetAIUsage,
  EmployerScenarioQuestionType,
  EmployerScenarioQuestionDifficulty,
} from '../models/EmployerInterviewScenarioQuestionSet.model';
import { getAIService } from '../ai';
import type { AIResponseMetadata } from '../ai';
import { getModelPricing } from '../config/openaiPricing';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const GENERATION_VERSION = 'scenario-question-generation-v1';
const MIN_QUESTIONS = 3;
const MAX_QUESTIONS = 6;
const MAX_QUESTION_TEXT_LENGTH = 1000;
const MAX_SCENARIO_UPDATE_LENGTH = 500;
const MAX_EVIDENCE_ITEMS = 6;
const MAX_STRING_LENGTH = 300;

const ALLOWED_TYPES: EmployerScenarioQuestionType[] = ['opening', 'probe', 'complication', 'decision', 'reflection'];
const ALLOWED_DIFFICULTIES: EmployerScenarioQuestionDifficulty[] = ['easy', 'medium', 'hard'];

function round(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}

/**
 * Generates a structured multi-step QUESTION PLAN for one READY 28A
 * scenario (28B) via a single AI Gateway call. Never executes the
 * scenario with a candidate, never evaluates a response, never mutates
 * the scenario source. Expected evidence stays employer-only.
 */
export class EmployerInterviewScenarioQuestionGenerationService {
  /** POST .../scenarios/:scenarioId/questions/generate — requires INTERVIEWS_MANAGE. No client rubric/application/job IDs. */
  async generateScenarioQuestions(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    interviewId: string,
    scenarioId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const scenario = await this.resolveReadyScenario(organization, interviewId, scenarioId);

    const existing = await EmployerInterviewScenarioQuestionSet.findOne({ organizationId: organization._id, scenarioId: scenario._id });
    if (existing) {
      return this.handleExisting(existing, organization, scenario);
    }

    return this.claimAndGenerate(organization, scenario);
  }

  /** GET .../scenarios/:scenarioId/questions — requires ORGANIZATION_VIEW. Read-only; never generates, never exposes raw prompt/provider response. */
  async getScenarioQuestions(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    interviewId: string,
    scenarioId: string
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

    const doc = await EmployerInterviewScenarioQuestionSet.findOne({ organizationId: organization._id, scenarioId: scenario._id });
    if (!doc) {
      return { generated: false };
    }
    return this.toDetail(doc);
  }

  private async resolveReadyScenario(organization: IOrganization, interviewId: string, scenarioId: string): Promise<IEmployerInterviewScenario> {
    const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id }).select('_id purpose');
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }
    const scenario = await EmployerInterviewScenario.findOne({ _id: scenarioId, organizationId: organization._id, interviewId: interview._id });
    if (!scenario) {
      throw new ApiError(404, 'Scenario not found');
    }
    if (scenario.status !== 'ready') {
      throw new ApiError(409, 'Scenario must be marked ready before generating questions.');
    }
    if (!scenario.targetCompetencies || scenario.targetCompetencies.length === 0) {
      throw new ApiError(409, 'Scenario has no target competencies.');
    }
    return scenario;
  }

  private async handleExisting(
    existing: IEmployerInterviewScenarioQuestionSet,
    organization: IOrganization,
    scenario: IEmployerInterviewScenario
  ): Promise<Record<string, unknown>> {
    if (existing.status === 'completed') {
      return this.toDetail(existing);
    }
    if (existing.status === 'processing') {
      throw new ApiError(409, 'Scenario questions are already being prepared — please try again shortly');
    }

    const reclaimed = await EmployerInterviewScenarioQuestionSet.findOneAndUpdate(
      { _id: existing._id, status: 'failed' },
      { $set: { status: 'processing' }, $unset: { errorMessage: 1 } },
      { new: true }
    );
    if (!reclaimed) {
      const refetched = await EmployerInterviewScenarioQuestionSet.findById(existing._id);
      if (refetched?.status === 'completed') {
        return this.toDetail(refetched);
      }
      throw new ApiError(409, 'Scenario questions are already being prepared — please try again shortly');
    }

    return this.generate(reclaimed, organization, scenario);
  }

  private async claimAndGenerate(organization: IOrganization, scenario: IEmployerInterviewScenario): Promise<Record<string, unknown>> {
    let claimed: IEmployerInterviewScenarioQuestionSet;
    try {
      claimed = await EmployerInterviewScenarioQuestionSet.create({
        organizationId: organization._id,
        applicationId: scenario.applicationId,
        interviewId: scenario.interviewId,
        scenarioId: scenario._id,
        rubricId: scenario.rubricId,
        status: 'processing',
        generationVersion: GENERATION_VERSION,
      });
    } catch (error: any) {
      if (error?.code !== 11000) {
        throw error;
      }
      const winner = await EmployerInterviewScenarioQuestionSet.findOne({ organizationId: organization._id, scenarioId: scenario._id });
      if (!winner) {
        throw new ApiError(409, 'Scenario questions are already being prepared — please try again shortly');
      }
      return this.handleExisting(winner, organization, scenario);
    }

    return this.generate(claimed, organization, scenario);
  }

  private async generate(
    claimed: IEmployerInterviewScenarioQuestionSet,
    organization: IOrganization,
    scenario: IEmployerInterviewScenario
  ): Promise<Record<string, unknown>> {
    try {
      const rubric = await EmployerInterviewCompetencyRubric.findOne({ _id: scenario.rubricId, organizationId: organization._id });
      if (!rubric) {
        throw new ApiError(409, 'Interview evaluation rubric is not ready');
      }

      const allowedCompetencyNames = new Set(scenario.targetCompetencies);
      const relevantRubric = rubric.rubric.competencies
        .filter((c) => allowedCompetencyNames.has(c.competencyName))
        .map((c) => ({ competencyName: c.competencyName, evidenceSignals: c.evidenceSignals, scoringAnchors: c.scoringAnchors }));

      const prompt = this.buildPrompt(scenario, relevantRubric);
      const result = await getAIService().generateStructured<unknown>(
        { prompt, temperature: 0.3, maxTokens: 2500 },
        { organizationId: organization._id.toString(), operation: 'hiring-scenario-question-generation' }
      );

      const { questions, summary } = this.validateQuestions(result.data, allowedCompetencyNames);
      const aiUsage = this.computeUsage(result.metadata);

      const updated = await EmployerInterviewScenarioQuestionSet.findOneAndUpdate(
        { _id: claimed._id },
        { $set: { status: 'completed', questions, summary, aiUsage, generatedAt: new Date() }, $unset: { errorMessage: 1 } },
        { new: true }
      );
      return this.toDetail(updated!);
    } catch (error) {
      await EmployerInterviewScenarioQuestionSet.updateOne(
        { _id: claimed._id },
        { $set: { status: 'failed', errorMessage: this.safeErrorMessage(error) } }
      );
      throw error;
    }
  }

  /**
   * Strict, non-coaching, JSON-only prompt. Sends ONLY the scenario's own
   * title/description/context/objectives/target-competencies and the
   * relevant rubric expectations — never candidate identity, resume,
   * screening, answers, notes, decisions, communications, or other
   * candidates.
   */
  private buildPrompt(
    scenario: IEmployerInterviewScenario,
    relevantRubric: Array<{ competencyName: string; evidenceSignals: string[]; scoringAnchors: unknown }>
  ): string {
    return `You are creating a professional multi-step workplace assessment SCENARIO question plan for a hiring interview. This is production hiring infrastructure, NOT coaching — questions must collect evidence, never coach the candidate, never reveal ideal answers, never praise/criticize, never personalize based on candidate history (there is no candidate history here).

SCENARIO:
Title: ${scenario.title}
Description: ${scenario.description}
Category: ${scenario.category}
Difficulty: ${scenario.difficulty}
Situation: ${scenario.context.situation}
Candidate role: ${scenario.context.candidateRole}
Constraints: ${JSON.stringify(scenario.context.constraints)}
Available information: ${JSON.stringify(scenario.context.availableInformation)}
Objectives: ${JSON.stringify(scenario.objectives)}

TARGET COMPETENCIES (every question's "targetCompetencies" must be a non-empty subset of this exact list):
${JSON.stringify(scenario.targetCompetencies)}

RELEVANT RUBRIC EXPECTATIONS:
${JSON.stringify(relevantRubric)}

STRICT RULES:
- Generate roughly 3-6 questions, sequenced 1..N.
- Recommended pattern (do not force every type every time): 1 opening, then probe(s), an optional complication, a decision, and an optional reflection.
- Each question must be concise, standalone (understandable within the scenario context), target at least 1 of the exact competencies listed above, and have a valid "difficulty" (easy, medium, or hard).
- No duplicate question text. No hints toward a correct answer. No rubric wording copied in as if it were the answer. No candidate evaluation language.
- Optional "scenarioUpdate" introduces a NEW condition/information before that step (e.g. "Production traffic doubles unexpectedly.") — it must NEVER contain a hidden expected answer.
- "evidenceExpected" lists what a strong response to that specific question would demonstrate — employer-only, grounded in the rubric expectations above.
- JSON only — no prose, no markdown code fences, no explanation.

Return ONLY a single JSON object with EXACTLY this shape:
{
  "questions": [
    {
      "sequence": number,
      "type": "opening" | "probe" | "complication" | "decision" | "reflection",
      "questionText": string,
      "targetCompetencies": string[],
      "evidenceExpected": string[],
      "difficulty": "easy" | "medium" | "hard",
      "scenarioUpdate": string
    }
  ]
}

Omit "scenarioUpdate" entirely when there is no new condition for that step.

Return JSON only.`;
  }

  /**
   * Strict, defensive normalization of untrusted AI JSON. Every
   * targetCompetencies entry must be an exact member of the scenario's own
   * allowed set — dropped otherwise; a question left with zero valid
   * competencies is rejected. Sequence numbers are normalized 1..N
   * server-side regardless of what the AI returned. Summary is always
   * computed server-side, never trusted from AI.
   */
  private validateQuestions(
    data: unknown,
    allowedCompetencyNames: Set<string>
  ): { questions: IScenarioQuestion[]; summary: { questionCount: number; competencyCount: number } } {
    const source = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
    const rawQuestions = source && Array.isArray(source.questions) ? (source.questions as unknown[]) : null;
    if (!rawQuestions || rawQuestions.length === 0) {
      throw new ApiError(502, 'Scenario questions were structurally invalid');
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

    const seenQuestionTexts = new Set<string>();
    const parsed: Array<Omit<IScenarioQuestion, 'sequence'>> = [];

    for (const raw of rawQuestions) {
      if (parsed.length >= MAX_QUESTIONS) break;
      const item = asObject(raw);

      const type = ALLOWED_TYPES.includes(item.type as EmployerScenarioQuestionType) ? (item.type as EmployerScenarioQuestionType) : null;
      const difficulty = ALLOWED_DIFFICULTIES.includes(item.difficulty as EmployerScenarioQuestionDifficulty)
        ? (item.difficulty as EmployerScenarioQuestionDifficulty)
        : null;
      const questionText = typeof item.questionText === 'string' ? item.questionText.trim().slice(0, MAX_QUESTION_TEXT_LENGTH) : '';
      if (!type || !difficulty || !questionText) continue;

      const dedupeKey = questionText.toLowerCase();
      if (seenQuestionTexts.has(dedupeKey)) continue;

      const targetCompetencies = asStringArray(item.targetCompetencies, 10, 200).filter((name) => allowedCompetencyNames.has(name));
      if (targetCompetencies.length === 0) continue;

      const scenarioUpdate =
        typeof item.scenarioUpdate === 'string' ? item.scenarioUpdate.trim().slice(0, MAX_SCENARIO_UPDATE_LENGTH) || undefined : undefined;

      seenQuestionTexts.add(dedupeKey);
      parsed.push({
        type,
        questionText,
        targetCompetencies,
        evidenceExpected: asStringArray(item.evidenceExpected, MAX_EVIDENCE_ITEMS),
        difficulty,
        scenarioUpdate,
      });
    }

    if (parsed.length < MIN_QUESTIONS) {
      throw new ApiError(502, 'Scenario questions were incomplete');
    }

    const questions: IScenarioQuestion[] = parsed.map((q, index) => ({ sequence: index + 1, ...q }));
    const competencyNames = new Set(questions.flatMap((q) => q.targetCompetencies));

    return {
      questions,
      summary: { questionCount: questions.length, competencyCount: competencyNames.size },
    };
  }

  /** Reuses the SAME shared pricing config/formula every other single-AI-call sprint uses — never a parallel pricing calculator. */
  private computeUsage(metadata: AIResponseMetadata): IEmployerScenarioQuestionSetAIUsage {
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
    return 'Scenario question generation failed';
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

  private toDetail(doc: IEmployerInterviewScenarioQuestionSet): Record<string, unknown> {
    if (doc.status !== 'completed') {
      return { generated: false, status: doc.status, errorMessage: doc.status === 'failed' ? doc.errorMessage : undefined };
    }
    return {
      generated: true,
      generationVersion: doc.generationVersion,
      generatedAt: doc.generatedAt,
      questions: doc.questions,
      summary: doc.summary,
    };
  }
}

export const employerInterviewScenarioQuestionGenerationService = new EmployerInterviewScenarioQuestionGenerationService();
export default employerInterviewScenarioQuestionGenerationService;
