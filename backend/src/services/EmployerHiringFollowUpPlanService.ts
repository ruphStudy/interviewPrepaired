import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJobApplication from '../models/EmployerJobApplication.model';
import EmployerInterviewInvitation from '../models/EmployerInterviewInvitation.model';
import { employerInterviewInvitationService } from './EmployerInterviewInvitationService';
import Interview, { IInterview } from '../models/interview.model';
import { InterviewPurpose, InterviewStatus } from '../constants/interview';
import EmployerInterviewCompetencyRubric, { IEmployerInterviewCompetencyRubric } from '../models/EmployerInterviewCompetencyRubric.model';
import EmployerHiringAssessmentResult from '../models/EmployerHiringAssessmentResult.model';
import EmployerHiringEvidenceMatrix, { IEvidenceCompetency, IEmployerHiringEvidenceMatrix } from '../models/EmployerHiringEvidenceMatrix.model';
import EmployerHiringFollowUpPlan, {
  IEmployerHiringFollowUpPlan,
  IFollowUpPlan,
  IFollowUpCompetency,
  IFollowUpQuestion,
} from '../models/EmployerHiringFollowUpPlan.model';
import { getAIService } from '../ai';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const GENERATION_VERSION = 'hiring-followup-plan-v1';
const MAX_QUESTIONS_PER_COMPETENCY = 2;
const MAX_TOTAL_QUESTIONS = 10;
const MAX_QUESTION_LENGTH = 500;
const MAX_OBJECTIVE_LENGTH = 300;
const MAX_EVIDENCE_ITEMS = 5;
const MAX_STRING_LENGTH = 200;
const ALLOWED_DIFFICULTIES = ['easy', 'medium', 'hard'];

interface ResolvedSession {
  organization: IOrganization;
  application: InstanceType<typeof EmployerJobApplication>;
  interview: IInterview;
  rubric: IEmployerInterviewCompetencyRubric;
  evidenceMatrix: IEmployerHiringEvidenceMatrix;
}

/**
 * Generates employer-only FOLLOW-UP QUESTION SUGGESTIONS (22B) for
 * competencies the immutable 22A evidence matrix marked
 * `requiresFollowUp` — never appended to `Interview.questions`, never
 * reopening the completed assessment, never evaluated. One AI call (or
 * none, if no competency needs follow-up) per plan; isolated from every
 * other AI-backed hiring flow via its own operation label/prompt/
 * validation.
 */
export class EmployerHiringFollowUpPlanService {
  /**
   * POST .../interview-session/follow-up-plan — deterministic claim +
   * (at most) one AI call. An existing COMPLETED plan for the exact
   * {interview, evidenceMatrix} combination is returned as-is, no new AI
   * call. If no competency requires follow-up, a completed zero-question
   * plan is created deterministically, without ever calling AI.
   */
  async createPlan(organizationId: string, actingRole: OrganizationMemberRole, applicationId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const session = await this.resolveSession(organizationId, actingRole, applicationId);
    this.assertOrganizationMutable(session.organization);

    const followUpCompetencies = session.evidenceMatrix.matrix.competencies.filter((c) => c.requiresFollowUp);

    const existing = await EmployerHiringFollowUpPlan.findOne({
      organizationId: session.organization._id,
      interviewId: session.interview._id,
      evidenceMatrixId: session.evidenceMatrix._id,
    });

    if (existing) {
      return this.handleExisting(existing, session, followUpCompetencies);
    }

    if (followUpCompetencies.length === 0) {
      return this.createDeterministicEmptyPlan(session);
    }

    return this.claimAndGenerate(session, followUpCompetencies, null);
  }

