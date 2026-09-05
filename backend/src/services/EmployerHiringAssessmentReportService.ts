import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJobApplication from '../models/EmployerJobApplication.model';
import EmployerInterviewInvitation from '../models/EmployerInterviewInvitation.model';
import { employerInterviewInvitationService } from './EmployerInterviewInvitationService';
import Interview, { IInterview } from '../models/interview.model';
import { InterviewPurpose, InterviewStatus } from '../constants/interview';
import EmployerHiringAssessmentResult, { IEmployerHiringAssessmentResult } from '../models/EmployerHiringAssessmentResult.model';
import EmployerHiringEvidenceMatrix, { IEmployerHiringEvidenceMatrix } from '../models/EmployerHiringEvidenceMatrix.model';
import EmployerHiringFollowUpPlan, { IEmployerHiringFollowUpPlan } from '../models/EmployerHiringFollowUpPlan.model';
import EmployerHiringAssessmentReport, {
  IEmployerHiringAssessmentReport,
  IHiringAssessmentReport,
  IReportCompetencySummary,
} from '../models/EmployerHiringAssessmentReport.model';
import { getAIService } from '../ai';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const GENERATION_VERSION = 'hiring-assessment-report-v1';
const MAX_EXECUTIVE_SUMMARY_LENGTH = 2000;
const MAX_COMPETENCY_SUMMARY_LENGTH = 500;
const MAX_LIST_ITEMS = 10;
const MAX_STRING_LENGTH = 300;

interface ResolvedSession {
  organization: IOrganization;
  application: InstanceType<typeof EmployerJobApplication>;
  interview: IInterview;
  assessmentResult: IEmployerHiringAssessmentResult;
  evidenceMatrix: IEmployerHiringEvidenceMatrix;
  followUpPlan: IEmployerHiringFollowUpPlan | null;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function asStringArray(value: unknown, maxItems = MAX_LIST_ITEMS, maxLength = MAX_STRING_LENGTH): string[] {
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
}

/**
 * Generates one immutable, employer-only narrative report (22C) explaining
 * a hiring Interview's evidence, from its exact 21E result + 22A matrix +
 * (when required) 22B follow-up plan — NO hire/reject recommendation.
 * Critical numeric fields and every competency name/score/status are
 * pinned from server data; AI supplies narrative text only. Isolated from
 * every other AI-backed hiring flow and from practice report generation.
 */
export class EmployerHiringAssessmentReportService {
  /**
   * POST .../interview-session/report — deterministic claim + at most one
   * AI call. An existing COMPLETED report for the exact {interview,
   * assessmentResult} combination is returned as-is, never regenerated.
   */
  async createReport(organizationId: string, actingRole: OrganizationMemberRole, applicationId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const session = await this.resolveSession(organizationId, actingRole, applicationId);
    this.assertOrganizationMutable(session.organization);

    const existing = await EmployerHiringAssessmentReport.findOne({
      organizationId: session.organization._id,
      interviewId: session.interview._id,
      assessmentResultId: session.assessmentResult._id,
    });

    if (existing) {
      return this.handleExisting(existing, session);
    }

    return this.claimAndGenerate(session);
  }

  /** GET .../interview-session/report — the report for the CURRENT applicable invitation's current assessment result, or null. */
  async getReport(organizationId: string, actingRole: OrganizationMemberRole, applicationId: string): Promise<Record<string, unknown> | null> {
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

    const assessmentResult = await EmployerHiringAssessmentResult.findOne({
      organizationId: organization._id,
      interviewId: invitation.interviewId,
    }).select('_id');
    if (!assessmentResult) {
      return null;
    }

    const report = await EmployerHiringAssessmentReport.findOne({
      organizationId: organization._id,
      interviewId: invitation.interviewId,
      assessmentResultId: assessmentResult._id,
    });
    if (!report) {
      return null;
    }

    return this.toDetail(report);
  }

