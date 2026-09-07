import Organization, { IOrganization } from '../models/Organization.model';
import EmployerCandidate, { IEmployerCandidate } from '../models/EmployerCandidate.model';
import EmployerUnifiedTalentProfile, {
  IEmployerUnifiedTalentProfile,
  ITalentProfileCompetency,
  TalentProfileEvidenceState,
} from '../models/EmployerUnifiedTalentProfile.model';
import { collectCandidateEvidence, summarizeApplications, normalizeCompetencyKey } from './shared/talentEvidenceAggregation';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const PROFILE_VERSION = 'unified-talent-profile-v1';

/**
 * Deterministic (NO AI) consolidated talent profile for ONE candidate
 * (32A) — unifies evidence already persisted across that candidate's own
 * applications/assessments within THIS exact organization only. Never a
 * ranking, never a hiring recommendation, never a numeric overall talent
 * score.
 */
export class EmployerUnifiedTalentProfileService {
  /** POST .../candidates/:candidateId/talent-profile/build — requires INTERVIEWS_MANAGE. Deterministic upsert-in-place. */
  async buildProfile(organizationId: string, actingRole: OrganizationMemberRole, candidateId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);
    const candidate = await this.getCandidate(organization, candidateId);

    const bundle = await collectCandidateEvidence(organization._id, candidate._id);
    const applicationSummary = summarizeApplications(bundle.applications);

    const competencyByKey = new Map<string, ITalentProfileCompetency>();
    for (const observation of bundle.competencyObservations) {
      const key = normalizeCompetencyKey(observation.competencyName);
      const entry = competencyByKey.get(key) ?? {
        competencyName: observation.competencyName,
        evidenceCount: 0,
        states: { strong: 0, sufficient: 0, partial: 0, insufficient: 0, notObserved: 0 },
        sourceTypes: [] as string[],
      };
      entry.evidenceCount += 1;
      if (observation.state === 'not_observed') {
        entry.states.notObserved += 1;
      } else {
        entry.states[observation.state] += 1;
      }
      if (!entry.sourceTypes.includes(observation.sourceType)) entry.sourceTypes.push(observation.sourceType);
      if (!entry.latestEvidenceAt || observation.observedAt > entry.latestEvidenceAt) {
        entry.latestEvidenceAt = observation.observedAt;
        entry.latestEvidenceState = observation.state as TalentProfileEvidenceState;
      }
      competencyByKey.set(key, entry);
    }

    const firstApplicationAt = bundle.applications.reduce<Date | undefined>((min, a) => {
      const at = a.appliedAt ?? a.createdAt;
      return !min || at < min ? at : min;
    }, undefined);

    const generatedAt = new Date();
    const doc = await EmployerUnifiedTalentProfile.findOneAndUpdate(
      { organizationId: organization._id, candidateId: candidate._id },
      {
        $set: {
          profileVersion: PROFILE_VERSION,
          generatedAt,
          identity: {
            candidateId: candidate._id,
            displayName: `${candidate.firstName ?? ''} ${candidate.lastName ?? ''}`.trim() || undefined,
            primaryEmail: candidate.email,
          },
          applicationSummary,
          assessmentSummary: {
            interviewCount: bundle.assessmentCounts.interviewCount,
            completedInterviewCount: bundle.assessmentCounts.completedInterviewCount,
            scenarioAssessmentCount: bundle.assessmentCounts.scenarioCount,
            codingAssessmentCount: bundle.assessmentCounts.codingCount,
          },
          skills: bundle.skills,
          competencies: Array.from(competencyByKey.values()),
          assessmentSources: {
            standardInterviewCount: bundle.assessmentCounts.standardInterviewCount,
            scenarioCount: bundle.assessmentCounts.scenarioCount,
            codingCount: bundle.assessmentCounts.codingCount,
            knowledgeGroundedCount: bundle.assessmentCounts.knowledgeGroundedCount,
          },
          timeline: {
            firstApplicationAt,
            latestActivityAt: bundle.latestActivityAt,
          },
        },
      },
      { upsert: true, new: true }
    );

    return this.toDetail(doc!);
  }

  /** GET .../candidates/:candidateId/talent-profile — requires ORGANIZATION_VIEW. Read-only; never builds. */
  async getProfile(organizationId: string, actingRole: OrganizationMemberRole, candidateId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    const candidate = await this.getCandidate(organization, candidateId);

    const doc = await EmployerUnifiedTalentProfile.findOne({ organizationId: organization._id, candidateId: candidate._id });
    if (!doc) {
      return { built: false };
    }
    return this.toDetail(doc);
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

  private assertOrganizationMutable(organization: IOrganization): void {
    if (organization.status === OrganizationStatus.ARCHIVED) {
      throw new ApiError(400, 'This organization is archived and read-only');
    }
  }

  private toDetail(doc: IEmployerUnifiedTalentProfile): Record<string, unknown> {
    return {
      built: true,
      profileVersion: doc.profileVersion,
      generatedAt: doc.generatedAt,
      identity: doc.identity,
      applicationSummary: doc.applicationSummary,
      assessmentSummary: doc.assessmentSummary,
      skills: doc.skills,
      competencies: doc.competencies,
      assessmentSources: doc.assessmentSources,
      timeline: doc.timeline,
    };
  }
}

export const employerUnifiedTalentProfileService = new EmployerUnifiedTalentProfileService();
export default employerUnifiedTalentProfileService;
