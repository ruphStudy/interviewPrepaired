import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJobApplication from '../models/EmployerJobApplication.model';
import { EmployerJobApplicationStatus } from '../constants/employerJobApplication';
import EmployerCandidateScreening, { IEmployerCandidateScreening, IScreeningResult } from '../models/EmployerCandidateScreening.model';
import { EmployerCandidateScreeningStatus } from '../constants/employerCandidateScreening';
import { employerCandidateScreeningService } from './EmployerCandidateScreeningService';
import EmployerCandidateScreeningScore from '../models/EmployerCandidateScreeningScore.model';
import { employerCandidateScreeningScoreService } from './EmployerCandidateScreeningScoreService';
import EmployerJobIntelligenceSnapshot, { IJobIntelligenceSnapshot, ISnapshotExperience } from '../models/EmployerJobIntelligenceSnapshot.model';
import { EmployerJobSkillRequirement, EmployerJobSkillImportance } from '../constants/employerJobDescriptionSkills';
import EmployerCandidateScreeningGap, {
  IScreeningGap,
  ISkillGap,
  ICompetencyGap,
  IExperienceGap,
  IEducationGap,
  IGapSummary,
} from '../models/EmployerCandidateScreeningGap.model';
import {
  SCREENING_GAP_CALCULATION_VERSION,
  EmployerCandidateGapSeverity,
  EmployerCandidateSkillGapStatus,
  GAP_SCORE_THRESHOLD,
  LOW_JD_WEIGHT_THRESHOLD,
} from '../constants/employerCandidateScreeningGap';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const SEVERITY_ORDER: EmployerCandidateGapSeverity[] = [
  EmployerCandidateGapSeverity.LOW,
  EmployerCandidateGapSeverity.MEDIUM,
  EmployerCandidateGapSeverity.HIGH,
  EmployerCandidateGapSeverity.CRITICAL,
];

/**
 * Candidate Skill & Requirement Gap Analysis (19C) — a deterministic
 * artifact derived ONLY from an already-COMPLETED 19A screening's own
 * persisted `result`, its 19B explainable score (required to already
 * exist, as an integrity anchor), and the exact finalized JD Intelligence
 * Snapshot (17E) the screening was run against. No AI call, no raw JD/
 * resume reads, no re-derivation of skill/competency/experience/education
 * matching. Informational only — never ranks candidates (19D), never
 * automates shortlisting (19E), never generates a remediation/training
 * plan, never mutates the application/candidate/JD/screening/score.
 */
