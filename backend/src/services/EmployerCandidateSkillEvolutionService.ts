import Organization, { IOrganization } from '../models/Organization.model';
import EmployerCandidate from '../models/EmployerCandidate.model';
import EmployerSkillNode from '../models/EmployerSkillNode.model';
import EmployerCandidateSkillMemory, { ISkillMemoryObservation } from '../models/EmployerCandidateSkillMemory.model';
import EmployerCandidateSkillEvolution, {
  ISkillEvolutionObservationSnapshot,
  EmployerSkillEvolutionTrend,
  EmployerSkillEvidenceRecencyBucket,
} from '../models/EmployerCandidateSkillEvolution.model';
import { EmployerSkillClassification } from '../models/EmployerApplicationSkillIntelligence.model';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const CALCULATION_VERSION = 'skill-evolution-v1';
const RECENT_MAX_DAYS = 90;
const AGING_MAX_DAYS = 180;
const SCORE_DELTA_THRESHOLD = 15;

const CLASSIFICATION_RANK: Record<Exclude<EmployerSkillClassification, 'additional_candidate_skill'>, number> = {
  missing: 0,
  limited_evidence: 1,
  supported: 2,
  strong_evidence: 3,
};

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));
}

function recencyBucket(days: number): EmployerSkillEvidenceRecencyBucket {
  if (days <= RECENT_MAX_DAYS) return 'recent';
  if (days <= AGING_MAX_DAYS) return 'aging';
  return 'stale';
}

/**
 * Deterministic (no AI) skill-EVIDENCE evolution derived from an existing
 * 25C `EmployerCandidateSkillMemory` row per skill (25D). "Trend" describes
 * how the STRUCTURED EVIDENCE this organization has collected changed —
 * never a claim that the candidate's actual skill improved or declined.
 * Requires existing 25C memory; never auto-refreshes it.
 */
export class EmployerCandidateSkillEvolutionService {
  /**
   * Deterministic classification-rank comparison (used only when no
   * comparable numeric evidence-strength delta is available). `missing` <
   * `limited_evidence` < `supported` < `strong_evidence`.
   * `additional_candidate_skill` is handled by the caller BEFORE reaching
   * rank comparison — it never receives a rank here.
   */
  private classificationRank(classification: EmployerSkillClassification): number {
    return CLASSIFICATION_RANK[classification as Exclude<EmployerSkillClassification, 'additional_candidate_skill'>] ?? 0;
  }

  /**
   * Trend rule (see Sprint 25D spec):
   * - No previous observation => `first_observation`.
   * - If EITHER compared observation is `additional_candidate_skill` (its
   *   presence reflects job-requirement context changing across
   *   applications, not evidence strength changing for the same
   *   requirement) => `stable_evidence`, UNLESS both sides carry a numeric
   *   evidence-strength score whose delta crosses the +-15 threshold.
   * - Otherwise: a numeric score delta >= +15 / <= -15 drives the trend;
   *   with no such delta, classification RANK order drives it; a tie is
   *   `stable_evidence`.
   */
  private computeTrend(
    latest: ISkillEvolutionObservationSnapshot,
    previous?: ISkillEvolutionObservationSnapshot
  ): EmployerSkillEvolutionTrend {
    if (!previous) return 'first_observation';

    const bothScoresPresent = typeof latest.evidenceStrengthScore === 'number' && typeof previous.evidenceStrengthScore === 'number';
    const scoreDelta = bothScoresPresent ? latest.evidenceStrengthScore! - previous.evidenceStrengthScore! : undefined;

    const eitherAdditional = latest.classification === 'additional_candidate_skill' || previous.classification === 'additional_candidate_skill';
    if (eitherAdditional) {
      if (scoreDelta !== undefined) {
        if (scoreDelta >= SCORE_DELTA_THRESHOLD) return 'stronger_evidence';
        if (scoreDelta <= -SCORE_DELTA_THRESHOLD) return 'weaker_evidence';
      }
      return 'stable_evidence';
    }

    if (scoreDelta !== undefined) {
      if (scoreDelta >= SCORE_DELTA_THRESHOLD) return 'stronger_evidence';
      if (scoreDelta <= -SCORE_DELTA_THRESHOLD) return 'weaker_evidence';
    }

    const latestRank = this.classificationRank(latest.classification);
    const previousRank = this.classificationRank(previous.classification);
    if (latestRank > previousRank) return 'stronger_evidence';
    if (latestRank < previousRank) return 'weaker_evidence';
    return 'stable_evidence';
  }

  /** Deterministic ordering: observedAt DESC, applicationId tie-break DESC — matches 25C's own build ordering. */
  private sortObservations(observations: ISkillMemoryObservation[]): ISkillMemoryObservation[] {
    return [...observations].sort((a, b) => {
      const diff = b.observedAt.getTime() - a.observedAt.getTime();
      if (diff !== 0) return diff;
      return b.applicationId.toString().localeCompare(a.applicationId.toString());
    });
  }

