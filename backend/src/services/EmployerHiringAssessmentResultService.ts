import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJobApplication from '../models/EmployerJobApplication.model';
import EmployerInterviewInvitation from '../models/EmployerInterviewInvitation.model';
import { employerInterviewInvitationService } from './EmployerInterviewInvitationService';
import Interview, { IInterview } from '../models/interview.model';
import { InterviewPurpose, InterviewStatus } from '../constants/interview';
import EmployerInterviewCompetencyRubric, { IEmployerInterviewCompetencyRubric } from '../models/EmployerInterviewCompetencyRubric.model';
import { EmployerJobCompetencyImportance } from '../constants/employerJobDescriptionCompetencies';
import EmployerHiringAssessmentResult, {
  IEmployerHiringAssessmentResult,
  IHiringAssessmentResult,
  IHiringAssessmentCompetencyResult,
} from '../models/EmployerHiringAssessmentResult.model';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const CALCULATION_VERSION = 'hiring-assessment-result-v1';
const MAX_EVIDENCE_ITEMS = 10;
const MAX_STRING_LENGTH = 300;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function dedupeCap(items: string[], maxItems = MAX_EVIDENCE_ITEMS, maxLength = MAX_STRING_LENGTH): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
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
 * Deterministically aggregates a hiring-assessment Interview's 21D
 * question-level evaluations into one immutable employer result (21E) —
 * NO AI, NO hiring recommendation. Pins the exact interviewId/blueprintId/
 * rubricId used at creation time; a result is never updated/recalculated,
 * and a new hiring session always gets its own separate result row.
 */
