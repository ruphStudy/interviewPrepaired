import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJobApplication, { IEmployerJobApplication } from '../models/EmployerJobApplication.model';
import { EmployerJobApplicationStatus } from '../constants/employerJobApplication';
import EmployerJobDescriptionSource from '../models/EmployerJobDescriptionSource.model';
import EmployerJobIntelligenceSnapshot, { IEmployerJobIntelligenceSnapshot } from '../models/EmployerJobIntelligenceSnapshot.model';
import EmployerCandidateResumeSource from '../models/EmployerCandidateResumeSource.model';
import EmployerCandidateResumeAnalysis, { IEmployerCandidateResumeAnalysis } from '../models/EmployerCandidateResumeAnalysis.model';
import { EmployerCandidateResumeAnalysisStatus } from '../constants/employerCandidateResumeAnalysis';
import EmployerCandidateScreening from '../models/EmployerCandidateScreening.model';
import { EmployerCandidateScreeningStatus } from '../constants/employerCandidateScreening';
import EmployerHiringAssessmentResult from '../models/EmployerHiringAssessmentResult.model';
import EmployerHiringEvidenceMatrix from '../models/EmployerHiringEvidenceMatrix.model';
import EmployerSkillNode, { IEmployerSkillNode } from '../models/EmployerSkillNode.model';
import EmployerJobSkillEdge from '../models/EmployerJobSkillEdge.model';
import EmployerCandidateSkillEdge, { ICandidateSkillEvidenceSource } from '../models/EmployerCandidateSkillEdge.model';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const MAX_ALIASES = 20;
const MAX_SOURCES_PER_EDGE = 20;