  /** POST .../candidates/:candidateId/skill-evolution/refresh — requires INTERVIEWS_MANAGE. Requires existing 25C Skill Memory (409 if missing). Never auto-refreshes 25C. */
  async refreshCandidateSkillEvolution(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    candidateId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const candidate = await EmployerCandidate.findOne({ _id: candidateId, organizationId: organization._id }).select(
      '_id firstName lastName'
    );
    if (!candidate) {
      throw new ApiError(404, 'Candidate not found');
    }

    const memoryRows = await EmployerCandidateSkillMemory.find({ organizationId: organization._id, candidateId: candidate._id });
    if (memoryRows.length === 0) {
      throw new ApiError(409, 'Skill memory has not been built for this candidate yet. Build skill memory first.');
    }

    const currentSkillNodeIds = memoryRows.map((m) => m.skillNodeId);

    await EmployerCandidateSkillEvolution.deleteMany({
      organizationId: organization._id,
      candidateId: candidate._id,
      skillNodeId: { $nin: currentSkillNodeIds },
    });

    const now = new Date();
    for (const memory of memoryRows) {
      const sorted = this.sortObservations(memory.observations);
      const latestObs = sorted[0];
      const previousObs = sorted[1];

      const latest: ISkillEvolutionObservationSnapshot = {
        classification: latestObs.classification,
        evidenceStrengthScore: latestObs.evidenceStrengthScore,
        observedAt: latestObs.observedAt,
      };
      const previous: ISkillEvolutionObservationSnapshot | undefined = previousObs
        ? {
            classification: previousObs.classification,
            evidenceStrengthScore: previousObs.evidenceStrengthScore,
            observedAt: previousObs.observedAt,
          }
        : undefined;

      const trend = this.computeTrend(latest, previous);
      const days = daysBetween(latest.observedAt, now);
      const applicationCount = new Set(sorted.map((o) => o.applicationId.toString())).size;

      await EmployerCandidateSkillEvolution.findOneAndUpdate(
        { organizationId: organization._id, candidateId: candidate._id, skillNodeId: memory.skillNodeId },
        {
          $set: {
            memoryId: memory._id,
            calculationVersion: CALCULATION_VERSION,
            generatedAt: now,
            latest,
            previous,
            trend,
            recency: { daysSinceLastObservation: days, bucket: recencyBucket(days) },
            observationCount: memory.observationCount,
            applicationCount,
          },
        },
        { upsert: true, new: true }
      );
    }

    return this.getSkillEvolution(organizationId, actingRole, candidateId);
  }

  /** GET .../candidates/:candidateId/skill-evolution — requires ORGANIZATION_VIEW. Read-only; never refreshes. */
  async getSkillEvolution(organizationId: string, actingRole: OrganizationMemberRole, candidateId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const candidate = await EmployerCandidate.findOne({ _id: candidateId, organizationId: organization._id }).select(
      '_id firstName lastName'
    );
    if (!candidate) {
      throw new ApiError(404, 'Candidate not found');
    }

    const candidateSummary = { id: candidate._id.toString(), firstName: candidate.firstName, lastName: candidate.lastName };

    const rows = await EmployerCandidateSkillEvolution.find({ organizationId: organization._id, candidateId: candidate._id }).lean();
    if (rows.length === 0) {
      return {
        built: false,
        candidate: candidateSummary,
        summary: { skillCount: 0, strongerEvidenceCount: 0, stableEvidenceCount: 0, weakerEvidenceCount: 0, staleEvidenceCount: 0 },
        skills: [],
      };
    }

    const nodeIds = rows.map((r) => r.skillNodeId);
    const nodes = await EmployerSkillNode.find({ organizationId: organization._id, _id: { $in: nodeIds } }).lean();
    const nodeById = new Map(nodes.map((n) => [n._id.toString(), n]));

    const skills = rows
      .map((r) => ({
        skillNodeId: r.skillNodeId.toString(),
        canonicalName: nodeById.get(r.skillNodeId.toString())?.canonicalName,
        latest: r.latest,
        previous: r.previous,
        trend: r.trend,
        recency: r.recency,
        observationCount: r.observationCount,
        applicationCount: r.applicationCount,
      }))
      .sort((a, b) => {
        const diff = b.latest.observedAt.getTime() - a.latest.observedAt.getTime();
        if (diff !== 0) return diff;
        return (a.canonicalName || '').localeCompare(b.canonicalName || '');
      });

    // `first_observation` has no prior evidence to compare against, so it is
    // counted as stable (neither stronger nor weaker) for this summary.
    const summary = {
      skillCount: rows.length,
      strongerEvidenceCount: rows.filter((r) => r.trend === 'stronger_evidence').length,
      stableEvidenceCount: rows.filter((r) => r.trend === 'stable_evidence' || r.trend === 'first_observation').length,
      weakerEvidenceCount: rows.filter((r) => r.trend === 'weaker_evidence').length,
      staleEvidenceCount: rows.filter((r) => r.recency.bucket === 'stale').length,
    };

    return { built: true, candidate: candidateSummary, summary, skills };
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
}

export const employerCandidateSkillEvolutionService = new EmployerCandidateSkillEvolutionService();
export default employerCandidateSkillEvolutionService;
