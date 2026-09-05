import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJobApplication from '../models/EmployerJobApplication.model';
import { EmployerJobApplicationStatus } from '../constants/employerJobApplication';
import EmployerCandidateScreening, { IEmployerCandidateScreening, IScreeningResult } from '../models/EmployerCandidateScreening.model';
import { EmployerCandidateScreeningStatus } from '../constants/employerCandidateScreening';
import { employerCandidateScreeningService } from './EmployerCandidateScreeningService';
import EmployerJobIntelligenceSnapshot, { IJobIntelligenceSnapshot } from '../models/EmployerJobIntelligenceSnapshot.model';
import EmployerCandidateScreeningScore, {
  IScreeningScore,
  IScreeningScoreCompetencyBreakdown,
} from '../models/EmployerCandidateScreeningScore.model';
import { SCREENING_SCORE_CALCULATION_VERSION, SCREENING_SCORE_WEIGHTS } from '../constants/employerCandidateScreeningScore';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Explainable Candidate Score (19B) — a deterministic, fixed-formula
 * breakdown of an already-COMPLETED 19A screening. Reads ONLY the
 * screening's own persisted `result` and the exact JD Intelligence Snapshot
 * (17E) it was screened against — never raw JD/resume text, never a new AI
 * call, never a recalculation of skill/competency/experience/education
 * matching. This calculated `score.overallScore` is a SEPARATE, distinct
 * number from the AI's own `screening.result.overallScore` — it is never
 * copied over or used to overwrite that field. No ranking across candidates
 * (19D), no deeper gap analysis beyond this breakdown (19C), no shortlist
 * automation (19E).
 */
