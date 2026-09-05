import { Types } from 'mongoose';
import Interview, { IInterview, IEvaluation, IHiringCompetencyScore } from '../models/interview.model';
import { InterviewPurpose, InterviewStatus } from '../constants/interview';
import EmployerInterviewCompetencyRubric, { IInterviewCompetencyRubric } from '../models/EmployerInterviewCompetencyRubric.model';
import { getAIService } from '../ai';
import { ApiError } from '../utils/ApiError';

const MAX_EVIDENCE_ITEMS = 6;
const MAX_STRING_LENGTH = 300;
const MAX_EVIDENCE_SUMMARY_LENGTH = 1000;

interface EvaluatableQuestion {
  index: number;
  questionText: string;
  answerText: string;
  competencyNames: string[];
  skillNames: string[];
  evaluationIntent?: string;
  evidenceExpected: string[];
  followUpFocus: string[];
}

/**
 * Evaluates every answered question of a COMPLETED hiring-assessment
 * Interview against its exact 20B rubric (21D) — question-level
 * evaluations only, no final report/recommendation. Deliberately isolated
 * from every practice/coaching evaluation path: a distinct AI operation
 * label, its own prompt/validation, and results are written to hiring-only
 * `IEvaluation` fields (`hiringRubricScore`/`hiringCompetencyScores`/
 * `hiringEvidenceSummary`) — `strengths`/`weaknesses` are reused directly
 * for hiring strengths/concerns, never duplicated. Never evaluates via
 * `InterviewService`'s practice `evaluateQuestion`/`generateFinalReport`
 * paths, never calls AI more than once, never consumes credits, never
 * changes EmployerJobApplication status.
 */
