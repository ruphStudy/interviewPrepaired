import Organization, { IOrganization } from '../models/Organization.model';
import EmployerCandidate, { IEmployerCandidate } from '../models/EmployerCandidate.model';
import EmployerCrossAssessmentTalentIntelligence, {
  IEmployerCrossAssessmentTalentIntelligence,
  ICompetencyConsistency,
  ICompetencySourceState,
  TalentConsistencyLevel,
  TalentEvidenceStateValue,
} from '../models/EmployerCrossAssessmentTalentIntelligence.model';
import { collectCandidateEvidence, normalizeCompetencyKey, CompetencyObservation } from './shared/talentEvidenceAggregation';
import { OrganizationType } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const INTELLIGENCE_VERSION = 'cross-assessment-talent-v1';
const POSITIVE_STATES: TalentEvidenceStateValue[] = ['strong', 'sufficient'];
const WEAK_STATES: TalentEvidenceStateValue[] = ['partial', 'insufficient', 'not_observed'];

/**
 * Deterministic (NO AI) cross-assessment pattern derivation for ONE
 * candidate (32B) — built purely from that SAME candidate's own completed
 * assessment artifacts (the same sources 32A aggregates). Never compares
 * against other candidates, never a hire/reject recommendation, never a
 * numeric score.
 */
export class EmployerCrossAssessmentTalentIntelligenceService {
  /** POST .../candidates/:candidateId/cross-assessment-intelligence/build — requires INTERVIEWS_MANAGE. Deterministic upsert-in-place. */
  async buildIntelligence(organizationId: string, actingRole: OrganizationMemberRole, candidateId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    const candidate = await this.getCandidate(organization, candidateId);

    const bundle = await collectCandidateEvidence(organization._id, candidate._id);

    const observationsByCompetency = new Map<string, { displayName: string; observations: CompetencyObservation[] }>();
    for (const observation of bundle.competencyObservations) {
      const key = normalizeCompetencyKey(observation.competencyName);
      const entry = observationsByCompetency.get(key) ?? { displayName: observation.competencyName, observations: [] };
      entry.observations.push(observation);
      observationsByCompetency.set(key, entry);
    }

    const competencyConsistency: ICompetencyConsistency[] = [];
    const repeatedStrengths: string[] = [];
    const repeatedEvidenceGaps: string[] = [];
    const mixedEvidence: string[] = [];

    for (const { displayName, observations } of observationsByCompetency.values()) {
      // One representative (latest) state per DISTINCT source type — consistency is evaluated across source TYPES, never raw observation count.
      const latestBySourceType = new Map<string, CompetencyObservation>();
      for (const observation of observations) {
        const current = latestBySourceType.get(observation.sourceType);
        if (!current || observation.observedAt > current.observedAt) {
          latestBySourceType.set(observation.sourceType, observation);
        }
      }
      const sourceStates: ICompetencySourceState[] = Array.from(latestBySourceType.entries()).map(([sourceType, observation]) => ({
        sourceType,
        state: observation.state,
      }));
      const sourceCount = sourceStates.length;
      const consistency = this.computeConsistency(sourceStates.map((s) => s.state), sourceCount);

      competencyConsistency.push({ competencyName: displayName, sourceCount, sourceStates, consistency });

      if (consistency === 'consistent_strong' || consistency === 'consistent_sufficient') {
        repeatedStrengths.push(`${displayName} showed strong/sufficient evidence across ${sourceCount} assessment sources.`);
      } else if (consistency === 'consistent_gap') {
        repeatedEvidenceGaps.push(`${displayName} showed limited evidence across ${sourceCount} assessment sources.`);
      } else if (consistency === 'mixed') {
        mixedEvidence.push(`${displayName} showed mixed evidence across ${sourceCount} assessment sources.`);
      }
    }

    const sourceCoverage = {
      standardInterview: bundle.assessmentCounts.standardInterviewCount > 0,
      scenario: bundle.assessmentCounts.scenarioCount > 0,
      coding: bundle.assessmentCounts.codingCount > 0,
      knowledgeGrounding: bundle.assessmentCounts.knowledgeGroundedCount > 0,
      totalSourceTypes: 0,
    };
    sourceCoverage.totalSourceTypes = [
      sourceCoverage.standardInterview,
      sourceCoverage.scenario,
      sourceCoverage.coding,
      sourceCoverage.knowledgeGrounding,
    ].filter(Boolean).length;

    const evidenceBreadth = {
      skillCount: bundle.skills.length,
      competencyCount: competencyConsistency.length,
      multiSourceCompetencyCount: competencyConsistency.filter((c) => c.sourceCount >= 2).length,
    };

    const generatedAt = new Date();
    const doc = await EmployerCrossAssessmentTalentIntelligence.findOneAndUpdate(
      { organizationId: organization._id, candidateId: candidate._id },
      {
        $set: {
          intelligenceVersion: INTELLIGENCE_VERSION,
          generatedAt,
          competencyConsistency,
          crossAssessmentSignals: { repeatedStrengths, repeatedEvidenceGaps, mixedEvidence },
          sourceCoverage,
          evidenceBreadth,
        },
      },
      { upsert: true, new: true }
    );

    return this.toDetail(doc!);
  }

