import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJobApplication from '../models/EmployerJobApplication.model';
import EmployerInterviewInvitation from '../models/EmployerInterviewInvitation.model';
import { employerInterviewInvitationService } from './EmployerInterviewInvitationService';
import Interview, { IInterview } from '../models/interview.model';
import { InterviewPurpose, InterviewStatus } from '../constants/interview';
import EmployerInterviewCompetencyRubric, { IEmployerInterviewCompetencyRubric } from '../models/EmployerInterviewCompetencyRubric.model';
import EmployerHiringAssessmentResult, { IEmployerHiringAssessmentResult } from '../models/EmployerHiringAssessmentResult.model';
import { EmployerJobCompetencyImportance } from '../constants/employerJobDescriptionCompetencies';
import EmployerHiringEvidenceMatrix, {
  IEmployerHiringEvidenceMatrix,
  IHiringEvidenceMatrix,
  IEvidenceCompetency,
  IEvidenceSourceQuestion,
  EvidenceStatus,
} from '../models/EmployerHiringEvidenceMatrix.model';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const CALCULATION_VERSION = 'hiring-evidence-matrix-v1';
const MAX_EVIDENCE_ITEMS = 10;
const MAX_STRING_LENGTH = 300;

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
 * Deterministically builds an evidence matrix from a hiring-assessment
 * Interview's 21D question evaluations + its 21E assessment result (22A)
 * — NO AI, no new questions, no hiring recommendation. Pins the exact
 * interviewId/blueprintId/rubricId/assessmentResultId used at creation
 * time; a matrix is never updated/recalculated, and a new hiring session
 * always gets its own separate matrix row.
 */
export class EmployerHiringEvidenceMatrixService {
  /** POST .../interview-session/evidence — deterministic create. An existing matrix is returned as-is, never recomputed. */
  async createMatrix(
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

    // Idempotent — an existing matrix is returned as-is, no new computation.
    const existing = await EmployerHiringEvidenceMatrix.findOne({ organizationId: organization._id, interviewId: interview._id });
    if (existing) {
      return this.toDetail(existing);
    }

    this.assertEvaluatedPrerequisites(interview);

    const assessmentResult = await EmployerHiringAssessmentResult.findOne({
      organizationId: organization._id,
      interviewId: interview._id,
    });
    if (!assessmentResult) {
      throw new ApiError(409, 'Assessment result is not ready yet.');
    }

    const rubric = await EmployerInterviewCompetencyRubric.findOne({
      _id: interview.employerRubricId,
      organizationId: organization._id,
    });
    if (!rubric) {
      throw new ApiError(409, 'Interview evaluation rubric is not ready');
    }

    const matrix = this.buildMatrix(interview, rubric, assessmentResult);

    let doc: IEmployerHiringEvidenceMatrix;
    try {
      doc = await EmployerHiringEvidenceMatrix.create({
        organizationId: organization._id,
        applicationId: application._id,
        jobId: interview.employerJobId,
        candidateId: interview.employerCandidateId,
        interviewId: interview._id,
        blueprintId: interview.employerBlueprintId,
        rubricId: interview.employerRubricId,
        assessmentResultId: assessmentResult._id,
        matrix,
      });
    } catch (error: any) {
      if (error?.code !== 11000) {
        throw error;
      }
      // Concurrent duplicate create — the model's own unique index is the
      // authoritative guard; refetch whoever actually won.
      const winner = await EmployerHiringEvidenceMatrix.findOne({ organizationId: organization._id, interviewId: interview._id });
      if (!winner) {
        throw new ApiError(409, 'Evidence analysis is already being prepared — please try again shortly');
      }
      return this.toDetail(winner);
    }

    return this.toDetail(doc);
  }

  /** GET .../interview-session/evidence — the matrix for the CURRENT applicable invitation, or null. Historical read is allowed even on an archived org/application, mirroring every other read in this domain. */
  async getMatrix(
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

    const matrix = await EmployerHiringEvidenceMatrix.findOne({ organizationId: organization._id, interviewId: invitation.interviewId });
    if (!matrix) {
      return null;
    }

    return this.toDetail(matrix);
  }

  private assertEvaluatedPrerequisites(interview: IInterview): void {
    if (interview.status !== InterviewStatus.EVALUATED || interview.hiringEvaluationStatus !== 'completed') {
      throw new ApiError(409, 'This interview has not been evaluated yet.');
    }
    if (interview.questions.length === 0) {
      throw new ApiError(409, 'Interview has no questions to analyze.');
    }
  }

