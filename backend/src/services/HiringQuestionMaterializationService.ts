import { Types } from 'mongoose';
import Interview, { IInterview, IQuestion } from '../models/interview.model';
import { InterviewPurpose } from '../constants/interview';
import EmployerInterviewBlueprint, { IInterviewBlueprint } from '../models/EmployerInterviewBlueprint.model';
import {
  EmployerInterviewBlueprintStatus,
  EmployerInterviewBlueprintSectionCategory,
  EmployerInterviewBlueprintDifficulty,
} from '../constants/employerInterviewBlueprint';
import EmployerInterviewCompetencyRubric, { IInterviewCompetencyRubric } from '../models/EmployerInterviewCompetencyRubric.model';
import { EmployerJobCompetencyImportance } from '../constants/employerJobDescriptionCompetencies';
import { getAIService } from '../ai';
import { ApiError } from '../utils/ApiError';

const MAX_QUESTION_TEXT_LENGTH = 800; // headroom below the schema's 1000-char cap
const MIN_QUESTION_TEXT_LENGTH = 10; // matches the schema's own minlength
const MAX_EVIDENCE_ITEMS = 5;
const MAX_FOLLOWUP_ITEMS = 5;
const MAX_COMPETENCY_REFS = 6;
const MAX_SKILL_REFS = 8;
const MAX_EVALUATION_INTENT_LENGTH = 300;

interface PlannedIntentSlot {
  sectionId: string;
  sectionCompetencies: string[];
  sectionSkills: string[];
  sectionCategory: EmployerInterviewBlueprintSectionCategory;
  intent: string;
  difficulty: EmployerInterviewBlueprintDifficulty;
}

/**
 * Converts a COMPLETED 20A blueprint's question-plan intents into real,
 * candidate-facing questions for an existing 20E hiring-assessment
 * Interview session (21A) — reuses the existing `Interview.questions`
 * array, never a parallel assessment engine. Deliberately isolated from
 * every practice/coaching question-generation path in this file: no shared
 * prompt, no shared validation helper, a distinct AI operation label, and
 * `purpose` is asserted on every entry point. Materializes questions
 * exactly once per interview — the interview document itself (via its
 * `questions` array + `questionMaterializationStatus`) is the sole
 * authoritative concurrency claim. Never evaluates answers, never
 * generates follow-up questions dynamically, never marks the interview
 * started, never touches EmployerJobApplication status or any credit
 * ledger.
 */
export class HiringQuestionMaterializationService {
  /**
   * Idempotent: an already-materialized interview (non-empty `questions`,
   * or `questionMaterializationStatus === 'completed'`) is returned as-is
   * with no new AI call. A concurrent caller that loses the atomic claim
   * gets a 409 while generation is in flight, or safely observes the
   * winner's result once it lands.
   */
  async materialize(organizationId: string, interviewId: string): Promise<IInterview> {
    const interview = await this.loadInterview(organizationId, interviewId);

    if (interview.questions.length > 0 || interview.questionMaterializationStatus === 'completed') {
      return interview;
    }

    const blueprintDoc = await this.loadBlueprint(interview);
    const rubricDoc = await this.loadRubric(interview);
    const blueprint = blueprintDoc.blueprint as IInterviewBlueprint;
    const rubric = rubricDoc.rubric;

    // Atomic claim — the interview itself is the concurrency guard. Only
    // the caller that flips pending/failed/unset -> processing may
    // generate; every other concurrent caller falls through below.
    const claimed = await Interview.findOneAndUpdate(
      {
        _id: interview._id,
        purpose: InterviewPurpose.HIRING_ASSESSMENT,
        questions: { $size: 0 },
        questionMaterializationStatus: { $in: [null, 'pending', 'failed'] },
      },
      { $set: { questionMaterializationStatus: 'processing' } },
      { new: true }
    );

    if (!claimed) {
      const current = await Interview.findById(interview._id);
      if (!current) {
        throw new ApiError(404, 'Interview session not found');
      }
      if (current.questions.length > 0 || current.questionMaterializationStatus === 'completed') {
        return current;
      }
      throw new ApiError(409, 'Interview questions are already being prepared — please try again shortly');
    }

    try {
      const plannedIntents = this.buildPlannedIntents(blueprint, claimed.totalQuestions);
      if (plannedIntents.length === 0) {
        throw new ApiError(502, 'Interview blueprint has no usable question plan');
      }

      const prompt = this.buildPrompt(blueprint, rubric, plannedIntents);
      const result = await getAIService().generateStructured<unknown>(
        { prompt, temperature: 0.2, maxTokens: 4000 },
        { interviewId: claimed._id.toString(), operation: 'hiring-question-materialization' }
      );

      const questions = this.validateAndBuildQuestions(result.data, plannedIntents, blueprint, rubric);

      claimed.questions = questions;
      claimed.questionMaterializationStatus = 'completed';
      await claimed.save();

      return claimed;
    } catch (error) {
      await Interview.updateOne({ _id: claimed._id }, { $set: { questionMaterializationStatus: 'failed' } });
      throw error;
    }
  }

