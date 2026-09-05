import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJobApplication from '../models/EmployerJobApplication.model';
import { employerInterviewBlueprintService } from './EmployerInterviewBlueprintService';
import { EmployerInterviewBlueprintStatus } from '../constants/employerInterviewBlueprint';
import EmployerJobIntelligenceSnapshot, { IJobIntelligenceSnapshot } from '../models/EmployerJobIntelligenceSnapshot.model';
import EmployerInterviewCompetencyRubric, {
  IInterviewCompetencyRubric,
  IRubricCompetency,
  IRubricCoverage,
  IRubricScoringAnchors,
} from '../models/EmployerInterviewCompetencyRubric.model';
import { EmployerJobCompetencyImportance } from '../constants/employerJobDescriptionCompetencies';
import {
  INTERVIEW_RUBRIC_CALCULATION_VERSION,
  MAX_EVIDENCE_SIGNALS,
  MAX_EVIDENCE_SIGNAL_LENGTH,
  WEIGHT_SUM_TOLERANCE,
} from '../constants/employerInterviewCompetencyRubric';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

/**
 * Interview competency coverage / evaluation rubric (20B) — a
 * DETERMINISTIC (no AI, no new external call of any kind) transformation
 * of a COMPLETED 20A blueprint + the exact finalized JD competencies it
 * was generated from into an immutable interviewer evaluation rubric.
 * Reuses the EXISTING 20A `getCurrentBlueprint` to resolve the current
 * applicable blueprint rather than re-deriving that resolution a second
 * time. Never reads raw JD/resume text, candidate identity/contact,
 * recruiter notes, or application source — only the blueprint's own
 * sections/question plans and the JD snapshot's competency list.
 */
export class EmployerInterviewCompetencyRubricService {
  /** GET .../interview-blueprint/rubric — the rubric for the CURRENT applicable blueprint, or null if never generated for that exact blueprint. Read-only, so an archived organization/application remains readable. */
  async getCurrentRubric(
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

    const blueprintDetail = await employerInterviewBlueprintService.getCurrentBlueprint(organizationId, actingRole, applicationId);
    if (!blueprintDetail || blueprintDetail.status !== EmployerInterviewBlueprintStatus.COMPLETED) {
      return null;
    }

    const rubric = await EmployerInterviewCompetencyRubric.findOne({
      organizationId: organization._id,
      blueprintId: new Types.ObjectId(blueprintDetail.id as string),
    }).lean();

    return rubric ? this.toDetail(rubric) : null;
  }