export class HiringAnswerEvaluationService {
  /**
   * Idempotent: an interview already at `EVALUATED` (or
   * `hiringEvaluationStatus === 'completed'`) is returned as-is with no
   * new AI call. Concurrent callers converge via the interview's own
   * atomic claim — never duplicate side effects.
   */
  async evaluate(organizationId: string, interviewId: string): Promise<IInterview> {
    const interview = await this.loadInterview(organizationId, interviewId);

    if (interview.status === InterviewStatus.EVALUATED || interview.hiringEvaluationStatus === 'completed') {
      return interview;
    }

    if (interview.status !== InterviewStatus.COMPLETED) {
      throw new ApiError(409, 'This interview must be completed before it can be evaluated.');
    }
    if (interview.questionMaterializationStatus !== 'completed' || interview.questions.length === 0) {
      throw new ApiError(409, 'Interview questions are not ready.');
    }
    const unanswered = interview.questions.filter((q) => !q.answerText || q.answerText.trim().length === 0).length;
    if (unanswered > 0) {
      throw new ApiError(409, `${unanswered} question${unanswered === 1 ? '' : 's'} still ${unanswered === 1 ? 'has' : 'have'} no answer.`);
    }

    const rubricDoc = await this.loadRubric(interview);
    const rubric = rubricDoc.rubric;

    // Atomic claim — the interview itself is the concurrency guard.
    const claimed = await Interview.findOneAndUpdate(
      {
        _id: interview._id,
        purpose: InterviewPurpose.HIRING_ASSESSMENT,
        status: InterviewStatus.COMPLETED,
        hiringEvaluationStatus: { $in: [null, 'pending', 'failed'] },
      },
      { $set: { hiringEvaluationStatus: 'processing' } },
      { new: true }
    );

    if (!claimed) {
      const current = await Interview.findById(interview._id);
      if (!current) {
        throw new ApiError(404, 'Interview session not found');
      }
      if (current.status === InterviewStatus.EVALUATED || current.hiringEvaluationStatus === 'completed') {
        return current;
      }
      throw new ApiError(409, 'Interview evaluation is already being prepared — please try again shortly');
    }

    try {
      const evaluatableQuestions: EvaluatableQuestion[] = claimed.questions.map((q, index) => ({
        index,
        questionText: q.questionText,
        answerText: q.answerText || '',
        competencyNames: q.competencyNames ?? [],
        skillNames: q.skillNames ?? [],
        evaluationIntent: q.evaluationIntent,
        evidenceExpected: q.evidenceExpected ?? [],
        followUpFocus: q.followUpFocus ?? [],
      }));

      const prompt = this.buildPrompt(evaluatableQuestions, rubric);
      const result = await getAIService().generateStructured<unknown>(
        { prompt, temperature: 0.2, maxTokens: 4000 },
        { interviewId: claimed._id.toString(), operation: 'hiring-answer-evaluation' }
      );

      const evaluationsByIndex = this.validateEvaluations(result.data, evaluatableQuestions, rubric);

      for (const [index, evaluation] of evaluationsByIndex.entries()) {
        claimed.questions[index].evaluation = evaluation;
      }
      claimed.hiringEvaluationStatus = 'completed';
      claimed.status = InterviewStatus.EVALUATED;
      await claimed.save();

      return claimed;
    } catch (error) {
      await Interview.updateOne({ _id: claimed._id }, { $set: { hiringEvaluationStatus: 'failed' } });
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

  /**
   * Strict, non-coaching, JSON-only prompt — evidence must be grounded
   * ONLY in the candidate's own answer text. Never sends raw JD/resume,
   * screening/ranking, candidate identity/contact, or recruiter notes.
   */
  private buildPrompt(questions: EvaluatableQuestion[], rubric: IInterviewCompetencyRubric): string {
    const compactQuestions = questions.map((q) => ({
      index: q.index,
      questionText: q.questionText,
      answerText: q.answerText,
      competencyNames: q.competencyNames,
      skillNames: q.skillNames,
      evaluationIntent: q.evaluationIntent,
      evidenceExpected: q.evidenceExpected,
      followUpFocus: q.followUpFocus,
    }));

    const compactRubric = rubric.competencies.map((c) => ({
      competencyName: c.competencyName,
      importance: c.importance,
      jdWeight: c.jdWeight,
      evidenceSignals: c.evidenceSignals,
      scoringAnchors: c.scoringAnchors,
    }));

    return `You are an interview evaluator scoring a CANDIDATE'S ANSWERS for a completed hiring assessment, strictly against the rubric below. This is production hiring infrastructure, NOT coaching — do not address the candidate, do not give tips or encouragement.

STRICT RULES:
- Evaluate EXACTLY one entry per question, matched by its "index". Every question listed below must receive exactly one evaluation.
- Score each question 1-5 using the rubric's scoring anchors as the scale definition.
- "competencyScores" for a question must be chosen only from that question's own "competencyNames".
- ALL evidence and missingEvidence must be grounded ONLY in the candidate's own "answerText" for that question — never infer personality traits, protected characteristics (age, gender, religion, race, disability, etc.), background, or anything not explicitly stated in the answer.
- If the answer does not demonstrate something the rubric expects, say so in "missingEvidence" — never guess or fabricate evidence that isn't there.
- Do not reference screening scores, rankings, or any hiring recommendation.
- JSON only — no prose, no markdown code fences, no explanation.

QUESTIONS AND CANDIDATE ANSWERS:
${JSON.stringify(compactQuestions)}

EVALUATION RUBRIC (competency scoring anchors and evidence signals to apply):
${JSON.stringify(compactRubric)}

Return ONLY a single JSON object with EXACTLY this shape:
{
  "evaluations": [
    {
      "index": number,
      "overallScore": number,          // 1-5
      "competencyScores": [
        {
          "competencyName": string,
          "score": number,             // 1-5
          "evidence": string[],
          "missingEvidence": string[]
        }
      ],
      "strengths": string[],
      "concerns": string[],
      "evidenceSummary": string
    }
  ]
}

Return JSON only.`;
  }

  /**
   * Strict, all-or-nothing validation — every question must receive
   * exactly one valid evaluation or the whole batch is rejected (no
   * partial persistence). Unknown competency references are dropped, never
   * persisted; string arrays are trimmed/capped/deduped.
   */
  private validateEvaluations(
    data: unknown,
    questions: EvaluatableQuestion[],
    rubric: IInterviewCompetencyRubric
  ): Map<number, IEvaluation> {
    const source = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
    const rawEvaluations = source && Array.isArray(source.evaluations) ? (source.evaluations as unknown[]) : null;
    if (!rawEvaluations || rawEvaluations.length === 0) {
      throw new ApiError(502, 'Answer evaluations were structurally invalid');
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
    const asScore = (value: unknown): number | null => {
      if (typeof value !== 'number' || !Number.isFinite(value)) return null;
      const rounded = Math.round(value);
      if (rounded < 1 || rounded > 5) return null;
      return rounded;
    };

    const rubricCompetencyNames = new Set(rubric.competencies.map((c) => c.competencyName));

    const byIndex = new Map<number, Record<string, unknown>>();
    for (const itemRaw of rawEvaluations) {
      const item = asObject(itemRaw);
      const idx = typeof item.index === 'number' ? item.index : NaN;
      if (!Number.isInteger(idx) || byIndex.has(idx)) continue;
      byIndex.set(idx, item);
    }

    const result = new Map<number, IEvaluation>();

    for (const question of questions) {
      const raw = byIndex.get(question.index);
      if (!raw) {
        throw new ApiError(502, `Missing evaluation for question ${question.index + 1}`);
      }

      const overallScore = asScore(raw.overallScore);
      if (overallScore === null) {
        throw new ApiError(502, `Invalid score for question ${question.index + 1}`);
      }

      const questionCompetencySet = new Set(question.competencyNames);
      const rawCompetencyScores = Array.isArray(raw.competencyScores) ? (raw.competencyScores as unknown[]) : [];
      const competencyScores: IHiringCompetencyScore[] = [];
      const seenCompetencyNames = new Set<string>();
      for (const scoreRaw of rawCompetencyScores) {
        const scoreItem = asObject(scoreRaw);
        const competencyName = typeof scoreItem.competencyName === 'string' ? scoreItem.competencyName.trim() : '';
        if (!competencyName) continue;
        if (!questionCompetencySet.has(competencyName) || !rubricCompetencyNames.has(competencyName)) continue;
        if (seenCompetencyNames.has(competencyName)) continue;
        const competencyScore = asScore(scoreItem.score);
        if (competencyScore === null) continue;
        seenCompetencyNames.add(competencyName);
        competencyScores.push({
          competencyName,
          score: competencyScore,
          evidence: asStringArray(scoreItem.evidence, MAX_EVIDENCE_ITEMS),
          missingEvidence: asStringArray(scoreItem.missingEvidence, MAX_EVIDENCE_ITEMS),
        });
      }

      const evidenceSummary =
        typeof raw.evidenceSummary === 'string' ? raw.evidenceSummary.trim().slice(0, MAX_EVIDENCE_SUMMARY_LENGTH) : '';

      result.set(question.index, {
        overallScore,
        strengths: asStringArray(raw.strengths, MAX_EVIDENCE_ITEMS),
        weaknesses: asStringArray(raw.concerns, MAX_EVIDENCE_ITEMS),
        suggestions: [],
        hiringRubricScore: overallScore,
        hiringCompetencyScores: competencyScores,
        hiringEvidenceSummary: evidenceSummary,
      });
    }

    return result;
  }
}

export const hiringAnswerEvaluationService = new HiringAnswerEvaluationService();
export default hiringAnswerEvaluationService;