  /** Read-only lookup for GET flows — no claim, no AI. */
  async getState(organizationId: string, interviewId: string): Promise<IInterview> {
    return this.loadInterview(organizationId, interviewId);
  }

  private async loadInterview(organizationId: string, interviewId: string): Promise<IInterview> {
    const interview = await Interview.findOne({ _id: interviewId, organizationId: new Types.ObjectId(organizationId) });
    if (!interview) {
      throw new ApiError(404, 'Interview session not found');
    }
    if (interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(400, 'This interview session is not a hiring assessment');
    }
    return interview;
  }

  /** Re-derived from the interview's OWN `employerBlueprintId` — never trusts any id from the caller. */
  private async loadBlueprint(interview: IInterview) {
    const blueprint = await EmployerInterviewBlueprint.findOne({
      _id: interview.employerBlueprintId,
      organizationId: interview.organizationId,
    });
    if (!blueprint || blueprint.status !== EmployerInterviewBlueprintStatus.COMPLETED || !blueprint.blueprint) {
      throw new ApiError(409, 'Interview blueprint is not ready');
    }
    return blueprint;
  }

  /** Re-derived from the interview's OWN `employerRubricId` — never trusts any id from the caller. */
  private async loadRubric(interview: IInterview) {
    const rubric = await EmployerInterviewCompetencyRubric.findOne({
      _id: interview.employerRubricId,
      organizationId: interview.organizationId,
    });
    if (!rubric) {
      throw new ApiError(409, 'Interview evaluation rubric is not ready');
    }
    return rubric;
  }

  /** Flattens the blueprint's sections into one planned slot per question-plan intent, in section order, capped to the interview's own `totalQuestions`. */
  private buildPlannedIntents(blueprint: IInterviewBlueprint, totalQuestionsCap: number): PlannedIntentSlot[] {
    const slots: PlannedIntentSlot[] = [];
    for (const section of blueprint.sections) {
      for (const item of section.questionPlan) {
        slots.push({
          sectionId: section.id,
          sectionCompetencies: section.competencies,
          sectionSkills: section.skills,
          sectionCategory: section.category,
          intent: item.intent,
          difficulty: item.difficulty,
        });
      }
    }
    return slots.slice(0, Math.max(0, totalQuestionsCap));
  }

