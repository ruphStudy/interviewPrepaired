import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerCandidate from '../models/EmployerCandidate.model';
import EmployerJobApplication from '../models/EmployerJobApplication.model';
import EmployerJob from '../models/EmployerJob.model';
import EmployerSkillNode from '../models/EmployerSkillNode.model';
import EmployerApplicationSkillIntelligence from '../models/EmployerApplicationSkillIntelligence.model';
import EmployerCandidateSkillMemory, { ISkillMemoryObservation } from '../models/EmployerCandidateSkillMemory.model';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const MAX_OBSERVATIONS_PER_SKILL = 50;

/**
 * Organization-scoped historical skill EVIDENCE memory across a
 * candidate's multiple applications (25C) — rebuilt deterministically from
 * EXISTING 25B intelligence only, never rereads raw resume/JD text, never
 * calls AI, never averages scores across jobs into one global proficiency
 * number. Never shared across organizations/tenants/candidate-facing
 * sessions.
 */
export class EmployerCandidateSkillMemoryService {
  /** POST .../candidates/:candidateId/skill-memory/refresh — requires INTERVIEWS_MANAGE. Uses ONLY existing 25B intelligence rows; never auto-builds 25A/25B for any application. */
  async refreshCandidateSkillMemory(
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

    // Every application for this candidate in THIS organization — non-archived and historical alike.
    const applications = await EmployerJobApplication.find({ organizationId: organization._id, candidateId: candidate._id })
      .select('_id')
      .lean();
    const applicationIds = applications.map((a) => a._id);

    const intelligenceRows =
      applicationIds.length > 0
        ? await EmployerApplicationSkillIntelligence.find({
            organizationId: organization._id,
            applicationId: { $in: applicationIds },
          }).lean()
        : [];

    const observationsBySkill = new Map<string, ISkillMemoryObservation[]>();
    for (const intel of intelligenceRows) {
      for (const skillEntry of intel.skills) {
        const key = skillEntry.skillNodeId.toString();
        if (!observationsBySkill.has(key)) observationsBySkill.set(key, []);
        const sourceTypes = Object.entries(skillEntry.sourceSummary)
          .filter(([, present]) => present)
          .map(([type]) => type);
        observationsBySkill.get(key)!.push({
          applicationId: intel.applicationId,
          jobId: intel.jobId,
          skillIntelligenceId: intel._id as Types.ObjectId,
          classification: skillEntry.classification,
          evidenceStrengthScore: skillEntry.evidenceStrengthScore,
          sourceTypes,
          observedAt: intel.generatedAt,
        });
      }
    }

    const currentSkillNodeIds = [...observationsBySkill.keys()].map((id) => new Types.ObjectId(id));

    // Stale memory nodes no longer backed by any valid observation are removed — scoped strictly to THIS candidate/organization.
    await EmployerCandidateSkillMemory.deleteMany({
      organizationId: organization._id,
      candidateId: candidate._id,
      skillNodeId: { $nin: currentSkillNodeIds },
    });

    for (const [skillNodeIdStr, observations] of observationsBySkill.entries()) {
      const sorted = [...observations].sort((a, b) => {
        const diff = b.observedAt.getTime() - a.observedAt.getTime();
        if (diff !== 0) return diff;
        return b.applicationId.toString().localeCompare(a.applicationId.toString());
      });
      const capped = sorted.slice(0, MAX_OBSERVATIONS_PER_SKILL);
      const latest = sorted[0];
      const oldest = sorted[sorted.length - 1];

      await EmployerCandidateSkillMemory.findOneAndUpdate(
        { organizationId: organization._id, candidateId: candidate._id, skillNodeId: new Types.ObjectId(skillNodeIdStr) },
        {
          $set: {
            observations: capped,
            firstObservedAt: oldest.observedAt,
            lastObservedAt: latest.observedAt,
            observationCount: sorted.length,
            latestClassification: latest.classification,
            latestEvidenceStrengthScore: latest.evidenceStrengthScore,
          },
        },
        { upsert: true, new: true }
      );
    }

    return this.getSkillMemory(organizationId, actingRole, candidateId);
  }

  /** GET .../candidates/:candidateId/skill-memory — requires ORGANIZATION_VIEW. Read-only; never refreshes. */
  async getSkillMemory(organizationId: string, actingRole: OrganizationMemberRole, candidateId: string): Promise<Record<string, unknown>> {
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

    const memoryRows = await EmployerCandidateSkillMemory.find({ organizationId: organization._id, candidateId: candidate._id }).lean();
    if (memoryRows.length === 0) {
      return {
        built: false,
        candidate: candidateSummary,
        summary: { skillCount: 0, multiApplicationSkillCount: 0, totalObservations: 0 },
        skills: [],
      };
    }

    const nodeIds = memoryRows.map((m) => m.skillNodeId);
    const nodes = await EmployerSkillNode.find({ organizationId: organization._id, _id: { $in: nodeIds } }).lean();
    const nodeById = new Map(nodes.map((n) => [n._id.toString(), n]));

    const jobIds = [...new Set(memoryRows.flatMap((m) => m.observations.map((o) => o.jobId.toString())))].map(
      (id) => new Types.ObjectId(id)
    );
    const jobs = await EmployerJob.find({ organizationId: organization._id, _id: { $in: jobIds } }).select('title').lean();
    const jobById = new Map(jobs.map((j) => [j._id.toString(), j]));

    const skills = memoryRows.map((m) => {
      const node = nodeById.get(m.skillNodeId.toString());
      const sortedObservations = [...m.observations].sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime());
      return {
        skillNodeId: m.skillNodeId.toString(),
        canonicalName: node?.canonicalName,
        latestClassification: m.latestClassification,
        latestEvidenceStrengthScore: m.latestEvidenceStrengthScore,
        firstObservedAt: m.firstObservedAt,
        lastObservedAt: m.lastObservedAt,
        observationCount: m.observationCount,
        observations: sortedObservations.map((o) => ({
          applicationId: o.applicationId.toString(),
          jobId: o.jobId.toString(),
          jobTitle: jobById.get(o.jobId.toString())?.title,
          classification: o.classification,
          evidenceStrengthScore: o.evidenceStrengthScore,
          sourceTypes: o.sourceTypes,
          observedAt: o.observedAt,
        })),
      };
    });

    const multiApplicationSkillCount = memoryRows.filter(
      (m) => new Set(m.observations.map((o) => o.applicationId.toString())).size > 1
    ).length;
    const totalObservations = memoryRows.reduce((sum, m) => sum + m.observationCount, 0);

    return {
      built: true,
      candidate: candidateSummary,
      summary: { skillCount: memoryRows.length, multiApplicationSkillCount, totalObservations },
      skills,
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
}

export const employerCandidateSkillMemoryService = new EmployerCandidateSkillMemoryService();
export default employerCandidateSkillMemoryService;