export class EmployerCandidateScreeningGapService {
  /**
   * POST .../screening/gaps — deterministic, so idempotent: if a gap
   * analysis already exists for the CURRENT completed screening, it is
   * returned as-is (never recalculated). Blocked on an archived
   * organization or archived application, mirroring 19A/19B's own
   * mutation convention.
   */
  async generateGaps(organizationId: string, actingRole: OrganizationMemberRole, applicationId: string): Promise<Record<string, unknown>> {
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

    const existing = await EmployerCandidateScreeningGap.findOne({
      organizationId: organization._id,
      screeningId: screening._id,
    }).lean();
    if (existing) {
      return this.toDetail(existing);
    }

    const score = await this.resolveCurrentScoreForScreening(organization._id, actingRole, applicationId, screening);
    const jdSnapshot = await this.loadVerifiedSnapshot(organization._id, screening);
    const gap = this.calculateGap(screening.result as IScreeningResult, jdSnapshot.snapshot);

    try {
      const created = await EmployerCandidateScreeningGap.create({
        organizationId: organization._id,
        screeningId: screening._id,
        screeningScoreId: score._id,
        applicationId: screening.applicationId,
        jobId: screening.jobId,
        candidateId: screening.candidateId,
        jdSnapshotId: screening.jdSnapshotId,
        resumeAnalysisId: screening.resumeAnalysisId,
        gap,
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
    const winner = await EmployerCandidateScreeningGap.findOne({
      organizationId: organization._id,
      screeningId: screening._id,
    }).lean();
    if (!winner) {
      throw new ApiError(409, 'Gap analysis is already being calculated — please try again shortly');
    }
    return this.toDetail(winner);
  }

  /**
   * GET .../screening/gaps — read-only, NEVER calculates. Returns the gap
   * analysis for the CURRENT applicable completed screening, or null if
   * that screening has no gap analysis yet (or no completed screening
   * exists at all). Readable on an archived organization/application for
   * historical access.
   */
  async getGaps(organizationId: string, actingRole: OrganizationMemberRole, applicationId: string): Promise<Record<string, unknown> | null> {
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

    const gap = await EmployerCandidateScreeningGap.findOne({
      organizationId: organization._id,
      screeningId: new Types.ObjectId(currentScreeningDetail.id as string),
    }).lean();

    return gap ? this.toDetail(gap) : null;
  }

  /** GET .../screenings/:screeningId/gaps — optional historical read. Read-only, never calculates. */
  async getGapsForScreening(
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

    const gap = await EmployerCandidateScreeningGap.findOne({ organizationId: organization._id, screeningId: screening._id }).lean();
    return gap ? this.toDetail(gap) : null;
  }

  /**
   * Reuses 19A's own "current applicable screening" derivation rather than
   * duplicating that logic — then, as defense in depth, re-loads the actual
   * document scoped to this EXACT organization + application (never
   * `findById` alone) instead of trusting the plain detail object for
   * anything used in the gap calculation.
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
      throw new ApiError(409, 'Complete a screening for this application before generating a gap analysis.');
    }

    const screening = await EmployerCandidateScreening.findOne({
      _id: currentScreeningDetail.id,
      organizationId,
      applicationId,
    });
    if (!screening || screening.status !== EmployerCandidateScreeningStatus.COMPLETED || !screening.result) {
      throw new ApiError(409, 'Complete a screening for this application before generating a gap analysis.');
    }

    return screening;
  }

  /**
   * Reuses 19B's own "current applicable score" derivation, then verifies
   * — by re-loading with an exact `{organizationId, screeningId}` filter,
   * never `findById` alone — that it truly belongs to THIS exact screening.
   * A 19B score for a different (e.g. older) screening never satisfies
   * this precondition.
   */
  private async resolveCurrentScoreForScreening(
    organizationId: Types.ObjectId,
    actingRole: OrganizationMemberRole,
    applicationId: string,
    screening: IEmployerCandidateScreening
  ) {
    const currentScoreDetail = await employerCandidateScreeningScoreService.getScore(organizationId.toString(), actingRole, applicationId);
    if (!currentScoreDetail) {
      throw new ApiError(409, 'Calculate an explainable score for this application before generating a gap analysis.');
    }

    const score = await EmployerCandidateScreeningScore.findOne({
      _id: currentScoreDetail.id,
      organizationId,
      screeningId: screening._id,
    });
    if (!score) {
      throw new ApiError(409, 'The explainable score for this screening could not be verified.');
    }
    return score;
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
   * The fixed 19C rules. Fails with an integrity error (never silently
   * treats a competency as matched) when a JD competency has no matching
   * entry in the screening's own `competencyMatch` — the same guarantee
   * 19B's score calculation already required to exist, re-verified here
   * independently. A screening skill/competency name with no matching JD
   * entry is simply never looked at — it cannot create a gap row.
   */
  private calculateGap(result: IScreeningResult, snapshot: IJobIntelligenceSnapshot): IScreeningGap {
    const matchByName = new Map(result.competencyMatch.map((m) => [m.competencyName, m]));
    for (const competency of snapshot.competencies) {
      if (!matchByName.has(competency.name)) {
        throw new ApiError(
          409,
          `Screening result is missing a match for JD competency "${competency.name}" — cannot generate a gap analysis.`
        );
      }
    }

    const missingSet = new Set(result.skillMatch.missingSkills.map((s) => s.toLowerCase().trim()));
    const partialSet = new Set(result.skillMatch.partialSkills.map((s) => s.toLowerCase().trim()));

    const skillGaps: ISkillGap[] = [];
    for (const skill of snapshot.skills) {
      const key = skill.name.toLowerCase().trim();
      let status: EmployerCandidateSkillGapStatus | null = null;
      if (missingSet.has(key)) {
        status = EmployerCandidateSkillGapStatus.MISSING;
      } else if (partialSet.has(key)) {
        status = EmployerCandidateSkillGapStatus.PARTIAL;
      }
      if (!status) continue;

      skillGaps.push({
        skillName: skill.name,
        requirement: skill.requirement,
        importance: skill.importance,
        status,
        severity: this.computeSkillGapSeverity(skill.requirement, skill.importance, status),
      });
    }

    const competencyGaps: ICompetencyGap[] = [];
    for (const competency of snapshot.competencies) {
      const match = matchByName.get(competency.name)!;
      if (match.score >= GAP_SCORE_THRESHOLD) continue;

      let severity = this.scoreToSeverityBand(match.score);
      if (competency.weight < LOW_JD_WEIGHT_THRESHOLD) {
        severity = this.downgradeOneLevel(severity);
      }

      competencyGaps.push({
        competencyName: competency.name,
        jdWeight: competency.weight,
        matchScore: match.score,
        severity,
        evidence: match.evidence,
      });
    }

    let experienceGap: IExperienceGap | undefined;
    if (result.experienceMatch.score < GAP_SCORE_THRESHOLD) {
      experienceGap = {
        required: this.buildExperienceRequiredText(snapshot.role.experience),
        score: result.experienceMatch.score,
        severity: this.scoreToSeverityBand(result.experienceMatch.score),
        summary: result.experienceMatch.summary,
      };
    }

    let educationGap: IEducationGap | undefined;
    if (result.educationMatch.score < GAP_SCORE_THRESHOLD) {
      educationGap = {
        score: result.educationMatch.score,
        severity: this.scoreToSeverityBand(result.educationMatch.score),
        summary: result.educationMatch.summary,
      };
    }

    return {
      summary: this.buildSummary(snapshot.skills.length, skillGaps, competencyGaps, experienceGap, educationGap),
      skillGaps,
      competencyGaps,
      experienceGap,
      educationGap,
      strengths: result.strengths.slice(0, 15),
      calculationVersion: SCREENING_GAP_CALCULATION_VERSION,
    };
  }

  /**
   * Deterministic skill-gap severity — an explicit mapping, no AI
   * judgement. Base severity mirrors the JD's own importance rating;
   * MANDATORY skills are escalated to at least HIGH (MANDATORY + CRITICAL
   * importance is always CRITICAL); INFERRED skills are capped at HIGH
   * regardless of importance; PREFERRED skills never receive the mandatory
   * escalation, so they can only reach CRITICAL via CRITICAL importance
   * itself — never "because" they are preferred. A PARTIAL match is
   * exactly one severity level below its MISSING-equivalent (floored at
   * LOW).
   */
  private computeSkillGapSeverity(
    requirement: EmployerJobSkillRequirement,
    importance: EmployerJobSkillImportance,
    status: EmployerCandidateSkillGapStatus
  ): EmployerCandidateGapSeverity {
    let severity = this.importanceToSeverity(importance);

    if (requirement === EmployerJobSkillRequirement.MANDATORY) {
      severity = this.maxSeverity(severity, EmployerCandidateGapSeverity.HIGH);
      if (importance === EmployerJobSkillImportance.CRITICAL) {
        severity = EmployerCandidateGapSeverity.CRITICAL;
      }
    }

    if (requirement === EmployerJobSkillRequirement.INFERRED) {
      severity = this.capSeverity(severity, EmployerCandidateGapSeverity.HIGH);
    }

    if (status === EmployerCandidateSkillGapStatus.PARTIAL) {
      severity = this.downgradeOneLevel(severity);
    }

    return severity;
  }

  private importanceToSeverity(importance: EmployerJobSkillImportance): EmployerCandidateGapSeverity {
    switch (importance) {
      case EmployerJobSkillImportance.CRITICAL:
        return EmployerCandidateGapSeverity.CRITICAL;
      case EmployerJobSkillImportance.HIGH:
        return EmployerCandidateGapSeverity.HIGH;
      case EmployerJobSkillImportance.MEDIUM:
        return EmployerCandidateGapSeverity.MEDIUM;
      case EmployerJobSkillImportance.LOW:
      default:
        return EmployerCandidateGapSeverity.LOW;
    }
  }

  /** Competency/experience/education severity band for any score already known to be < GAP_SCORE_THRESHOLD. */
  private scoreToSeverityBand(score: number): EmployerCandidateGapSeverity {
    if (score <= 39) return EmployerCandidateGapSeverity.CRITICAL;
    if (score <= 54) return EmployerCandidateGapSeverity.HIGH;
    return EmployerCandidateGapSeverity.MEDIUM; // 55–69
  }

  private maxSeverity(a: EmployerCandidateGapSeverity, b: EmployerCandidateGapSeverity): EmployerCandidateGapSeverity {
    return SEVERITY_ORDER.indexOf(a) >= SEVERITY_ORDER.indexOf(b) ? a : b;
  }

  private capSeverity(severity: EmployerCandidateGapSeverity, max: EmployerCandidateGapSeverity): EmployerCandidateGapSeverity {
    return SEVERITY_ORDER.indexOf(severity) > SEVERITY_ORDER.indexOf(max) ? max : severity;
  }

  private downgradeOneLevel(severity: EmployerCandidateGapSeverity): EmployerCandidateGapSeverity {
    const idx = SEVERITY_ORDER.indexOf(severity);
    return SEVERITY_ORDER[Math.max(idx - 1, 0)];
  }

  /** Formats only numbers/text already present on the JD snapshot — never invents a requirement. */
  private buildExperienceRequiredText(experience?: ISnapshotExperience): string | undefined {
    if (!experience) return undefined;
    if (experience.description) return experience.description;
    if (experience.minYears !== undefined && experience.maxYears !== undefined) {
      return `${experience.minYears}-${experience.maxYears} years`;
    }
    if (experience.minYears !== undefined) return `${experience.minYears}+ years`;
    if (experience.maxYears !== undefined) return `Up to ${experience.maxYears} years`;
    return undefined;
  }

  private buildSummary(
    totalJdSkills: number,
    skillGaps: ISkillGap[],
    competencyGaps: ICompetencyGap[],
    experienceGap?: IExperienceGap,
    educationGap?: IEducationGap
  ): IGapSummary {
    const allSeverities: EmployerCandidateGapSeverity[] = [
      ...skillGaps.map((g) => g.severity),
      ...competencyGaps.map((g) => g.severity),
      ...(experienceGap ? [experienceGap.severity] : []),
      ...(educationGap ? [educationGap.severity] : []),
    ];

    return {
      criticalGapCount: allSeverities.filter((s) => s === EmployerCandidateGapSeverity.CRITICAL).length,
      highGapCount: allSeverities.filter((s) => s === EmployerCandidateGapSeverity.HIGH).length,
      mediumGapCount: allSeverities.filter((s) => s === EmployerCandidateGapSeverity.MEDIUM).length,
      lowGapCount: allSeverities.filter((s) => s === EmployerCandidateGapSeverity.LOW).length,
      matchedSkillCount: Math.max(totalJdSkills - skillGaps.length, 0),
      partialSkillCount: skillGaps.filter((g) => g.status === EmployerCandidateSkillGapStatus.PARTIAL).length,
      missingSkillCount: skillGaps.filter((g) => g.status === EmployerCandidateSkillGapStatus.MISSING).length,
    };
  }

  /** An archived application is never (re-)analyzed — matches the same convention as 19A/19B and every other application mutation (18D). */
  private assertApplicationMutable(status: EmployerJobApplicationStatus): void {
    if (status === EmployerJobApplicationStatus.ARCHIVED) {
      throw new ApiError(409, 'This application is archived — gap analysis is disabled');
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

  /** Type guard — candidate gap analysis doesn't apply to an institute org. */
  private assertIsCompany(organization: IOrganization): void {
    if (organization.type !== OrganizationType.COMPANY) {
      throw new ApiError(400, 'This organization is not a company');
    }
  }

  private toDetail(doc: any): Record<string, unknown> {
    return {
      id: doc._id.toString(),
      screeningId: doc.screeningId.toString(),
      screeningScoreId: doc.screeningScoreId.toString(),
      applicationId: doc.applicationId.toString(),
      jobId: doc.jobId.toString(),
      candidateId: doc.candidateId.toString(),
      jdSnapshotId: doc.jdSnapshotId.toString(),
      resumeAnalysisId: doc.resumeAnalysisId.toString(),
      gap: doc.gap,
      createdAt: doc.createdAt,
    };
  }
}

export const employerCandidateScreeningGapService = new EmployerCandidateScreeningGapService();