  /**
   * Strict, non-coaching, JSON-only prompt — deliberately distinct from
   * every practice-interview prompt in this codebase. `sectionId`/
   * `category` are never requested from the model: they are assigned
   * deterministically by the server from the planned slot's own position
   * ("index"), so the model only supplies question text and evaluation
   * metadata for a slot the server already knows the identity of.
   */
  private buildPrompt(blueprint: IInterviewBlueprint, rubric: IInterviewCompetencyRubric, slots: PlannedIntentSlot[]): string {
    const compactIntents = slots.map((slot, index) => ({
      index,
      sectionTitle: blueprint.sections.find((s) => s.id === slot.sectionId)?.title,
      category: slot.sectionCategory,
      intent: slot.intent,
      difficulty: slot.difficulty,
      availableCompetencies: slot.sectionCompetencies,
      availableSkills: slot.sectionSkills,
    }));

    const compactRubric = rubric.competencies.map((c) => ({
      competencyName: c.competencyName,
      importance: c.importance,
      evidenceSignals: c.evidenceSignals,
      scoringAnchors: c.scoringAnchors,
    }));

    return `You are generating the FINAL, CANDIDATE-FACING questions for a live hiring interview assessment. This is production hiring infrastructure, NOT a practice or coaching session — never include tips, encouragement, hints, or meta-commentary. Write only what a professional interviewer would actually say to a real candidate.

STRICT RULES:
- Generate EXACTLY one question per planned intent listed below, matched by its "index".
- Clear, professional, candidate-facing language only.
- Never reveal a model/expected/ideal answer.
- Never ask about age, gender, religion, marital or family status, health, disability, race, ethnicity, nationality, or any other protected/personal characteristic.
- Never ask about salary, compensation, or benefits expectations.
- Never reveal or reference any screening concern, score, ranking, or hiring recommendation.
- Behavioral questions may ask for a concrete past example ("Tell me about a time when...").
- Technical questions must test applied evidence and reasoning, never rote trivia.
- "competencyNames" and "skillNames" for a question MUST be chosen only from that intent's own "availableCompetencies" / "availableSkills".
- JSON only — no prose, no markdown code fences, no explanation.

PLANNED QUESTION INTENTS (blueprint planning source — convert each into one final question):
${JSON.stringify(compactIntents)}

COMPETENCY EVALUATION GUIDANCE (internal interviewer calibration only — never shown to the candidate):
${JSON.stringify(compactRubric)}

Return ONLY a single JSON object with EXACTLY this shape:
{
  "questions": [
    {
      "index": number,               // must match the intent's "index" above
      "questionText": string,
      "difficulty": string,          // one of: easy, medium, hard
      "competencyNames": string[],
      "skillNames": string[],
      "evaluationIntent": string,    // one sentence: what this question is meant to reveal
      "evidenceExpected": string[],
      "followUpFocus": string[]
    }
  ]
}

Return JSON only.`;
  }

  /**
   * Strict, defensive normalization of untrusted AI JSON — mirrors
   * `EmployerInterviewBlueprintService.validateBlueprint`'s technique.
   * `blueprintSectionId`/`questionType`(category)/fallback `difficulty`
   * are all assigned from the SERVER's own planned slot (positional
   * "index" match), never from the AI's self-reported fields, so a
   * malformed or missing reference can only ever cause that one slot to
   * be dropped — it can never mis-home a question into the wrong section.
   */
  private validateAndBuildQuestions(
    data: unknown,
    slots: PlannedIntentSlot[],
    blueprint: IInterviewBlueprint,
    rubric: IInterviewCompetencyRubric
  ): IQuestion[] {
    const source = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
    const rawQuestions = source && Array.isArray(source.questions) ? (source.questions as unknown[]) : null;
    if (!rawQuestions || rawQuestions.length === 0) {
      throw new ApiError(502, 'Interview questions were structurally invalid');
    }

    const asObject = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' ? (value as Record<string, unknown>) : {});
    const asString = (value: unknown, maxLength: number): string | undefined => {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim();
      return trimmed ? trimmed.slice(0, maxLength) : undefined;
    };
    const asStringArray = (value: unknown, validSet: Set<string> | null, maxItems: number, maxLength = 200): string[] => {
      if (!Array.isArray(value)) return [];
      const seen = new Set<string>();
      const result: string[] = [];
      for (const item of value) {
        if (typeof item !== 'string') continue;
        const trimmed = item.trim().slice(0, maxLength);
        if (!trimmed) continue;
        if (validSet && !validSet.has(trimmed)) continue;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(trimmed);
        if (result.length >= maxItems) break;
      }
      return result;
    };
    const asDifficulty = (value: unknown, fallback: EmployerInterviewBlueprintDifficulty): EmployerInterviewBlueprintDifficulty => {
      if (typeof value === 'string' && Object.values(EmployerInterviewBlueprintDifficulty).includes(value as EmployerInterviewBlueprintDifficulty)) {
        return value as EmployerInterviewBlueprintDifficulty;
      }
      return fallback;
    };

    // Positional map keyed by the server-known "index" — first occurrence
    // wins if the model duplicates an index, everything else is ignored.
    const byIndex = new Map<number, Record<string, unknown>>();
    for (const itemRaw of rawQuestions) {
      const item = asObject(itemRaw);
      const idx = typeof item.index === 'number' ? item.index : NaN;
      if (!Number.isInteger(idx) || byIndex.has(idx)) continue;
      byIndex.set(idx, item);
    }

    const questions: IQuestion[] = [];
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const raw = byIndex.get(i);
      if (!raw) continue; // Model didn't return this slot — dropped, never invented server-side.

      const questionText = asString(raw.questionText, MAX_QUESTION_TEXT_LENGTH);
      if (!questionText || questionText.length < MIN_QUESTION_TEXT_LENGTH) continue;

      const competencySet = new Set(slot.sectionCompetencies);
      const skillSet = new Set(slot.sectionSkills);

      questions.push({
        questionText,
        questionType: slot.sectionCategory,
        questionSource: 'ai',
        expectedPoints: [],
        difficulty: asDifficulty(raw.difficulty, slot.difficulty),
        blueprintSectionId: slot.sectionId,
        competencyNames: asStringArray(raw.competencyNames, competencySet, MAX_COMPETENCY_REFS),
        skillNames: asStringArray(raw.skillNames, skillSet, MAX_SKILL_REFS),
        evaluationIntent: asString(raw.evaluationIntent, MAX_EVALUATION_INTENT_LENGTH) || slot.intent.slice(0, MAX_EVALUATION_INTENT_LENGTH),
        evidenceExpected: asStringArray(raw.evidenceExpected, null, MAX_EVIDENCE_ITEMS),
        followUpFocus: asStringArray(raw.followUpFocus, null, MAX_FOLLOWUP_ITEMS),
      } as IQuestion);
    }