/** Deterministic v1 normalization — trim, lowercase, collapse separators/whitespace. No fuzzy matching, no synonym table, no AI. */
export function normalizeSkillKey(rawName: string): string {
  return rawName
    .trim()
    .toLowerCase()
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface JobSkillContribution {
  name: string;
  importance?: string;
}

interface CandidateSkillContribution {
  name: string;
  type: ICandidateSkillEvidenceSource['type'];
  sourceArtifactId: Types.ObjectId;
  evidenceLevel?: string;
  score?: number;
}

/**
 * Deterministic Skill Graph (25A) — normalizes structured skill/competency
 * names already produced across existing hiring artifacts into shared
 * `EmployerSkillNode`s, plus job-requirement and candidate-evidence edges.
 * NO AI call anywhere in this service; every name comes from an existing
 * structured field (never raw JD/resume text, never recruiter notes/
 * decisions/communications). Candidate edges represent structured evidence
 * PRESENCE only — never a proficiency certification. Rebuild is idempotent
 * and scoped strictly to the one application/job being built; it never
 * touches another application/job/candidate.
 */
export class EmployerSkillGraphService {
  /** POST .../skill-graph/build — requires INTERVIEWS_MANAGE. Idempotent deterministic rebuild/upsert; never accepts artifact ids from the caller. */
  async buildApplicationSkillGraph(
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

    const jdSnapshot = await this.getCurrentFinalizedSnapshot(organization._id, application.jobId);
    const resumeAnalysis = await this.resolveResumeAnalysis(organization._id, application);

    const screening =
      jdSnapshot && resumeAnalysis
        ? await EmployerCandidateScreening.findOne({
            organizationId: organization._id,
            applicationId: application._id,
            jdSnapshotId: jdSnapshot._id,
            resumeAnalysisId: resumeAnalysis._id,
            status: EmployerCandidateScreeningStatus.COMPLETED,
          })
        : null;

    // 21E/22A: most recently created row for this application is the
    // CURRENT one (mirrors the established convention across 23A/23B/24E
    // for historical multiplicity across sessions).
    const assessmentResult = await EmployerHiringAssessmentResult.findOne({
      organizationId: organization._id,
      applicationId: application._id,
    }).sort({ createdAt: -1 });
    const evidenceMatrix = await EmployerHiringEvidenceMatrix.findOne({
      organizationId: organization._id,
      applicationId: application._id,
    }).sort({ createdAt: -1 });

    const jobSkillContributions: JobSkillContribution[] = jdSnapshot
      ? jdSnapshot.snapshot.skills.map((s) => ({ name: s.name, importance: s.importance }))
      : [];

    const candidateContributions: CandidateSkillContribution[] = [];
    if (resumeAnalysis?.profile?.skills) {
      for (const name of resumeAnalysis.profile.skills) {
        candidateContributions.push({ name, type: 'resume', sourceArtifactId: resumeAnalysis._id as Types.ObjectId });
      }
    }
    if (screening?.result) {
      for (const name of screening.result.skillMatch.matchedSkills) {
        candidateContributions.push({
          name,
          type: 'screening',
          sourceArtifactId: screening._id as Types.ObjectId,
          evidenceLevel: 'matched',
        });
      }
      for (const name of screening.result.skillMatch.partialSkills) {
        candidateContributions.push({
          name,
          type: 'screening',
          sourceArtifactId: screening._id as Types.ObjectId,
          evidenceLevel: 'partial',
        });
      }
      for (const cm of screening.result.competencyMatch) {
        candidateContributions.push({
          name: cm.competencyName,
          type: 'screening',
          sourceArtifactId: screening._id as Types.ObjectId,
          score: cm.score,
        });
      }
    }
    if (assessmentResult?.result) {
      for (const c of assessmentResult.result.competencies) {
        candidateContributions.push({
          name: c.competencyName,
          type: 'assessment',
          sourceArtifactId: assessmentResult._id as Types.ObjectId,
          score: c.score,
        });
      }
    }
    if (evidenceMatrix?.matrix) {
      for (const c of evidenceMatrix.matrix.competencies) {
        candidateContributions.push({
          name: c.competencyName,
          type: 'evidence',
          sourceArtifactId: evidenceMatrix._id as Types.ObjectId,
          evidenceLevel: c.evidenceStatus,
        });
      }
    }

    // ---- Resolve/upsert skill nodes + build the job-edge and candidate-edge maps ----
    const jobEdgeData = new Map<string, { skillNodeId: Types.ObjectId; importance?: string }>();
    for (const contribution of jobSkillContributions) {
      const normalizedKey = normalizeSkillKey(contribution.name);
      if (!normalizedKey) continue;
      const node = await this.upsertSkillNode(organization._id, contribution.name, normalizedKey);
      jobEdgeData.set(normalizedKey, { skillNodeId: node._id as Types.ObjectId, importance: contribution.importance });
    }

    const candidateEdgeData = new Map<string, { skillNodeId: Types.ObjectId; sources: ICandidateSkillEvidenceSource[] }>();
    for (const contribution of candidateContributions) {
      const normalizedKey = normalizeSkillKey(contribution.name);
      if (!normalizedKey) continue;
      const node = await this.upsertSkillNode(organization._id, contribution.name, normalizedKey);
      if (!candidateEdgeData.has(normalizedKey)) {
        candidateEdgeData.set(normalizedKey, { skillNodeId: node._id as Types.ObjectId, sources: [] });
      }
      candidateEdgeData.get(normalizedKey)!.sources.push({
        type: contribution.type,
        sourceArtifactId: contribution.sourceArtifactId,
        evidenceLevel: contribution.evidenceLevel,
        score: contribution.score,
      });
    }

    // ---- Job-edge reconciliation — scoped strictly to THIS jobId ----
    if (jdSnapshot) {
      // Stale (superseded-snapshot) edges for this job are reconciled away.
      await EmployerJobSkillEdge.deleteMany({
        organizationId: organization._id,
        jobId: application.jobId,
        sourceSnapshotId: { $ne: jdSnapshot._id },
      });

      const currentJobSkillNodeIds = [...jobEdgeData.values()].map((v) => v.skillNodeId);
      await EmployerJobSkillEdge.deleteMany({
        organizationId: organization._id,
        jobId: application.jobId,
        sourceSnapshotId: jdSnapshot._id,
        skillNodeId: { $nin: currentJobSkillNodeIds },
      });

      for (const data of jobEdgeData.values()) {
        await EmployerJobSkillEdge.findOneAndUpdate(
          { organizationId: organization._id, jobId: application.jobId, sourceSnapshotId: jdSnapshot._id, skillNodeId: data.skillNodeId },
          { $set: { importance: data.importance } },
          { upsert: true, new: true }
        );
      }
    } else {
      // No current finalized snapshot resolvable — nothing authoritative
      // backs any job-skill edge for this job.
      await EmployerJobSkillEdge.deleteMany({ organizationId: organization._id, jobId: application.jobId });
    }

    // ---- Candidate-edge reconciliation — scoped strictly to THIS application ----
    const currentCandidateSkillNodeIds = [...candidateEdgeData.values()].map((v) => v.skillNodeId);
    await EmployerCandidateSkillEdge.deleteMany({
      organizationId: organization._id,
      applicationId: application._id,
      skillNodeId: { $nin: currentCandidateSkillNodeIds },
    });

    for (const data of candidateEdgeData.values()) {
      await EmployerCandidateSkillEdge.findOneAndUpdate(
        { organizationId: organization._id, applicationId: application._id, skillNodeId: data.skillNodeId },
        {
          $set: {
            sources: data.sources.slice(0, MAX_SOURCES_PER_EDGE),
            candidateId: application.candidateId,
            jobId: application.jobId,
          },
        },
        { upsert: true, new: true }
      );
    }

    return this.getSkillGraph(organizationId, actingRole, applicationId);
  }

  /** GET .../skill-graph — requires ORGANIZATION_VIEW. Read-only — never auto-builds. */
  async getSkillGraph(organizationId: string, actingRole: OrganizationMemberRole, applicationId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id }).select('_id jobId');
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }

    const [jobEdges, candidateEdges] = await Promise.all([
      EmployerJobSkillEdge.find({ organizationId: organization._id, jobId: application.jobId }).lean(),
      EmployerCandidateSkillEdge.find({ organizationId: organization._id, applicationId: application._id }).lean(),
    ]);

    if (jobEdges.length === 0 && candidateEdges.length === 0) {
      return {
        built: false,
        applicationId: application._id.toString(),
        jobSkills: [],
        candidateSkills: [],
        coverage: { jobSkillCount: 0, candidateEvidenceSkillCount: 0, matchedSkillCount: 0, missingJobSkillCount: 0 },
      };
    }

    const nodeIds = [...new Set([...jobEdges.map((e) => e.skillNodeId.toString()), ...candidateEdges.map((e) => e.skillNodeId.toString())])].map(
      (id) => new Types.ObjectId(id)
    );
    const nodes = await EmployerSkillNode.find({ organizationId: organization._id, _id: { $in: nodeIds } }).lean();
    const nodeById = new Map(nodes.map((n) => [n._id.toString(), n]));

    const jobSkillNodeIdSet = new Set(jobEdges.map((e) => e.skillNodeId.toString()));
    const candidateSkillNodeIdSet = new Set(candidateEdges.map((e) => e.skillNodeId.toString()));
    const matchedSkillCount = [...jobSkillNodeIdSet].filter((id) => candidateSkillNodeIdSet.has(id)).length;

    return {
      built: true,
      applicationId: application._id.toString(),
      jobSkills: jobEdges.map((e) => {
        const node = nodeById.get(e.skillNodeId.toString());
        return {
          skillNodeId: e.skillNodeId.toString(),
          canonicalName: node?.canonicalName,
          aliases: node?.aliases ?? [],
          importance: e.importance,
          weight: e.weight,
        };
      }),
      candidateSkills: candidateEdges.map((e) => {
        const node = nodeById.get(e.skillNodeId.toString());
        return {
          skillNodeId: e.skillNodeId.toString(),
          canonicalName: node?.canonicalName,
          aliases: node?.aliases ?? [],
          evidenceSources: e.sources,
        };
      }),
      coverage: {
        jobSkillCount: jobSkillNodeIdSet.size,
        candidateEvidenceSkillCount: candidateSkillNodeIdSet.size,
        matchedSkillCount,
        missingJobSkillCount: jobSkillNodeIdSet.size - matchedSkillCount,
      },
    };
  }

  /** Resolves the existing node for `normalizedKey`, or creates one with `canonicalName` from the FIRST trusted structured name seen — never renamed afterward. A later exact-string variant is appended to `aliases` (deduped, capped), never replacing `canonicalName`. */
  private async upsertSkillNode(organizationId: Types.ObjectId, rawName: string, normalizedKey: string): Promise<IEmployerSkillNode> {
    const trimmedName = rawName.trim();
    let node = await EmployerSkillNode.findOne({ organizationId, normalizedKey });
    if (!node) {
      try {
        node = await EmployerSkillNode.create({ organizationId, canonicalName: trimmedName, normalizedKey, aliases: [] });
      } catch (error: any) {
        if (error?.code !== 11000) {
          throw error;
        }
        // Concurrent duplicate create — the model's own unique index is the authoritative guard; refetch the winner.
        node = await EmployerSkillNode.findOne({ organizationId, normalizedKey });
        if (!node) {
          throw new ApiError(409, 'Skill node is already being prepared — please try again shortly');
        }
      }
    }

    if (trimmedName && trimmedName !== node.canonicalName && !node.aliases.includes(trimmedName) && node.aliases.length < MAX_ALIASES) {
      node.aliases.push(trimmedName);
      await node.save();
    }

    return node;
  }

  /** Mirrors EmployerCandidateScreeningService's/EmployerCandidateRankingService's own private helper exactly (deliberate per-service duplication, never shared). */
  private async getCurrentFinalizedSnapshot(
    organizationId: Types.ObjectId,
    jobId: Types.ObjectId
  ): Promise<IEmployerJobIntelligenceSnapshot | null> {
    const currentSource = await EmployerJobDescriptionSource.findOne({ organizationId, jobId }).sort({ version: -1 }).select('_id');
    if (!currentSource) return null;
    return EmployerJobIntelligenceSnapshot.findOne({ organizationId, jobId, jdSourceId: currentSource._id });
  }

  /** Mirrors EmployerCandidateScreeningService's/EmployerCandidateRankingService's own private helper exactly (deliberate per-service duplication, never shared). */
  private async resolveResumeAnalysis(
    organizationId: Types.ObjectId,
    application: Pick<IEmployerJobApplication, 'resumeAnalysisId' | 'candidateId'>
  ): Promise<IEmployerCandidateResumeAnalysis | null> {
    if (application.resumeAnalysisId) {
      const captured = await EmployerCandidateResumeAnalysis.findOne({
        _id: application.resumeAnalysisId,
        organizationId,
        candidateId: application.candidateId,
        status: EmployerCandidateResumeAnalysisStatus.COMPLETED,
      });
      if (captured) return captured;
    }

    const currentResumeSource = await EmployerCandidateResumeSource.findOne({ organizationId, candidateId: application.candidateId })
      .sort({ version: -1 })
      .select('_id');
    if (!currentResumeSource) return null;

    return EmployerCandidateResumeAnalysis.findOne({
      organizationId,
      candidateId: application.candidateId,
      resumeSourceId: currentResumeSource._id,
      status: EmployerCandidateResumeAnalysisStatus.COMPLETED,
    });
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

export const employerSkillGraphService = new EmployerSkillGraphService();
export default employerSkillGraphService;