  /** GET .../interview-blueprints/:blueprintId/rubric — the rubric for one EXACT historical blueprint, or null. The blueprint itself must exist in this exact org+application, or 404. */
  async getRubricForBlueprint(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    applicationId: string,
    blueprintId: string
  ): Promise<Record<string, unknown> | null> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id }).select('_id');
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }

    const blueprints = await employerInterviewBlueprintService.getBlueprintHistory(organizationId, actingRole, applicationId);
    const blueprintDetail = blueprints.blueprints.find((b) => b.id === blueprintId);
    if (!blueprintDetail) {
      throw new ApiError(404, 'Interview blueprint not found');
    }

    const rubric = await EmployerInterviewCompetencyRubric.findOne({
      organizationId: organization._id,
      blueprintId: new Types.ObjectId(blueprintId),
    }).lean();

    return rubric ? this.toDetail(rubric) : null;
  }

  /**
   * POST .../interview-blueprint/rubric — generates (or returns the
   * already-existing) rubric for the CURRENT applicable COMPLETED 20A
   * blueprint only. No AI call — purely a deterministic transformation of
   * the blueprint's own content + the exact finalized JD snapshot it was
   * generated from.
   */
  async generateRubric(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    actorMembershipId: string,
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

    const blueprintDetail = await employerInterviewBlueprintService.getCurrentBlueprint(organizationId, actingRole, applicationId);
    if (!blueprintDetail || blueprintDetail.status !== EmployerInterviewBlueprintStatus.COMPLETED || !blueprintDetail.blueprint) {
      throw new ApiError(409, 'Generate a completed interview blueprint before generating an evaluation rubric');
    }

    const blueprintId = new Types.ObjectId(blueprintDetail.id as string);

    // Deterministic and idempotent — a rubric for this exact blueprint already exists, return it rather than recomputing.
    const existingRubric = await EmployerInterviewCompetencyRubric.findOne({ organizationId: organization._id, blueprintId }).lean();
    if (existingRubric) {
      return this.toDetail(existingRubric);
    }

    const jobId = new Types.ObjectId(blueprintDetail.jobId as string);
    const candidateId = new Types.ObjectId(blueprintDetail.candidateId as string);
    const screeningId = new Types.ObjectId(blueprintDetail.screeningId as string);
    const jdSnapshotId = new Types.ObjectId(blueprintDetail.jdSnapshotId as string);

    const jdSnapshot = await EmployerJobIntelligenceSnapshot.findOne({
      _id: jdSnapshotId,
      organizationId: organization._id,
      jobId,
    });
    if (!jdSnapshot) {
      throw new ApiError(409, 'The JD intelligence snapshot this blueprint was generated from could not be found');
    }

    this.assertWeightIntegrity(jdSnapshot.snapshot);

    const rubric = this.buildRubric(jdSnapshot.snapshot, blueprintDetail.blueprint as any);
    this.assertCriticalCoverageIntegrity(rubric.coverage);

    try {
      const created = await EmployerInterviewCompetencyRubric.create({
        organizationId: organization._id,
        applicationId: application._id,
        jobId,
        candidateId,
        blueprintId,
        screeningId,
        jdSnapshotId,
        rubric,
        createdByMembershipId: new Types.ObjectId(actorMembershipId),
      });
      return this.toDetail(created.toObject());
    } catch (error: any) {
      if (error?.code !== 11000) {
        throw error;
      }
      // Concurrent duplicate — the unique {organizationId, blueprintId} index
      // already resolved a winner; since the calculation is deterministic,
      // returning it (rather than erroring) is correct.
      const winner = await EmployerInterviewCompetencyRubric.findOne({ organizationId: organization._id, blueprintId }).lean();
      if (!winner) {
        throw new ApiError(409, 'Evaluation rubric is already being generated — please try again shortly');
      }
      return this.toDetail(winner);
    }
  }

  /** Copies JD competency weights verbatim — 20B never renormalizes them, only verifies 17D/17E's own contract that they already sum to ~100. */
  private assertWeightIntegrity(jdSnapshot: IJobIntelligenceSnapshot): void {
    const total = jdSnapshot.competencies.reduce((sum, c) => sum + c.weight, 0);
    if (Math.abs(total - 100) > WEIGHT_SUM_TOLERANCE) {
      throw new ApiError(409, 'JD competency weights do not sum to 100 — cannot generate a rubric from inconsistent data');
    }
  }

  /** 20A is supposed to guarantee every CRITICAL competency is covered — 20B verifies that contract rather than silently pretending coverage exists. */
  private assertCriticalCoverageIntegrity(coverage: IRubricCoverage): void {
    if (coverage.criticalCovered < coverage.criticalTotal) {
      throw new ApiError(409, 'The interview blueprint does not provide coverage for all critical competencies');
    }
  }

  /**
   * Iterates JD snapshot competencies ONLY — an unknown blueprint
   * competency name (one that doesn't exactly match a JD competency) never
   * creates a rubric row. For each JD competency, finds the blueprint
   * sections that reference it by exact name, sums their planned question
   * counts, and builds a deterministic 1-5 scoring anchor set using only
   * the competency's own name (never inventing a technical requirement).
   */
  private buildRubric(jdSnapshot: IJobIntelligenceSnapshot, blueprint: { sections: Array<{ id: string; competencies: string[]; questionPlan: unknown[] }> }): IInterviewCompetencyRubric {
    const competencies: IRubricCompetency[] = jdSnapshot.competencies.map((competency) => {
      const matchingSections = blueprint.sections.filter((section) => section.competencies.includes(competency.name));
      const sectionIds = matchingSections.map((section) => section.id);
      const plannedIntentCount = matchingSections.reduce((sum, section) => sum + section.questionPlan.length, 0);

      return {
        competencyName: competency.name,
        description: competency.description,
        jdWeight: competency.weight,
        importance: competency.importance,
        sectionIds,
        plannedIntentCount,
        evidenceSignals: this.cleanEvidenceSignals(competency.interviewSignals),
        scoringAnchors: this.buildScoringAnchors(competency.name),
      };
    });

    const coverage = this.computeCoverage(competencies);

    return {
      competencies,
      coverage,
      calculationVersion: INTERVIEW_RUBRIC_CALCULATION_VERSION,
    };
  }

  private cleanEvidenceSignals(signals: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of signals) {
      if (typeof raw !== 'string') continue;
      const trimmed = raw.trim().slice(0, MAX_EVIDENCE_SIGNAL_LENGTH);
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(trimmed);
      if (result.length >= MAX_EVIDENCE_SIGNALS) break;
    }
    return result;
  }

  /** A fixed, consistent 1-5 framework — made competency-aware only by inserting the competency's own name; never invents a technical requirement. */
  private buildScoringAnchors(competencyName: string): IRubricScoringAnchors {
    return {
      score1: `No relevant evidence for "${competencyName}" — the candidate's responses did not address this competency, or fell materially below the expected level.`,
      score2: `Limited evidence for "${competencyName}" — some relevant responses, but significant gaps remain relative to the expected level.`,
      score3: `Sufficient evidence for "${competencyName}" — the candidate's responses meet the expected level for this role.`,
      score4: `Strong evidence for "${competencyName}" — the candidate's responses exceed the expected level, with clear, well-supported examples.`,
      score5: `Exceptional, consistent evidence for "${competencyName}" — the candidate substantially exceeds the expected level across multiple responses.`,
    };
  }

  private computeCoverage(competencies: IRubricCompetency[]): IRubricCoverage {
    const isCovered = (c: IRubricCompetency) => c.sectionIds.length > 0 && c.plannedIntentCount > 0;

    const totalCompetencies = competencies.length;
    const coveredList = competencies.filter(isCovered);
    const coveredCompetencies = coveredList.length;
    const uncoveredCompetencies = competencies.filter((c) => !isCovered(c)).map((c) => c.competencyName);

    const criticalCompetencies = competencies.filter((c) => c.importance === EmployerJobCompetencyImportance.CRITICAL);
    const highCompetencies = competencies.filter((c) => c.importance === EmployerJobCompetencyImportance.HIGH);

    return {
      totalCompetencies,
      coveredCompetencies,
      uncoveredCompetencies,
      criticalTotal: criticalCompetencies.length,
      criticalCovered: criticalCompetencies.filter(isCovered).length,
      highTotal: highCompetencies.length,
      highCovered: highCompetencies.filter(isCovered).length,
      coveragePercent: totalCompetencies > 0 ? Math.round((coveredCompetencies / totalCompetencies) * 100) : 0,
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

  private assertOrganizationMutable(organization: IOrganization): void {
    if (organization.status === OrganizationStatus.ARCHIVED) {
      throw new ApiError(409, 'Organization is archived');
    }
  }

  /** Type guard — interview rubrics don't apply to an institute org. */
  private assertIsCompany(organization: IOrganization): void {
    if (organization.type !== OrganizationType.COMPANY) {
      throw new ApiError(400, 'This organization is not a company');
    }
  }

  /** Never exposes auth/security internals — just the rubric plus its scoping ids. */
  private toDetail(doc: any): Record<string, unknown> {
    return {
      id: doc._id.toString(),
      applicationId: doc.applicationId.toString(),
      jobId: doc.jobId.toString(),
      candidateId: doc.candidateId.toString(),
      blueprintId: doc.blueprintId.toString(),
      screeningId: doc.screeningId.toString(),
      jdSnapshotId: doc.jdSnapshotId.toString(),
      rubric: doc.rubric,
      createdByMembershipId: doc.createdByMembershipId.toString(),
      createdAt: doc.createdAt,
    };
  }
}

export const employerInterviewCompetencyRubricService = new EmployerInterviewCompetencyRubricService();