    if (questions.length === 0) {
      throw new ApiError(502, 'No usable interview questions were generated');
    }

    this.verifyCoverage(questions, blueprint, rubric);

    return questions;
  }

  /**
   * Every planned section and every blueprint-covered CRITICAL competency
   * must be represented. Repair is reference-only (re-tagging an existing
   * generated question's `competencyNames`) — new question text is never
   * invented server-side. If critical coverage still can't be achieved
   * after repair, generation fails outright rather than shipping an
   * assessment with a silent gap.
   */
  private verifyCoverage(questions: IQuestion[], blueprint: IInterviewBlueprint, rubric: IInterviewCompetencyRubric): void {
    const sectionsWithPlan = blueprint.sections.filter((s) => s.questionPlan.length > 0).map((s) => s.id);
    const coveredSections = new Set(questions.map((q) => q.blueprintSectionId));
    const uncoveredSections = sectionsWithPlan.filter((id) => !coveredSections.has(id));
    if (uncoveredSections.length > 0) {
      throw new ApiError(502, 'Generated questions did not cover every planned interview section');
    }

    const criticalCompetencyNames = rubric.competencies
      .filter((c) => c.importance === EmployerJobCompetencyImportance.CRITICAL)
      .map((c) => c.competencyName);
    const blueprintCoveredCritical = criticalCompetencyNames.filter((name) => blueprint.sections.some((s) => s.competencies.includes(name)));
    if (blueprintCoveredCritical.length === 0) return;

    const coveredCompetencies = new Set<string>();
    for (const q of questions) {
      for (const name of q.competencyNames ?? []) coveredCompetencies.add(name);
    }

    const missingCritical = blueprintCoveredCritical.filter((name) => !coveredCompetencies.has(name));
    if (missingCritical.length === 0) return;

    for (const name of missingCritical) {
      const homeSection = blueprint.sections.find((s) => s.competencies.includes(name));
      if (!homeSection) continue;
      const candidate = questions.find((q) => q.blueprintSectionId === homeSection.id);
      if (!candidate) continue;
      candidate.competencyNames = [...(candidate.competencyNames ?? []), name];
      coveredCompetencies.add(name);
    }

    const stillMissing = blueprintCoveredCritical.filter((name) => !coveredCompetencies.has(name));
    if (stillMissing.length > 0) {
      throw new ApiError(502, 'Generated questions did not achieve required critical competency coverage');
    }
  }
}

export const hiringQuestionMaterializationService = new HiringQuestionMaterializationService();
export default hiringQuestionMaterializationService;