  /**
   * Pure deterministic derivation — NO AI. Every competency in the 21E
   * result must map to an exact rubric competency name (no silent repair);
   * every CRITICAL rubric competency must appear in the matrix, or the
   * whole build fails (409) rather than silently under-representing a
   * critical gap.
   */
  private buildMatrix(
    interview: IInterview,
    rubric: IEmployerInterviewCompetencyRubric,
    assessmentResult: IEmployerHiringAssessmentResult
  ): IHiringEvidenceMatrix {
    const rubricCompetencyNames = new Set(rubric.rubric.competencies.map((c) => c.competencyName));

    const competencies: IEvidenceCompetency[] = [];

    for (const rc of assessmentResult.result.competencies) {
      if (!rubricCompetencyNames.has(rc.competencyName)) {
        throw new ApiError(409, `Assessment result references an unknown competency: ${rc.competencyName}`);
      }

      const sourceQuestions: IEvidenceSourceQuestion[] = [];
      interview.questions.forEach((q, index) => {
        const cs = (q.evaluation?.hiringCompetencyScores ?? []).find((s) => s.competencyName === rc.competencyName);
        if (cs) {
          sourceQuestions.push({
            questionIndex: index,
            questionText: q.questionText,
            rubricScore: cs.score,
            evidence: dedupeCap(cs.evidence),
            missingEvidence: dedupeCap(cs.missingEvidence),
          });
        }
      });

      const evidenceStatus = this.deriveEvidenceStatus(rc.score);

      const followUpReasons: string[] = [];
      if (evidenceStatus === 'partial' || evidenceStatus === 'insufficient') {
        followUpReasons.push('Low competency score');
      }
      if (rc.missingEvidence.length > 0) {
        followUpReasons.push('Missing expected evidence');
      }
      if (rc.importance === EmployerJobCompetencyImportance.CRITICAL && rc.score < 3) {
        followUpReasons.push('Critical competency needs stronger validation');
      }
      if (rc.importance === EmployerJobCompetencyImportance.HIGH && rc.score < 3) {
        followUpReasons.push('High-priority competency needs stronger validation');
      }
      const dedupedReasons = Array.from(new Set(followUpReasons));

      competencies.push({
        competencyName: rc.competencyName,
        importance: rc.importance,
        jdWeight: rc.jdWeight,
        score: rc.score,
        evidenceStatus,
        supportingEvidence: dedupeCap(rc.evidence),
        missingEvidence: dedupeCap(rc.missingEvidence),
        sourceQuestions,
        requiresFollowUp: dedupedReasons.length > 0,
        followUpReasons: dedupedReasons,
      });
    }

    const criticalMissing = rubric.rubric.competencies.filter(
      (c) => c.importance === EmployerJobCompetencyImportance.CRITICAL && !competencies.some((mc) => mc.competencyName === c.competencyName)
    );
    if (criticalMissing.length > 0) {
      throw new ApiError(409, 'Critical competency coverage is missing from the evidence matrix');
    }

    const summary = {
      strongCount: competencies.filter((c) => c.evidenceStatus === 'strong').length,
      sufficientCount: competencies.filter((c) => c.evidenceStatus === 'sufficient').length,
      partialCount: competencies.filter((c) => c.evidenceStatus === 'partial').length,
      insufficientCount: competencies.filter((c) => c.evidenceStatus === 'insufficient').length,
      followUpCompetencyCount: competencies.filter((c) => c.requiresFollowUp).length,
      criticalFollowUpCount: competencies.filter((c) => c.requiresFollowUp && c.importance === EmployerJobCompetencyImportance.CRITICAL).length,
    };

    return { competencies, summary, calculationVersion: CALCULATION_VERSION };
  }

  private deriveEvidenceStatus(score: number): EvidenceStatus {
    if (score >= 4.0) return 'strong';
    if (score >= 3.0) return 'sufficient';
    if (score >= 2.0) return 'partial';
    return 'insufficient';
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

  private toDetail(doc: IEmployerHiringEvidenceMatrix): Record<string, unknown> {
    return {
      id: doc._id.toString(),
      interviewId: doc.interviewId.toString(),
      blueprintId: doc.blueprintId.toString(),
      rubricId: doc.rubricId.toString(),
      assessmentResultId: doc.assessmentResultId.toString(),
      matrix: doc.matrix,
      createdAt: doc.createdAt,
    };
  }
}

export const employerHiringEvidenceMatrixService = new EmployerHiringEvidenceMatrixService();
export default employerHiringEvidenceMatrixService;