export class EmployerHiringAssessmentResultService {
  /** POST .../interview-session/result — deterministic create. An existing result is returned as-is, never recomputed. */
  async createResult(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    applicationId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id }).select('_id');
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

    // Idempotent — an existing result is returned as-is, no new computation.
    const existing = await EmployerHiringAssessmentResult.findOne({ organizationId: organization._id, interviewId: interview._id });
    if (existing) {
      return this.toDetail(existing);
    }

    this.assertEvaluatedPrerequisites(interview);

    const rubric = await EmployerInterviewCompetencyRubric.findOne({
      _id: interview.employerRubricId,
      organizationId: organization._id,
    });
    if (!rubric) {
      throw new ApiError(409, 'Interview evaluation rubric is not ready');
    }

    const result = this.aggregate(interview, rubric);

    let doc: IEmployerHiringAssessmentResult;
    try {
      doc = await EmployerHiringAssessmentResult.create({
        organizationId: organization._id,
        applicationId: application._id,
        jobId: interview.employerJobId,
        candidateId: interview.employerCandidateId,
        interviewId: interview._id,
        blueprintId: interview.employerBlueprintId,
        rubricId: interview.employerRubricId,
        result,
      });
    } catch (error: any) {
      if (error?.code !== 11000) {
        throw error;
      }
      // Concurrent duplicate create — the model's own unique index is the
      // authoritative guard; refetch whoever actually won.
      const winner = await EmployerHiringAssessmentResult.findOne({ organizationId: organization._id, interviewId: interview._id });
      if (!winner) {
        throw new ApiError(409, 'Assessment result is already being prepared — please try again shortly');
      }
      return this.toDetail(winner);
    }

    return this.toDetail(doc);
  }

  /** GET .../interview-session/result — the result for the CURRENT applicable invitation, or null. Historical read is allowed even on an archived org/application, mirroring every other read in this domain. */
  async getResult(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    applicationId: string
  ): Promise<Record<string, unknown> | null> {
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

    const result = await EmployerHiringAssessmentResult.findOne({ organizationId: organization._id, interviewId: invitation.interviewId });
    if (!result) {
      return null;
    }

    return this.toDetail(result);
  }

  private assertEvaluatedPrerequisites(interview: IInterview): void {
    if (interview.status !== InterviewStatus.EVALUATED || interview.hiringEvaluationStatus !== 'completed') {
      throw new ApiError(409, 'This interview has not been evaluated yet.');
    }
    if (interview.questions.length === 0) {
      throw new ApiError(409, 'Interview has no questions to aggregate.');
    }
    const missingEvaluation = interview.questions.some((q) => !q.evaluation || typeof q.evaluation.hiringRubricScore !== 'number');
    if (missingEvaluation) {
      throw new ApiError(409, 'Not every question has a valid evaluation.');
    }
  }

  /**
   * Pure arithmetic aggregation — NO AI. Only rubric competencies with at
   * least one contributing question-level competency score count as
   * "assessed"; every CRITICAL rubric competency must be assessed or the
   * whole aggregation fails (409) rather than silently under-representing
   * a critical gap.
   */
  private aggregate(interview: IInterview, rubric: IEmployerInterviewCompetencyRubric): IHiringAssessmentResult {
    const rubricCompetencies = rubric.rubric.competencies;

    const byCompetency = new Map<string, { scores: number[]; evidence: string[]; missingEvidence: string[] }>();
    for (const q of interview.questions) {
      for (const cs of q.evaluation?.hiringCompetencyScores ?? []) {
        if (!byCompetency.has(cs.competencyName)) {
          byCompetency.set(cs.competencyName, { scores: [], evidence: [], missingEvidence: [] });
        }
        const entry = byCompetency.get(cs.competencyName)!;
        entry.scores.push(cs.score);
        entry.evidence.push(...cs.evidence);
        entry.missingEvidence.push(...cs.missingEvidence);
      }
    }

    const competencyResults: IHiringAssessmentCompetencyResult[] = [];
    for (const rc of rubricCompetencies) {
      const entry = byCompetency.get(rc.competencyName);
      if (!entry || entry.scores.length === 0) continue; // not assessed — excluded entirely
      const meanScore = entry.scores.reduce((sum, s) => sum + s, 0) / entry.scores.length;
      competencyResults.push({
        competencyName: rc.competencyName,
        importance: rc.importance,
        jdWeight: rc.jdWeight,
        score: round2(meanScore),
        questionCount: entry.scores.length,
        evidence: dedupeCap(entry.evidence),
        missingEvidence: dedupeCap(entry.missingEvidence),
      });
    }

    const criticalMissing = rubricCompetencies.filter(
      (rc) => rc.importance === EmployerJobCompetencyImportance.CRITICAL && !competencyResults.some((cr) => cr.competencyName === rc.competencyName)
    );
    if (criticalMissing.length > 0) {
      throw new ApiError(409, 'Critical competency coverage is missing from the evaluated answers');
    }

    const assessedWeight = competencyResults.reduce((sum, cr) => sum + cr.jdWeight, 0);
    if (assessedWeight <= 0) {
      throw new ApiError(409, 'No assessed competencies to calculate a result');
    }

    const weightedNormalized = competencyResults.reduce((sum, cr) => sum + (cr.score / 5) * cr.jdWeight, 0);
    const overallScore = clamp(round2((weightedNormalized / assessedWeight) * 100), 0, 100);

    const weightedRubric = competencyResults.reduce((sum, cr) => sum + cr.score * cr.jdWeight, 0);
    const averageRubricScore = clamp(round2(weightedRubric / assessedWeight), 1, 5);

    const competencyCoveragePercent =
      rubricCompetencies.length > 0 ? round2((competencyResults.length / rubricCompetencies.length) * 100) : 0;

    const allStrengths: string[] = [];
    const allConcerns: string[] = [];
    for (const q of interview.questions) {
      if (!q.evaluation) continue;
      allStrengths.push(...(q.evaluation.strengths ?? []));
      allConcerns.push(...(q.evaluation.weaknesses ?? []));
    }

    return {
      overallScore,
      averageRubricScore,
      assessedWeight: round2(assessedWeight),
      competencyCoveragePercent,
      competencies: competencyResults,
      strengths: dedupeCap(allStrengths),
      concerns: dedupeCap(allConcerns),
      calculationVersion: CALCULATION_VERSION,
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

  private toDetail(doc: IEmployerHiringAssessmentResult): Record<string, unknown> {
    return {
      id: doc._id.toString(),
      interviewId: doc.interviewId.toString(),
      blueprintId: doc.blueprintId.toString(),
      rubricId: doc.rubricId.toString(),
      result: doc.result,
      createdAt: doc.createdAt,
    };
  }
}

export const employerHiringAssessmentResultService = new EmployerHiringAssessmentResultService();
export default employerHiringAssessmentResultService;