  /** GET .../candidates/:candidateId/cross-assessment-intelligence — requires ANALYTICS_VIEW. Read-only; never builds. */
  async getIntelligence(organizationId: string, actingRole: OrganizationMemberRole, candidateId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ANALYTICS_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    const candidate = await this.getCandidate(organization, candidateId);

    const doc = await EmployerCrossAssessmentTalentIntelligence.findOne({ organizationId: organization._id, candidateId: candidate._id });
    if (!doc) {
      return { built: false };
    }
    return this.toDetail(doc);
  }

  /**
   * Simple, transparent, deterministic rule (32B section 11):
   * - fewer than 2 distinct sources => insufficient_data
   * - all strong => consistent_strong
   * - all strong/sufficient (no gap) => consistent_sufficient
   * - a mix of positive (strong/sufficient) AND weak (partial/insufficient/not_observed) => mixed
   * - otherwise (all weak) => consistent_gap
   */
  private computeConsistency(states: TalentEvidenceStateValue[], sourceCount: number): TalentConsistencyLevel {
    if (sourceCount < 2) return 'insufficient_data';
    if (states.every((s) => s === 'strong')) return 'consistent_strong';
    if (states.every((s) => POSITIVE_STATES.includes(s))) return 'consistent_sufficient';
    const hasPositive = states.some((s) => POSITIVE_STATES.includes(s));
    const hasWeak = states.some((s) => WEAK_STATES.includes(s));
    if (hasPositive && hasWeak) return 'mixed';
    return 'consistent_gap';
  }

  private async getCandidate(organization: IOrganization, candidateId: string): Promise<IEmployerCandidate> {
    const candidate = await EmployerCandidate.findOne({ _id: candidateId, organizationId: organization._id });
    if (!candidate) {
      throw new ApiError(404, 'Candidate not found');
    }
    return candidate;
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

  private toDetail(doc: IEmployerCrossAssessmentTalentIntelligence): Record<string, unknown> {
    return {
      built: true,
      intelligenceVersion: doc.intelligenceVersion,
      generatedAt: doc.generatedAt,
      competencyConsistency: doc.competencyConsistency,
      crossAssessmentSignals: doc.crossAssessmentSignals,
      sourceCoverage: doc.sourceCoverage,
      evidenceBreadth: doc.evidenceBreadth,
    };
  }
}

export const employerCrossAssessmentTalentIntelligenceService = new EmployerCrossAssessmentTalentIntelligenceService();
export default employerCrossAssessmentTalentIntelligenceService;
