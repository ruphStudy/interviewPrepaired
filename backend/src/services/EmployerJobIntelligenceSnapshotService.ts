import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJob from '../models/EmployerJob.model';
import EmployerJobDescriptionSource from '../models/EmployerJobDescriptionSource.model';
import EmployerJobDescriptionAnalysis, { IJobDescriptionAnalysis } from '../models/EmployerJobDescriptionAnalysis.model';
import EmployerJobDescriptionSkills, { IJobDescriptionSkill } from '../models/EmployerJobDescriptionSkills.model';
import EmployerJobDescriptionCompetencies, { IJobDescriptionCompetency } from '../models/EmployerJobDescriptionCompetencies.model';
import EmployerJobIntelligenceSnapshot, {
  ISnapshotRole,
  ISnapshotMetadata,
} from '../models/EmployerJobIntelligenceSnapshot.model';
import { EmployerJobStatus } from '../constants/employerJob';
import { EmployerJobDescriptionAnalysisStatus } from '../constants/employerJobDescriptionAnalysis';
import { EmployerJobDescriptionSkillsStatus } from '../constants/employerJobDescriptionSkills';
import { EmployerJobDescriptionCompetenciesStatus, MIN_COMPETENCIES } from '../constants/employerJobDescriptionCompetencies';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

interface JobRef {
  _id: Types.ObjectId;
  status: EmployerJobStatus;
}

interface ReadinessState {
  jdExists: boolean;
  analysisCompleted: boolean;
  skillsCompleted: boolean;
  competenciesCompleted: boolean;
  finalized: boolean;
}

/**
 * Final JD intelligence persistence (17E) — NO AI call anywhere in this
 * service. Deterministically integrates the already-completed 17B
 * analysis, 17C skills, and 17D competencies for ONE JD source version into
 * a single immutable snapshot row. This is the final INTEGRITY GATE: 17B/
 * 17C/17D are each individually responsible for normalizing their own
 * output; this service only verifies that their already-persisted results
 * are mutually consistent (same organization/job/source/version, weights
 * summing to exactly 100, every competency's skillNames resolving to an
 * actual persisted skill) — it never repairs bad data, it rejects it.
 * Never mutates the JD source, the 17B analysis, the 17C skills, the 17D
 * competencies, or EmployerJob. Intended as the stable read source for
 * LATER modules (candidate screening, ranking, interview blueprint
 * generation, matching) — none of which exist yet.
 */
export class EmployerJobIntelligenceSnapshotService {
  /**
   * GET .../jd/intelligence — the CURRENT JD source's snapshot (or null),
   * plus a DB-derived readiness checklist. Read-only, so archived org/job
   * remain readable.
   */
  async getCurrentIntelligence(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    jobId: string
  ): Promise<{ snapshot: Record<string, unknown> | null; readiness: ReadinessState }> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    const job = await this.getJobInOrganization(organization._id, jobId);

    const currentSource = await this.getCurrentSource(organization._id, job._id);
    if (!currentSource) {
      return {
        snapshot: null,
        readiness: { jdExists: false, analysisCompleted: false, skillsCompleted: false, competenciesCompleted: false, finalized: false },
      };
    }

    const filter = { organizationId: organization._id, jobId: job._id, jdSourceId: currentSource._id };
    const [analysisDoc, skillsDoc, competenciesDoc, snapshotDoc] = await Promise.all([
      EmployerJobDescriptionAnalysis.findOne(filter).select('status').lean(),
      EmployerJobDescriptionSkills.findOne(filter).select('status skills').lean(),
      EmployerJobDescriptionCompetencies.findOne(filter).select('status competencies').lean(),
      EmployerJobIntelligenceSnapshot.findOne(filter).lean(),
    ]);

    const readiness: ReadinessState = {
      jdExists: true,
      analysisCompleted: analysisDoc?.status === EmployerJobDescriptionAnalysisStatus.COMPLETED,
      skillsCompleted: skillsDoc?.status === EmployerJobDescriptionSkillsStatus.COMPLETED && (skillsDoc?.skills?.length ?? 0) > 0,
      competenciesCompleted:
        competenciesDoc?.status === EmployerJobDescriptionCompetenciesStatus.COMPLETED &&
        (competenciesDoc?.competencies?.length ?? 0) >= MIN_COMPETENCIES,
      finalized: !!snapshotDoc,
    };