export class EmployerCandidateScreeningScoreService {
  /**
   * POST .../screening/score — deterministic, so idempotent: if a score
   * already exists for the CURRENT completed screening, it is returned
   * as-is (never recalculated); otherwise it is calculated and persisted.
   * Blocked on an archived organization or archived application, mirroring
   * 19A's own mutation convention.
   */
  async generateScore(organizationId: string, actingRole: OrganizationMemberRole, applicationId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id }).select('_id status');
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }
    this.assertApplicationMutable(application.status);

    const screening = await this.resolveCurrentCompletedScreening(organization._id, actingRole, applicationId);

    const existing = await EmployerCandidateScreeningScore.findOne({
      organizationId: organization._id,
      screeningId: screening._id,
    }).lean();
    if (existing) {
      return this.toDetail(existing);
    }

    const jdSnapshot = await this.loadVerifiedSnapshot(organization._id, screening);
    const score = this.calculateScore(screening.result as IScreeningResult, jdSnapshot.snapshot);

    try {
      const created = await EmployerCandidateScreeningScore.create({
        organizationId: organization._id,
        screeningId: screening._id,
        applicationId: screening.applicationId,
        jobId: screening.jobId,
        candidateId: screening.candidateId,
        jdSnapshotId: screening.jdSnapshotId,
        resumeAnalysisId: screening.resumeAnalysisId,
        score,
      });
      return this.toDetail(created.toObject());
    } catch (error: any) {
      if (error?.code !== 11000) {
        throw error;
      }
    }

    // Concurrent duplicate — the unique {organizationId, screeningId} index
    // already resolved a winner; since the calculation is deterministic,
    // returning it (rather than erroring) is correct.
    const winner = await EmployerCandidateScreeningScore.findOne({
      organizationId: organization._id,
      screeningId: screening._id,
    }).lean();
    if (!winner) {
      throw new ApiError(409, 'Score is already being calculated — please try again shortly');
    }
    return this.toDetail(winner);
  }

  /**
   * GET .../screening/score — read-only, NEVER calculates. Returns the
   * score for the CURRENT applicable completed screening, or null if that
   * screening has no score yet (or no completed screening exists at all).
   * Readable on an archived organization/application for historical access.
   */
  async getScore(organizationId: string, actingRole: OrganizationMemberRole, applicationId: string): Promise<Record<string, unknown> | null> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id }).select('_id');
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }

    const currentScreeningDetail = await employerCandidateScreeningService.getCurrentScreening(organizationId, actingRole, applicationId);
    if (!currentScreeningDetail || currentScreeningDetail.status !== EmployerCandidateScreeningStatus.COMPLETED) {
      return null;
    }

    const score = await EmployerCandidateScreeningScore.findOne({
      organizationId: organization._id,
      screeningId: new Types.ObjectId(currentScreeningDetail.id as string),
    }).lean();

    return score ? this.toDetail(score) : null;
  }

  /** GET .../screenings/:screeningId/score — optional historical read. Read-only, never calculates. */
  async getScoreForScreening(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    screeningId: string
  ): Promise<Record<string, unknown> | null> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const screening = await EmployerCandidateScreening.findOne({ _id: screeningId, organizationId: organization._id }).select('_id');
    if (!screening) {
      throw new ApiError(404, 'Screening not found');
    }

    const score = await EmployerCandidateScreeningScore.findOne({ organizationId: organization._id, screeningId: screening._id }).lean();
    return score ? this.toDetail(score) : null;
  }

  /**
   * Reuses 19A's own "current applicable screening" derivation (finalized
   * JD snapshot + resolved resume analysis) rather than duplicating that
   * logic — then, as defense in depth, re-loads the actual document scoped
   * to this EXACT organization + application (never `findById` alone)
   * instead of trusting the plain detail object for anything used in
   * scoring.
   */
  private async resolveCurrentCompletedScreening(
    organizationId: Types.ObjectId,
    actingRole: OrganizationMemberRole,
    applicationId: string
  ): Promise<IEmployerCandidateScreening> {
    const currentScreeningDetail = await employerCandidateScreeningService.getCurrentScreening(
      organizationId.toString(),
      actingRole,
      applicationId
    );
    if (!currentScreeningDetail) {
      throw new ApiError(409, 'No screening found for this application. Screen this application first.');
    }
    if (currentScreeningDetail.status !== EmployerCandidateScreeningStatus.COMPLETED) {
      throw new ApiError(409, 'Complete a screening for this application before calculating an explainable score.');
    }

    const screening = await EmployerCandidateScreening.findOne({
      _id: currentScreeningDetail.id,
      organizationId,
      applicationId,
    });
    if (!screening || screening.status !== EmployerCandidateScreeningStatus.COMPLETED || !screening.result) {
      throw new ApiError(409, 'Complete a screening for this application before calculating an explainable score.');
    }

    return screening;
  }

  /** Verifies the snapshot referenced by the screening actually belongs to this organization + job — never loaded by id alone. */
  private async loadVerifiedSnapshot(organizationId: Types.ObjectId, screening: IEmployerCandidateScreening) {
    const jdSnapshot = await EmployerJobIntelligenceSnapshot.findOne({
      _id: screening.jdSnapshotId,
      organizationId,
      jobId: screening.jobId,
    });
    if (!jdSnapshot) {
      throw new ApiError(409, 'The JD Intelligence Snapshot for this screening could not be verified.');
    }
    return jdSnapshot;
  }

  /**
   * The fixed 19B formula. Fails with an integrity error (never silently
   * gives full credit) when a JD competency has no matching entry in the
   * screening's own `competencyMatch`, or when the JD's competency weights
   * don't sum to 100. A screening competency name with no matching JD
   * competency is simply never looked at — it cannot affect scoring.
   */
  private calculateScore(result: IScreeningResult, snapshot: IJobIntelligenceSnapshot): IScreeningScore {
    const competencies = snapshot.competencies;
    const totalWeight = competencies.reduce((sum, c) => sum + c.weight, 0);
    if (competencies.length === 0 || Math.abs(totalWeight - 100) > 0.5) {
      throw new ApiError(409, 'JD competency weights do not sum to 100 — cannot calculate an explainable score.');
    }

    const matchByName = new Map(result.competencyMatch.map((m) => [m.competencyName, m]));

    let weightedCompetencySum = 0;
    const competencyBreakdown: IScreeningScoreCompetencyBreakdown[] = competencies.map((competency) => {
      const match = matchByName.get(competency.name);
      if (!match) {
        throw new ApiError(
          409,
          `Screening result is missing a match for JD competency "${competency.name}" — cannot calculate an explainable score.`
        );
      }
      weightedCompetencySum += match.score * competency.weight;
      return {
        name: competency.name,
        jdWeight: competency.weight,
        matchScore: match.score,
        weightedContribution: round2((match.score * competency.weight) / 100),
        evidence: match.evidence,
      };
    });

    const skillsScore = result.skillMatch.score;
    const competencyScore = round2(weightedCompetencySum / 100);
    const experienceScore = result.experienceMatch.score;
    const educationScore = result.educationMatch.score;

    const skillsContribution = round2(skillsScore * SCREENING_SCORE_WEIGHTS.skills);
    const competencyContribution = round2(competencyScore * SCREENING_SCORE_WEIGHTS.competencies);
    const experienceContribution = round2(experienceScore * SCREENING_SCORE_WEIGHTS.experience);
    const educationContribution = round2(educationScore * SCREENING_SCORE_WEIGHTS.education);

    const overallScore = round2(skillsContribution + competencyContribution + experienceContribution + educationContribution);

    return {
      overallScore,
      components: {
        skills: { score: skillsScore, weight: SCREENING_SCORE_WEIGHTS.skills, contribution: skillsContribution },
        competencies: { score: competencyScore, weight: SCREENING_SCORE_WEIGHTS.competencies, contribution: competencyContribution },
        experience: { score: experienceScore, weight: SCREENING_SCORE_WEIGHTS.experience, contribution: experienceContribution },
        education: { score: educationScore, weight: SCREENING_SCORE_WEIGHTS.education, contribution: educationContribution },
      },
      competencyBreakdown,
      calculationVersion: SCREENING_SCORE_CALCULATION_VERSION,
    };
  }

  /** An archived application is never (re-)scored — matches the same convention as 19A screening and every other application mutation (18D). */
  private assertApplicationMutable(status: EmployerJobApplicationStatus): void {
    if (status === EmployerJobApplicationStatus.ARCHIVED) {
      throw new ApiError(409, 'This application is archived — score calculation is disabled');
    }
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

  private assertOrganizationMutable(organization: IOrganization): void {
    if (organization.status === OrganizationStatus.ARCHIVED) {
      throw new ApiError(409, 'Organization is archived');
    }
  }

  /** Type guard — candidate screening scoring doesn't apply to an institute org. */
  private assertIsCompany(organization: IOrganization): void {
    if (organization.type !== OrganizationType.COMPANY) {
      throw new ApiError(400, 'This organization is not a company');
    }
  }

  private toDetail(doc: any): Record<string, unknown> {
    return {
      id: doc._id.toString(),
      screeningId: doc.screeningId.toString(),
      applicationId: doc.applicationId.toString(),
      jobId: doc.jobId.toString(),
      candidateId: doc.candidateId.toString(),
      jdSnapshotId: doc.jdSnapshotId.toString(),
      resumeAnalysisId: doc.resumeAnalysisId.toString(),
      score: doc.score,
      createdAt: doc.createdAt,
    };
  }
}

export const employerCandidateScreeningScoreService = new EmployerCandidateScreeningScoreService();