  /** Resolves + validates the exact tenant-scoped current hiring session (interview, result, matrix, follow-up plan) — never trusts any artifact id from the caller. */
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
    });
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

    const needsFollowUp = evidenceMatrix.matrix.summary.followUpCompetencyCount > 0;
    const followUpPlan = await EmployerHiringFollowUpPlan.findOne({
      organizationId: organization._id,
      interviewId: interview._id,
      evidenceMatrixId: evidenceMatrix._id,
    });
    if (needsFollowUp && followUpPlan?.status !== 'completed') {
      throw new ApiError(409, 'Follow-up plan is not ready yet.');
    }

    return { organization, application, interview, assessmentResult, evidenceMatrix, followUpPlan: followUpPlan ?? null };
  }

  private async handleExisting(
    existing: IEmployerHiringAssessmentReport,
    session: ResolvedSession
  ): Promise<Record<string, unknown>> {
    if (existing.status === 'completed') {
      return this.toDetail(existing);
    }
    if (existing.status === 'processing') {
      throw new ApiError(409, 'Hiring report is already being prepared — please try again shortly');
    }

    // failed -> safe CAS retry
    const reclaimed = await EmployerHiringAssessmentReport.findOneAndUpdate(
      { _id: existing._id, status: 'failed' },
      { $set: { status: 'processing' }, $unset: { errorMessage: 1 } },
      { new: true }
    );
    if (!reclaimed) {
      const refetched = await EmployerHiringAssessmentReport.findById(existing._id);
      if (refetched?.status === 'completed') {
        return this.toDetail(refetched);
      }
      throw new ApiError(409, 'Hiring report is already being prepared — please try again shortly');
    }

    return this.generate(reclaimed, session);
  }

  private async claimAndGenerate(session: ResolvedSession): Promise<Record<string, unknown>> {
    let claimed: IEmployerHiringAssessmentReport;
    try {
      claimed = await EmployerHiringAssessmentReport.create({
        organizationId: session.organization._id,
        applicationId: session.application._id,
        jobId: session.interview.employerJobId,
        candidateId: session.interview.employerCandidateId,
        interviewId: session.interview._id,
        blueprintId: session.interview.employerBlueprintId,
        rubricId: session.interview.employerRubricId,
        assessmentResultId: session.assessmentResult._id,
        evidenceMatrixId: session.evidenceMatrix._id,
        followUpPlanId: session.followUpPlan?._id,
        status: 'processing',
      });
    } catch (error: any) {
      if (error?.code !== 11000) {
        throw error;
      }
      const winner = await EmployerHiringAssessmentReport.findOne({
        organizationId: session.organization._id,
        interviewId: session.interview._id,
        assessmentResultId: session.assessmentResult._id,
      });
      if (!winner) {
        throw new ApiError(409, 'Hiring report is already being prepared — please try again shortly');
      }
      return this.handleExisting(winner, session);
    }

    return this.generate(claimed, session);
  }

  private async generate(claimed: IEmployerHiringAssessmentReport, session: ResolvedSession): Promise<Record<string, unknown>> {
    try {
      const prompt = this.buildPrompt(session);
      const result = await getAIService().generateStructured<unknown>(
        { prompt, temperature: 0.3, maxTokens: 3000 },
        { organizationId: session.organization._id.toString(), operation: 'hiring-assessment-report-generation' }
      );

      const report = this.validateAndBuildReport(result.data, session);

      const updated = await EmployerHiringAssessmentReport.findOneAndUpdate(
        { _id: claimed._id },
        { $set: { status: 'completed', report }, $unset: { errorMessage: 1 } },
        { new: true }
      );
      return this.toDetail(updated!);
    } catch (error) {
      await EmployerHiringAssessmentReport.updateOne(
        { _id: claimed._id },
        { $set: { status: 'failed', errorMessage: this.safeErrorMessage(error) } }
      );
      throw error;
    }
  }

  private safeErrorMessage(error: unknown): string {
    if (error instanceof ApiError) return error.message.slice(0, 500);
    return 'Hiring report generation failed';
  }

  /**
   * Strict, non-coaching, JSON-only prompt — sends ONLY structured
   * employer assessment data (scores, competency evidence, follow-up
   * context). Never sends candidate identity/contact, resume, raw JD,
   * screening/ranking, or recruiter notes.
   */
  private buildPrompt(session: ResolvedSession): string {
    const compactCompetencies = session.assessmentResult.result.competencies.map((rc) => {
      const matrixEntry = session.evidenceMatrix.matrix.competencies.find((mc) => mc.competencyName === rc.competencyName);
      return {
        competencyName: rc.competencyName,
        importance: rc.importance,
        score: rc.score,
        questionCount: rc.questionCount,
        evidence: rc.evidence,
        missingEvidence: rc.missingEvidence,
        evidenceStatus: matrixEntry?.evidenceStatus,
        followUpReasons: matrixEntry?.followUpReasons ?? [],
      };
    });

    const compactFollowUp =
      session.followUpPlan?.plan?.competencies.map((fc) => ({
        competencyName: fc.competencyName,
        questions: fc.questions.map((q) => ({ question: q.question, objective: q.objective })),
      })) ?? [];

    const compactData = {
      overallScore: session.assessmentResult.result.overallScore,
      averageRubricScore: session.assessmentResult.result.averageRubricScore,
      competencyCoveragePercent: session.assessmentResult.result.competencyCoveragePercent,
      competencies: compactCompetencies,
      followUpPlan: compactFollowUp,
    };

    return `You are an EMPLOYER-FACING interview report writer summarizing a completed hiring assessment for a recruiter/interviewer audience. This is production hiring infrastructure — you are explaining EVIDENCE, not making a hiring decision.

STRICT RULES:
- Summarize the evidence provided below. Never invent facts not present in the data.
- Clearly distinguish what the candidate DEMONSTRATED (supporting evidence) from what is MISSING or unclear.
- Never infer personality traits, protected characteristics, or anything not explicitly grounded in the evidence provided.
- Never make legal or medical assertions.
- Never discuss salary or compensation.
- Never include a hiring recommendation or verdict — do NOT use words like "hire", "reject", "strong hire", "no hire", "recommend".
- Never address or coach the candidate — this report is for the employer/interviewer only.
- JSON only — no prose, no markdown code fences, no explanation.

ASSESSMENT DATA (competency-level results, evidence, and follow-up context):
${JSON.stringify(compactData)}

Return ONLY a single JSON object with EXACTLY this shape:
{
  "executiveSummary": string,
  "competencySummaries": [
    { "competencyName": string, "summary": string }
  ],
  "demonstratedStrengths": string[],
  "evidenceGaps": string[],
  "followUpPriorities": string[],
  "interviewerNotes": string[]
}

Return JSON only.`;
  }

  /**
   * Strict, defensive normalization. `overallScore`/`averageRubricScore`/
   * `competencyCoveragePercent` and every competency's name/importance/
   * score/evidenceStatus are pinned directly from the 21E result + 22A
   * matrix — NEVER from AI output. AI supplies only `executiveSummary`,
   * per-competency `summary` text (matched by exact trusted name; unknown
   * names dropped), and the four narrative arrays.
   */
  private validateAndBuildReport(data: unknown, session: ResolvedSession): IHiringAssessmentReport {
    const source = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;

    const executiveSummary = asString(source?.executiveSummary, MAX_EXECUTIVE_SUMMARY_LENGTH) || '';

    const rawCompetencySummaries = source && Array.isArray(source.competencySummaries) ? (source.competencySummaries as unknown[]) : [];
    const summaryByName = new Map<string, string>();
    for (const itemRaw of rawCompetencySummaries) {
      const item = asObject(itemRaw);
      const name = typeof item.competencyName === 'string' ? item.competencyName.trim() : '';
      if (!name || summaryByName.has(name)) continue; // unknown/duplicate handled below by trusted-name lookup
      const summary = asString(item.summary, MAX_COMPETENCY_SUMMARY_LENGTH) || '';
      summaryByName.set(name, summary);
    }

    const competencySummary: IReportCompetencySummary[] = session.assessmentResult.result.competencies.map((rc) => {
      const matrixEntry = session.evidenceMatrix.matrix.competencies.find((mc) => mc.competencyName === rc.competencyName);
      return {
        competencyName: rc.competencyName,
        importance: rc.importance,
        score: rc.score,
        evidenceStatus: matrixEntry?.evidenceStatus ?? 'insufficient',
        summary: summaryByName.get(rc.competencyName) || '',
      };
    });

    const demonstratedStrengths = asStringArray(source?.demonstratedStrengths);
    const evidenceGaps = asStringArray(source?.evidenceGaps);
    const followUpPriorities = asStringArray(source?.followUpPriorities);
    const interviewerNotes = asStringArray(source?.interviewerNotes);

    const hasUsableContent =
      executiveSummary.length > 0 ||
      competencySummary.some((c) => c.summary.length > 0) ||
      demonstratedStrengths.length > 0 ||
      evidenceGaps.length > 0;
    if (!hasUsableContent) {
      throw new ApiError(502, 'No usable report was generated');
    }

    return {
      executiveSummary,
      overallScore: session.assessmentResult.result.overallScore,
      averageRubricScore: session.assessmentResult.result.averageRubricScore,
      competencyCoveragePercent: session.assessmentResult.result.competencyCoveragePercent,
      competencySummary,
      demonstratedStrengths,
      evidenceGaps,
      followUpPriorities,
      interviewerNotes,
      generationVersion: GENERATION_VERSION,
    };
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

  private toDetail(doc: IEmployerHiringAssessmentReport): Record<string, unknown> {
    return {
      id: doc._id.toString(),
      interviewId: doc.interviewId.toString(),
      blueprintId: doc.blueprintId.toString(),
      rubricId: doc.rubricId.toString(),
      assessmentResultId: doc.assessmentResultId.toString(),
      evidenceMatrixId: doc.evidenceMatrixId.toString(),
      followUpPlanId: doc.followUpPlanId?.toString(),
      status: doc.status,
      report: doc.report,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}

export const employerHiringAssessmentReportService = new EmployerHiringAssessmentReportService();
export default employerHiringAssessmentReportService;
