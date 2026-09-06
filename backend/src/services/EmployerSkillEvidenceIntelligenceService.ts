import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJobApplication from '../models/EmployerJobApplication.model';
import { EmployerJobApplicationStatus } from '../constants/employerJobApplication';
import EmployerSkillNode from '../models/EmployerSkillNode.model';
import EmployerJobSkillEdge, { IEmployerJobSkillEdge } from '../models/EmployerJobSkillEdge.model';
import EmployerCandidateSkillEdge, { ICandidateSkillEvidenceSource } from '../models/EmployerCandidateSkillEdge.model';
import EmployerApplicationSkillIntelligence, {
  IEmployerApplicationSkillIntelligence,
  IApplicationSkillIntelligenceEntry,
  EmployerSkillClassification,
} from '../models/EmployerApplicationSkillIntelligence.model';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const CALCULATION_VERSION = 'skill-evidence-intelligence-v1';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Deterministic (no AI) evidence-strength/gap intelligence built from the
 * exact CURRENT 25A skill graph for one application (25B) — never a
 * proficiency/mastery/success-probability/hiring-recommendation score.
 * Requires an existing built 25A graph; never silently builds 25A itself.
 */
export class EmployerSkillEvidenceIntelligenceService {
  /** POST .../skill-intelligence/build — requires INTERVIEWS_MANAGE. Requires an existing built 25A graph (409 if missing). Upserts in place — no historical duplicate required. */
  async buildApplicationSkillIntelligence(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    applicationId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id });
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }
    this.assertApplicationMutable(application.status);

    const [jobEdges, candidateEdges] = await Promise.all([
      EmployerJobSkillEdge.find({ organizationId: organization._id, jobId: application.jobId }).lean(),
      EmployerCandidateSkillEdge.find({ organizationId: organization._id, applicationId: application._id }).lean(),
    ]);

    if (jobEdges.length === 0 && candidateEdges.length === 0) {
      throw new ApiError(409, 'Skill graph has not been built for this application yet. Build the skill graph first.');
    }

    const jobEdgeByNodeId = new Map<string, IEmployerJobSkillEdge>(jobEdges.map((e) => [e.skillNodeId.toString(), e as any]));
    const candidateEdgeByNodeId = new Map<string, { sources: ICandidateSkillEvidenceSource[] }>(
      candidateEdges.map((e) => [e.skillNodeId.toString(), { sources: e.sources }])
    );
    const allNodeIds = new Set<string>([...jobEdgeByNodeId.keys(), ...candidateEdgeByNodeId.keys()]);

    const skills: IApplicationSkillIntelligenceEntry[] = [];
    for (const nodeIdStr of allNodeIds) {
      const jobEdge = jobEdgeByNodeId.get(nodeIdStr);
      const candidateEdge = candidateEdgeByNodeId.get(nodeIdStr);

      const sourceSummary = { resume: false, screening: false, assessment: false, evidence: false };
      let evidenceStrengthScore: number | undefined;
      if (candidateEdge) {
        let total = 0;
        for (const src of candidateEdge.sources) {
          sourceSummary[src.type] = true;
          total += this.scoreForSource(src);
        }
        evidenceStrengthScore = Math.round(clamp(total, 0, 100));
      }

      let classification: EmployerSkillClassification;
      if (jobEdge) {
        if (!candidateEdge || (evidenceStrengthScore ?? 0) === 0) classification = 'missing';
        else if (evidenceStrengthScore! >= 70) classification = 'strong_evidence';
        else if (evidenceStrengthScore! >= 40) classification = 'supported';
        else classification = 'limited_evidence';
      } else {
        classification = 'additional_candidate_skill';
      }

      skills.push({
        skillNodeId: new Types.ObjectId(nodeIdStr),
        classification,
        evidenceStrengthScore,
        jobImportance: jobEdge?.importance,
        jobWeight: jobEdge?.weight,
        sourceSummary,
      });
    }

    const jobSkillCount = jobEdgeByNodeId.size;
    const matchedSkillCount = skills.filter(
      (s) => jobEdgeByNodeId.has(s.skillNodeId.toString()) && candidateEdgeByNodeId.has(s.skillNodeId.toString())
    ).length;
    const summary = {
      jobSkillCount,
      matchedSkillCount,
      strongEvidenceCount: skills.filter((s) => s.classification === 'strong_evidence').length,
      supportedCount: skills.filter((s) => s.classification === 'supported').length,
      limitedEvidenceCount: skills.filter((s) => s.classification === 'limited_evidence').length,
      missingCount: skills.filter((s) => s.classification === 'missing').length,
      additionalCandidateSkillCount: skills.filter((s) => s.classification === 'additional_candidate_skill').length,
      coveragePercent: jobSkillCount > 0 ? round2((matchedSkillCount / jobSkillCount) * 100) : 0,
    };

    const doc = await EmployerApplicationSkillIntelligence.findOneAndUpdate(
      { organizationId: organization._id, applicationId: application._id },
      {
        $set: {
          jobId: application.jobId,
          candidateId: application.candidateId,
          calculationVersion: CALCULATION_VERSION,
          generatedAt: new Date(),
          skills,
          summary,
        },
      },
      { upsert: true, new: true }
    );

    const nodes = await EmployerSkillNode.find({ organizationId: organization._id, _id: { $in: [...allNodeIds].map((id) => new Types.ObjectId(id)) } })
      .lean();
    const nodeById = new Map(nodes.map((n) => [n._id.toString(), n]));

    return this.toDetail(doc!, nodeById);
  }

  /** GET .../skill-intelligence — requires ORGANIZATION_VIEW. Read-only, never auto-builds. */
  async getSkillIntelligence(organizationId: string, actingRole: OrganizationMemberRole, applicationId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id }).select('_id');
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }

    const doc = await EmployerApplicationSkillIntelligence.findOne({ organizationId: organization._id, applicationId: application._id });
    if (!doc) {
      return { built: false };
    }

    const nodeIds = doc.skills.map((s) => s.skillNodeId);
    const nodes = await EmployerSkillNode.find({ organizationId: organization._id, _id: { $in: nodeIds } }).lean();
    const nodeById = new Map(nodes.map((n) => [n._id.toString(), n]));

    return this.toDetail(doc, nodeById);
  }

  /**
   * Deterministic source-weight mapping (never a new AI score):
   * resume presence = 15; screening matched/partial = 20/10; screening
   * competency-match score (0-10 convention) linearly scaled to max 20;
   * assessment score (1-5 convention) linearly scaled to max 30; evidence
   * status strong/sufficient/partial/insufficient = 35/28/18/5.
   */
  private scoreForSource(src: ICandidateSkillEvidenceSource): number {
    switch (src.type) {
      case 'resume':
        return 15;
      case 'screening':
        if (src.evidenceLevel === 'matched') return 20;
        if (src.evidenceLevel === 'partial') return 10;
        if (typeof src.score === 'number') return (clamp(src.score, 0, 10) / 10) * 20;
        return 0;
      case 'assessment':
        return typeof src.score === 'number' ? (clamp(src.score, 1, 5) / 5) * 30 : 0;
      case 'evidence':
        switch (src.evidenceLevel) {
          case 'strong':
            return 35;
          case 'sufficient':
            return 28;
          case 'partial':
            return 18;
          case 'insufficient':
            return 5;
          default:
            return 0;
        }
      default:
        return 0;
    }
  }

  private toDetail(doc: IEmployerApplicationSkillIntelligence, nodeById: Map<string, { canonicalName: string; aliases: string[] }>): Record<string, unknown> {
    return {
      built: true,
      applicationId: doc.applicationId.toString(),
      calculationVersion: doc.calculationVersion,
      generatedAt: doc.generatedAt,
      skills: doc.skills.map((s) => {
        const node = nodeById.get(s.skillNodeId.toString());
        return {
          skillNodeId: s.skillNodeId.toString(),
          canonicalName: node?.canonicalName,
          classification: s.classification,
          evidenceStrengthScore: s.evidenceStrengthScore,
          jobImportance: s.jobImportance,
          jobWeight: s.jobWeight,
          sourceSummary: s.sourceSummary,
        };
      }),
      summary: doc.summary,
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

  private assertApplicationMutable(status: EmployerJobApplicationStatus): void {
    if (status === EmployerJobApplicationStatus.ARCHIVED) {
      throw new ApiError(400, 'This application is archived and read-only');
    }
  }
}

export const employerSkillEvidenceIntelligenceService = new EmployerSkillEvidenceIntelligenceService();
export default employerSkillEvidenceIntelligenceService;