  /** GET .../interview-session/follow-up-plan — the plan for the CURRENT applicable invitation's current evidence matrix, or null. */
  async getPlan(organizationId: string, actingRole: OrganizationMemberRole, applicationId: string): Promise<Record<string, unknown> | null> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id }).select('_id');
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }

    const invitationDetail = await employerInterviewInvitationService.getCurrentInvitation(organizationId, actingRole, applicationId);
    if (!invitationDetail) {
      return null;
    }
    const invitation = await EmployerInterviewInvitation.findOne({ _id: invitationDetail.id, organizationId: organization._id }).select(
      'interviewId'
    );
    if (!invitation?.interviewId) {
      return null;
    }

    const evidenceMatrix = await EmployerHiringEvidenceMatrix.findOne({
      organizationId: organization._id,
      interviewId: invitation.interviewId,
    }).select('_id');
    if (!evidenceMatrix) {
      return null;
    }

    const plan = await EmployerHiringFollowUpPlan.findOne({
      organizationId: organization._id,
      interviewId: invitation.interviewId,
      evidenceMatrixId: evidenceMatrix._id,
    });
    if (!plan) {
      return null;
    }

    return this.toDetail(plan);
  }

  /** Resolves + validates the exact tenant-scoped current hiring session (interview, rubric, evidence matrix) — never trusts any artifact id from the caller. */
  private async resolveSession(organizationId: string, actingRole: OrganizationMemberRole, applicationId: string): Promise<ResolvedSession> {
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id });
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }

    const invitationDetail = await employerInterviewInvitationService.getCurrentInvitation(organizationId, actingRole, applicationId);
    if (!invitationDetail) {
      throw new ApiError(404, 'Interview session not found');
    }
    const invitation = await EmployerInterviewInvitation.findOne({ _id: invitationDetail.id, organizationId: organization._id }).select(
      'interviewId'
    );
    if (!invitation?.interviewId) {
      throw new ApiError(404, 'Interview session not found');
    }

    const interview = await Interview.findOne({ _id: invitation.interviewId, organizationId: organization._id });
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }
    if (interview.status !== InterviewStatus.EVALUATED || interview.hiringEvaluationStatus !== 'completed') {
      throw new ApiError(409, 'This interview has not been evaluated yet.');
    }

    const assessmentResult = await EmployerHiringAssessmentResult.findOne({
      organizationId: organization._id,
      interviewId: interview._id,
    }).select('_id');
    if (!assessmentResult) {
      throw new ApiError(409, 'Assessment result is not ready yet.');
    }

    const evidenceMatrix = await EmployerHiringEvidenceMatrix.findOne({
      organizationId: organization._id,
      interviewId: interview._id,
    });
    if (!evidenceMatrix) {
      throw new ApiError(409, 'Evidence analysis is not ready yet.');
    }

    const rubric = await EmployerInterviewCompetencyRubric.findOne({
      _id: interview.employerRubricId,
      organizationId: organization._id,
    });
    if (!rubric) {
      throw new ApiError(409, 'Interview evaluation rubric is not ready');
    }

    return { organization, application, interview, rubric, evidenceMatrix };
  }

  private async handleExisting(
    existing: IEmployerHiringFollowUpPlan,
    session: ResolvedSession,
    followUpCompetencies: IEvidenceCompetency[]
  ): Promise<Record<string, unknown>> {
    if (existing.status === 'completed') {
      return this.toDetail(existing);
    }
    if (existing.status === 'processing') {
      throw new ApiError(409, 'Follow-up plan is already being prepared — please try again shortly');
    }

    // failed -> safe CAS retry
    const reclaimed = await EmployerHiringFollowUpPlan.findOneAndUpdate(
      { _id: existing._id, status: 'failed' },
      { $set: { status: 'processing' }, $unset: { errorMessage: 1 } },
      { new: true }
    );
    if (!reclaimed) {
      const refetched = await EmployerHiringFollowUpPlan.findById(existing._id);
      if (refetched?.status === 'completed') {
        return this.toDetail(refetched);
      }
      throw new ApiError(409, 'Follow-up plan is already being prepared — please try again shortly');
    }

    if (followUpCompetencies.length === 0) {
      // Shouldn't normally happen (a zero-follow-up plan is created directly
      // as completed), but handle defensively rather than calling AI for nothing.
      return this.finalizePlan(reclaimed, { competencies: [], totalQuestions: 0, generationVersion: GENERATION_VERSION });
    }

    return this.generate(reclaimed, session, followUpCompetencies);
  }

  private async createDeterministicEmptyPlan(session: ResolvedSession): Promise<Record<string, unknown>> {
    const emptyPlan: IFollowUpPlan = { competencies: [], totalQuestions: 0, generationVersion: GENERATION_VERSION };
    try {
      const doc = await EmployerHiringFollowUpPlan.create({
        organizationId: session.organization._id,
        applicationId: session.application._id,
        jobId: session.interview.employerJobId,
        candidateId: session.interview.employerCandidateId,
        interviewId: session.interview._id,
        blueprintId: session.interview.employerBlueprintId,
        rubricId: session.interview.employerRubricId,
        assessmentResultId: session.evidenceMatrix.assessmentResultId,
        evidenceMatrixId: session.evidenceMatrix._id,
        status: 'completed',
        plan: emptyPlan,
      });
      return this.toDetail(doc);
    } catch (error: any) {
      if (error?.code !== 11000) {
        throw error;
      }
      const winner = await EmployerHiringFollowUpPlan.findOne({
        organizationId: session.organization._id,
        interviewId: session.interview._id,
        evidenceMatrixId: session.evidenceMatrix._id,
      });
      if (!winner) {
        throw new ApiError(409, 'Follow-up plan is already being prepared — please try again shortly');
      }
      return this.handleExisting(winner, session, []);
    }
  }

  private async claimAndGenerate(
    session: ResolvedSession,
    followUpCompetencies: IEvidenceCompetency[],
    _unused: null
  ): Promise<Record<string, unknown>> {
    let claimed: IEmployerHiringFollowUpPlan;
    try {
      claimed = await EmployerHiringFollowUpPlan.create({
        organizationId: session.organization._id,
        applicationId: session.application._id,
        jobId: session.interview.employerJobId,
        candidateId: session.interview.employerCandidateId,
        interviewId: session.interview._id,
        blueprintId: session.interview.employerBlueprintId,
        rubricId: session.interview.employerRubricId,
        assessmentResultId: session.evidenceMatrix.assessmentResultId,
        evidenceMatrixId: session.evidenceMatrix._id,
        status: 'processing',
      });
    } catch (error: any) {
      if (error?.code !== 11000) {
        throw error;
      }
      const winner = await EmployerHiringFollowUpPlan.findOne({
        organizationId: session.organization._id,
        interviewId: session.interview._id,
        evidenceMatrixId: session.evidenceMatrix._id,
      });
      if (!winner) {
        throw new ApiError(409, 'Follow-up plan is already being prepared — please try again shortly');
      }
      return this.handleExisting(winner, session, followUpCompetencies);
    }

    return this.generate(claimed, session, followUpCompetencies);
  }

  private async generate(
    claimed: IEmployerHiringFollowUpPlan,
    session: ResolvedSession,
    followUpCompetencies: IEvidenceCompetency[]
  ): Promise<Record<string, unknown>> {
    try {
      const prompt = this.buildPrompt(followUpCompetencies, session.rubric);
      const result = await getAIService().generateStructured<unknown>(
        { prompt, temperature: 0.3, maxTokens: 3000 },
        { organizationId: session.organization._id.toString(), operation: 'hiring-followup-question-generation' }
      );

      const plan = this.validateAndBuildPlan(result.data, followUpCompetencies);
      return this.finalizePlan(claimed, plan);
    } catch (error) {
      await EmployerHiringFollowUpPlan.updateOne(
        { _id: claimed._id },
        { $set: { status: 'failed', errorMessage: this.safeErrorMessage(error) } }
      );
      throw error;
    }
  }

  private async finalizePlan(claimed: IEmployerHiringFollowUpPlan, plan: IFollowUpPlan): Promise<Record<string, unknown>> {
    const updated = await EmployerHiringFollowUpPlan.findOneAndUpdate(
      { _id: claimed._id },
      { $set: { status: 'completed', plan }, $unset: { errorMessage: 1 } },
      { new: true }
    );
    return this.toDetail(updated!);
  }

  private safeErrorMessage(error: unknown): string {
    if (error instanceof ApiError) return error.message.slice(0, 500);
    return 'Follow-up question generation failed';
  }

  /**
   * Strict, non-coaching, JSON-only prompt — sends ONLY the competencies
   * requiring follow-up, their own source-question text/evidence, and the
   * exact rubric's evidence signals/scoring anchors for those competencies.
   * Never sends candidate identity/contact, resume, raw JD, screening/
   * ranking, or recruiter notes.
   */
  private buildPrompt(competencies: IEvidenceCompetency[], rubric: IEmployerInterviewCompetencyRubric): string {
    const rubricByName = new Map(rubric.rubric.competencies.map((c) => [c.competencyName, c]));

    const compactCompetencies = competencies.map((c) => {
      const rubricCompetency = rubricByName.get(c.competencyName);
      return {
        competencyName: c.competencyName,
        importance: c.importance,
        score: c.score,
        evidenceStatus: c.evidenceStatus,
        followUpReasons: c.followUpReasons,
        supportingEvidence: c.supportingEvidence,
        missingEvidence: c.missingEvidence,
        sourceQuestions: c.sourceQuestions.map((sq) => ({
          questionText: sq.questionText,
          evidence: sq.evidence,
          missingEvidence: sq.missingEvidence,
        })),
        evidenceSignals: rubricCompetency?.evidenceSignals ?? [],
        scoringAnchors: rubricCompetency?.scoringAnchors,
      };
    });

    return `You are drafting FOLLOW-UP interview questions for an employer to ask a candidate in a LATER round, to specifically validate weak or missing evidence from a completed hiring assessment. This is production hiring infrastructure, NOT coaching — never address the candidate directly, no tips, no hints, no model answers.

STRICT RULES:
- For EACH competency listed below, generate 1-2 follow-up questions maximum that specifically probe the "missingEvidence"/"followUpReasons" for that competency.
- Do NOT repeat the wording of any "sourceQuestions" question text — each follow-up must be a genuinely new question.
- Never ask about age, gender, religion, marital or family status, health, disability, race, ethnicity, nationality, salary, compensation, or benefits.
- Never include hiring-recommendation language.
- Professional interviewer tone only.
- JSON only — no prose, no markdown code fences, no explanation.

COMPETENCIES REQUIRING FOLLOW-UP (evidence gaps to close):
${JSON.stringify(compactCompetencies)}

Return ONLY a single JSON object with EXACTLY this shape:
{
  "competencies": [
    {
      "competencyName": string,          // must exactly match one of the competency names above
      "questions": [
        {
          "question": string,
          "objective": string,           // one sentence: what evidence this question is meant to surface
          "evidenceToValidate": string[],
          "difficulty": string           // one of: easy, medium, hard
        }
      ]
    }
  ]
}

Return JSON only.`;
  }

  /**
   * Strict, defensive normalization of untrusted AI JSON. Only exact
   * competency-name matches against the follow-up set are kept; unknown
   * competencies are dropped. Duplicate question text is removed
   * case-insensitively across the WHOLE plan. Never fabricates question
   * text server-side — a malformed/missing item is dropped, not repaired.
   */
  private validateAndBuildPlan(data: unknown, followUpCompetencies: IEvidenceCompetency[]): IFollowUpPlan {
    const source = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
    const rawCompetencies = source && Array.isArray(source.competencies) ? (source.competencies as unknown[]) : null;
    if (!rawCompetencies || rawCompetencies.length === 0) {
      throw new ApiError(502, 'Follow-up questions were structurally invalid');
    }

    const asObject = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' ? (value as Record<string, unknown>) : {});
    const asString = (value: unknown, maxLength: number): string | undefined => {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim();
      return trimmed ? trimmed.slice(0, maxLength) : undefined;
    };
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
    const asDifficulty = (value: unknown): 'easy' | 'medium' | 'hard' =>
      typeof value === 'string' && ALLOWED_DIFFICULTIES.includes(value) ? (value as 'easy' | 'medium' | 'hard') : 'medium';

    const validNames = new Map(followUpCompetencies.map((c) => [c.competencyName, c]));
    const seenCompetencyNames = new Set<string>();
    const seenQuestionTexts = new Set<string>();
    const competencies: IFollowUpCompetency[] = [];
    let totalQuestions = 0;

    for (const itemRaw of rawCompetencies) {
      if (totalQuestions >= MAX_TOTAL_QUESTIONS) break;
      const item = asObject(itemRaw);
      const competencyName = typeof item.competencyName === 'string' ? item.competencyName.trim() : '';
      const evidenceCompetency = competencyName ? validNames.get(competencyName) : undefined;
      if (!competencyName || !evidenceCompetency || seenCompetencyNames.has(competencyName)) continue; // unknown/duplicate competency dropped

      const rawQuestions = Array.isArray(item.questions) ? (item.questions as unknown[]) : [];
      const questions: IFollowUpQuestion[] = [];
      for (const questionRaw of rawQuestions) {
        if (questions.length >= MAX_QUESTIONS_PER_COMPETENCY || totalQuestions >= MAX_TOTAL_QUESTIONS) break;
        const questionItem = asObject(questionRaw);
        const questionText = asString(questionItem.question, MAX_QUESTION_LENGTH);
        if (!questionText) continue;
        const dedupeKey = questionText.toLowerCase();
        if (seenQuestionTexts.has(dedupeKey)) continue; // case-insensitive duplicate removed
        const objective = asString(questionItem.objective, MAX_OBJECTIVE_LENGTH) || '';

        seenQuestionTexts.add(dedupeKey);
        questions.push({
          question: questionText,
          objective,
          evidenceToValidate: asStringArray(questionItem.evidenceToValidate, MAX_EVIDENCE_ITEMS),
          difficulty: asDifficulty(questionItem.difficulty),
        });
        totalQuestions += 1;
      }

      if (questions.length === 0) continue; // nothing usable for this competency
      seenCompetencyNames.add(competencyName);
      competencies.push({
        competencyName,
        importance: evidenceCompetency.importance,
        currentScore: evidenceCompetency.score,
        evidenceStatus: evidenceCompetency.evidenceStatus,
        reasons: evidenceCompetency.followUpReasons,
        questions,
      });
    }

    if (competencies.length === 0 || totalQuestions === 0) {
      throw new ApiError(502, 'No usable follow-up questions were generated');
    }

    return { competencies, totalQuestions, generationVersion: GENERATION_VERSION };
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

  private toDetail(doc: IEmployerHiringFollowUpPlan): Record<string, unknown> {
    return {
      id: doc._id.toString(),
      interviewId: doc.interviewId.toString(),
      blueprintId: doc.blueprintId.toString(),
      rubricId: doc.rubricId.toString(),
      assessmentResultId: doc.assessmentResultId.toString(),
      evidenceMatrixId: doc.evidenceMatrixId.toString(),
      status: doc.status,
      plan: doc.plan,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}

export const employerHiringFollowUpPlanService = new EmployerHiringFollowUpPlanService();
export default employerHiringFollowUpPlanService;