    return { snapshot: snapshotDoc ? this.toDetail(snapshotDoc) : null, readiness };
  }

  /** GET .../jd/:jdSourceId/intelligence — snapshot for one EXACT source version, or null if that version was never finalized. The source itself must exist in this exact org+job, or 404. */
  async getIntelligenceForSource(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    jobId: string,
    jdSourceId: string
  ): Promise<Record<string, unknown> | null> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    const job = await this.getJobInOrganization(organization._id, jobId);

    const source = await EmployerJobDescriptionSource.findOne({
      _id: jdSourceId,
      organizationId: organization._id,
      jobId: job._id,
    }).select('_id');
    if (!source) {
      throw new ApiError(404, 'Job description version not found');
    }

    const snapshot = await EmployerJobIntelligenceSnapshot.findOne({
      organizationId: organization._id,
      jobId: job._id,
      jdSourceId: source._id,
    }).lean();

    return snapshot ? this.toDetail(snapshot) : null;
  }

  /**
   * POST .../jd/intelligence/finalize — finalizes the CURRENT JD source
   * only. Requires a COMPLETED 17B analysis, a COMPLETED 17C skill set
   * (non-empty), and a COMPLETED 17D competency set (>= MIN_COMPETENCIES),
   * ALL scoped to this exact source version. If a snapshot already exists
   * for this exact source version, it is returned as-is — no new work, no
   * duplicate row, ever.
   */
  async finalizeCurrentIntelligence(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    actorMembershipId: string,
    jobId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);
    const job = await this.getJobInOrganization(organization._id, jobId);
    this.assertJobMutable(job);

    const currentSource = await this.getCurrentSource(organization._id, job._id);
    if (!currentSource) {
      throw new ApiError(409, 'This job has no job description yet');
    }

    // A finalized snapshot for this exact source version already exists —
    // repeated finalize requests always return it, never re-doing work.
    const existingSnapshot = await EmployerJobIntelligenceSnapshot.findOne({
      organizationId: organization._id,
      jobId: job._id,
      jdSourceId: currentSource._id,
    });
    if (existingSnapshot) {
      return this.toDetail(existingSnapshot.toObject());
    }

    const filter = { organizationId: organization._id, jobId: job._id, jdSourceId: currentSource._id };

    const analysisDoc = await EmployerJobDescriptionAnalysis.findOne(filter);
    if (!analysisDoc || analysisDoc.status !== EmployerJobDescriptionAnalysisStatus.COMPLETED || !analysisDoc.analysis) {
      throw new ApiError(409, 'Analyze the job description before finalizing intelligence');
    }

    const skillsDoc = await EmployerJobDescriptionSkills.findOne(filter);
    if (!skillsDoc || skillsDoc.status !== EmployerJobDescriptionSkillsStatus.COMPLETED || skillsDoc.skills.length === 0) {
      throw new ApiError(409, 'Extract skills before finalizing intelligence');
    }

    const competenciesDoc = await EmployerJobDescriptionCompetencies.findOne(filter);
    if (
      !competenciesDoc ||
      competenciesDoc.status !== EmployerJobDescriptionCompetenciesStatus.COMPLETED ||
      competenciesDoc.competencies.length < MIN_COMPETENCIES
    ) {
      throw new ApiError(409, 'Generate competencies before finalizing intelligence');
    }

    // Final integrity gate — 17B/17C/17D are each responsible for their own
    // normalization; this never repairs inconsistent data, only rejects it.
    this.assertArtifactsConsistent(currentSource.version, analysisDoc.jdVersion, skillsDoc.jdVersion, competenciesDoc.jdVersion);
    this.assertWeightsIntegrity(competenciesDoc.competencies);
    this.assertSkillReferencesIntegrity(competenciesDoc.competencies, skillsDoc.skills);

    const snapshotContent = {
      role: this.buildRole(analysisDoc.analysis),
      skills: skillsDoc.skills,
      competencies: competenciesDoc.competencies,
      metadata: this.buildMetadata(currentSource.version, analysisDoc.analysis, skillsDoc.skills, competenciesDoc.competencies),
    };

    try {
      const created = await EmployerJobIntelligenceSnapshot.create({
        organizationId: organization._id,
        jobId: job._id,
        jdSourceId: currentSource._id,
        jdVersion: currentSource.version,
        analysisId: analysisDoc._id,
        skillsId: skillsDoc._id,
        competenciesId: competenciesDoc._id,
        snapshot: snapshotContent,
        finalizedByMembershipId: new Types.ObjectId(actorMembershipId),
        finalizedAt: new Date(),
      });
      return this.toDetail(created.toObject());
    } catch (error: any) {
      if (error?.code === 11000) {
        // Lost a concurrent race to finalize this exact source version —
        // the winner's snapshot is equally valid; return it, never a second row.
        const raceWinner = await EmployerJobIntelligenceSnapshot.findOne({
          organizationId: organization._id,
          jobId: job._id,
          jdSourceId: currentSource._id,
        }).lean();
        if (raceWinner) {
          return this.toDetail(raceWinner);
        }
      }
      throw error;
    }
  }

  /** Copies only the useful normalized 17B fields — never raw JD text, never re-derived/rewritten. */
  private buildRole(analysis: IJobDescriptionAnalysis): ISnapshotRole {
    const experience =
      analysis.experience.minYears !== undefined || analysis.experience.maxYears !== undefined || analysis.experience.description
        ? {
            minYears: analysis.experience.minYears,
            maxYears: analysis.experience.maxYears,
            description: analysis.experience.description,
          }
        : undefined;

    return {
      jobTitle: analysis.jobTitle,
      summary: analysis.summary,
      rolePurpose: analysis.rolePurpose,
      experience,
      education: analysis.education,
      domainKnowledge: analysis.domainKnowledge,
      location: analysis.location,
      workplaceType: analysis.workplaceType,
      employmentType: analysis.employmentType,
    };
  }

  private buildMetadata(
    sourceVersion: number,
    analysis: IJobDescriptionAnalysis,
    skills: IJobDescriptionSkill[],
    competencies: IJobDescriptionCompetency[]
  ): ISnapshotMetadata {
    return {
      sourceVersion,
      analysisConfidence: analysis.confidence?.overall,
      skillCount: skills.length,
      competencyCount: competencies.length,
      totalCompetencyWeight: competencies.reduce((sum, c) => sum + c.weight, 0),
    };
  }

  /** All three source artifacts must agree on the exact same JD version as the current source itself — never mixing artifacts from different JD versions. */
  private assertArtifactsConsistent(sourceVersion: number, analysisVersion: number, skillsVersion: number, competenciesVersion: number): void {
    if (analysisVersion !== sourceVersion || skillsVersion !== sourceVersion || competenciesVersion !== sourceVersion) {
      throw new ApiError(500, 'Job description intelligence artifacts are inconsistent for this version');
    }
  }

  /** 17D is supposed to guarantee this already — a mismatch here means upstream normalization broke, which 17E rejects rather than silently re-normalizing. */
  private assertWeightsIntegrity(competencies: IJobDescriptionCompetency[]): void {
    const total = competencies.reduce((sum, c) => sum + c.weight, 0);
    if (total !== 100) {
      throw new ApiError(500, 'Competency weights do not total 100 — cannot finalize an inconsistent snapshot');
    }
  }

  /** Every competency.skillNames entry must reference an actual persisted 17C skill name — 17D is supposed to guarantee this already. */
  private assertSkillReferencesIntegrity(competencies: IJobDescriptionCompetency[], skills: IJobDescriptionSkill[]): void {
    const validNames = new Set(skills.map((s) => s.name));
    for (const competency of competencies) {
      for (const skillName of competency.skillNames) {
        if (!validNames.has(skillName)) {
          throw new ApiError(500, 'A competency references a skill that does not exist in the skill set — cannot finalize an inconsistent snapshot');
        }
      }
    }
  }

  /** The current JD source is always the highest-version row for the job — same derivation as EmployerJobDescriptionService/17B/17C/17D. */
  private async getCurrentSource(organizationId: Types.ObjectId, jobId: Types.ObjectId) {
    return EmployerJobDescriptionSource.findOne({ organizationId, jobId }).sort({ version: -1 });
  }

  /** Exact {_id, organizationId} match only — a cross-org job id is treated identically to a nonexistent one (404). */
  private async getJobInOrganization(organizationId: Types.ObjectId, jobId: string): Promise<JobRef> {
    const job = await EmployerJob.findOne({ _id: jobId, organizationId }).select('_id status').lean();
    if (!job) {
      throw new ApiError(404, 'Job not found');
    }
    return { _id: job._id as Types.ObjectId, status: job.status };
  }

  /** An archived JOB (independent of organization archival) can still have its intelligence read, but never finalized. */
  private assertJobMutable(job: JobRef): void {
    if (job.status === EmployerJobStatus.ARCHIVED) {
      throw new ApiError(409, 'Job is archived and its job description intelligence cannot be finalized');
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

  /** Type guard — JD intelligence doesn't apply to an institute org. */
  private assertIsCompany(organization: IOrganization): void {
    if (organization.type !== OrganizationType.COMPANY) {
      throw new ApiError(400, 'This organization is not a company');
    }
  }

  /** Never exposes auth/provider/internal metadata — matches the task's exact response shape. */
  private toDetail(doc: any): Record<string, unknown> {
    return {
      id: doc._id.toString(),
      jobId: doc.jobId.toString(),
      jdSourceId: doc.jdSourceId.toString(),
      jdVersion: doc.jdVersion,
      analysisId: doc.analysisId.toString(),
      skillsId: doc.skillsId.toString(),
      competenciesId: doc.competenciesId.toString(),
      snapshot: doc.snapshot,
      finalizedByMembershipId: doc.finalizedByMembershipId.toString(),
      finalizedAt: doc.finalizedAt,
      createdAt: doc.createdAt,
    };
  }
}

export const employerJobIntelligenceSnapshotService = new EmployerJobIntelligenceSnapshotService();
