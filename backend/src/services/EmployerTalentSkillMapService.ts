import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerCandidate from '../models/EmployerCandidate.model';
import EmployerSkillNode from '../models/EmployerSkillNode.model';
import EmployerCandidateSkillMemory from '../models/EmployerCandidateSkillMemory.model';
import EmployerCandidateSkillEvolution from '../models/EmployerCandidateSkillEvolution.model';
import { EmployerSkillClassification } from '../models/EmployerApplicationSkillIntelligence.model';
import { EmployerSkillEvidenceRecencyBucket, EmployerSkillEvolutionTrend } from '../models/EmployerCandidateSkillEvolution.model';
import { OrganizationType } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const RECENT_MAX_DAYS = 90;
const AGING_MAX_DAYS = 180;
const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

export interface EmployerTalentSearchFilters {
  search?: string;
  skillNodeIds?: string[];
  classification?: EmployerSkillClassification;
  recencyBucket?: EmployerSkillEvidenceRecencyBucket;
  minEvidenceStrength?: number;
  page?: number;
  limit?: number;
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));
}

function recencyBucketFor(days: number): EmployerSkillEvidenceRecencyBucket {
  if (days <= RECENT_MAX_DAYS) return 'recent';
  if (days <= AGING_MAX_DAYS) return 'aging';
  return 'stale';
}

/**
 * Employer-internal talent DISCOVERY across candidates by existing
 * structured skill evidence (25A-25D) — a search/read layer only. This is
 * NOT candidate ranking and NOT a hiring recommendation: ordering is
 * deterministic discovery ordering (`displayPosition`), never a fit/rank
 * score. Never auto-builds 25A-25D; only candidates with an existing 25C
 * `EmployerCandidateSkillMemory` row participate. 25D evolution (trend/
 * recency) is used to ENRICH results when it already exists — recency may
 * be derived from 25C's own `lastObservedAt` when no 25D row exists yet,
 * but that derived value is never written back as a 25D row.
 */
export class EmployerTalentSkillMapService {
  /** GET .../talent/skill-search — requires ORGANIZATION_VIEW. Read-only discovery; never mutates pipeline/candidate state. */
  async searchTalent(organizationId: string, actingRole: OrganizationMemberRole, filters: EmployerTalentSearchFilters): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit = filters.limit && filters.limit > 0 ? Math.min(filters.limit, MAX_PAGE_LIMIT) : DEFAULT_PAGE_LIMIT;

    let requiredSkillNodeIds: Types.ObjectId[] | undefined;
    if (filters.skillNodeIds && filters.skillNodeIds.length > 0) {
      const nodes = await EmployerSkillNode.find({ organizationId: organization._id, _id: { $in: filters.skillNodeIds } })
        .select('_id')
        .lean();
      if (nodes.length !== new Set(filters.skillNodeIds).size) {
        throw new ApiError(400, 'One or more skillNodeIds are invalid for this organization');
      }
      requiredSkillNodeIds = nodes.map((n) => n._id as Types.ObjectId);
    }

    const memoryQuery: Record<string, unknown> = { organizationId: organization._id };
    if (requiredSkillNodeIds) memoryQuery.skillNodeId = { $in: requiredSkillNodeIds };
    if (filters.classification) memoryQuery.latestClassification = filters.classification;
    if (typeof filters.minEvidenceStrength === 'number') {
      memoryQuery.latestEvidenceStrengthScore = { $gte: filters.minEvidenceStrength };
    }

    const memoryRows = await EmployerCandidateSkillMemory.find(memoryQuery)
      .select('candidateId skillNodeId observations observationCount lastObservedAt latestClassification latestEvidenceStrengthScore')
      .lean();

    if (memoryRows.length === 0) {
      return { candidates: [], pagination: { page, limit, total: 0, totalPages: 1 }, skillMatchMode: 'all' };
    }

    const candidateIds = [...new Set(memoryRows.map((m) => m.candidateId.toString()))].map((id) => new Types.ObjectId(id));
    const nodeIds = [...new Set(memoryRows.map((m) => m.skillNodeId.toString()))].map((id) => new Types.ObjectId(id));

    const [candidates, nodes, evolutionRows] = await Promise.all([
      EmployerCandidate.find({ organizationId: organization._id, _id: { $in: candidateIds } }).select('_id firstName lastName').lean(),
      EmployerSkillNode.find({ organizationId: organization._id, _id: { $in: nodeIds } }).select('_id canonicalName').lean(),
      EmployerCandidateSkillEvolution.find({
        organizationId: organization._id,
        candidateId: { $in: candidateIds },
        skillNodeId: { $in: nodeIds },
      })
        .select('candidateId skillNodeId trend recency applicationCount')
        .lean(),
    ]);

    const candidateById = new Map(candidates.map((c) => [c._id.toString(), c]));
    const nodeById = new Map(nodes.map((n) => [n._id.toString(), n]));
    const evolutionByKey = new Map(evolutionRows.map((e) => [`${e.candidateId.toString()}:${e.skillNodeId.toString()}`, e]));

    const now = new Date();
    const bucketFor = (candidateIdStr: string, skillNodeIdStr: string, lastObservedAt: Date): EmployerSkillEvidenceRecencyBucket => {
      const evo = evolutionByKey.get(`${candidateIdStr}:${skillNodeIdStr}`);
      if (evo) return evo.recency.bucket;
      return recencyBucketFor(daysBetween(lastObservedAt, now));
    };

    let filteredRows = memoryRows;
    if (filters.recencyBucket) {
      filteredRows = filteredRows.filter(
        (m) => bucketFor(m.candidateId.toString(), m.skillNodeId.toString(), m.lastObservedAt) === filters.recencyBucket
      );
    }
    if (filters.search) {
      const s = filters.search.toLowerCase();
      filteredRows = filteredRows.filter((m) => {
        const candidate = candidateById.get(m.candidateId.toString());
        const nameMatch = candidate ? `${candidate.firstName} ${candidate.lastName}`.toLowerCase().includes(s) : false;
        const skillMatch = (nodeById.get(m.skillNodeId.toString())?.canonicalName || '').toLowerCase().includes(s);
        return nameMatch || skillMatch;
      });
    }

    const rowsByCandidate = new Map<string, typeof filteredRows>();
    for (const row of filteredRows) {
      const key = row.candidateId.toString();
      if (!rowsByCandidate.has(key)) rowsByCandidate.set(key, []);
      rowsByCandidate.get(key)!.push(row);
    }

    // AND semantics: with multiple requested skills, a candidate must have a
    // qualifying (post-filter) memory row for EVERY requested skill — never OR.
    let candidateEntries = [...rowsByCandidate.entries()];
    if (requiredSkillNodeIds) {
      const requiredSet = new Set(requiredSkillNodeIds.map((id) => id.toString()));
      candidateEntries = candidateEntries.filter(([, rows]) => {
        const matchedSkillIds = new Set(rows.map((r) => r.skillNodeId.toString()));
        return [...requiredSet].every((id) => matchedSkillIds.has(id));
      });
    }

    interface ResultEntry {
      candidate: { id: string; firstName: string; lastName: string };
      matchingSkills: Array<{
        skillNodeId: string;
        canonicalName?: string;
        latestClassification: EmployerSkillClassification;
        latestEvidenceStrengthScore?: number;
        lastObservedAt: Date;
        observationCount: number;
        applicationCount: number;
        trend?: EmployerSkillEvolutionTrend;
        recencyBucket?: EmployerSkillEvidenceRecencyBucket;
      }>;
      matchSummary: { matchedSkillCount: number; strongestEvidenceScore?: number };
      mostRecentObservedAtMs: number;
    }

    const results: ResultEntry[] = [];
    for (const [candidateIdStr, rows] of candidateEntries) {
      const candidate = candidateById.get(candidateIdStr);
      if (!candidate) continue;

      const matchingSkills = rows
        .map((r) => {
          const evo = evolutionByKey.get(`${candidateIdStr}:${r.skillNodeId.toString()}`);
          return {
            skillNodeId: r.skillNodeId.toString(),
            canonicalName: nodeById.get(r.skillNodeId.toString())?.canonicalName,
            latestClassification: r.latestClassification,
            latestEvidenceStrengthScore: r.latestEvidenceStrengthScore,
            lastObservedAt: r.lastObservedAt,
            observationCount: r.observationCount,
            applicationCount: evo?.applicationCount ?? new Set(r.observations.map((o) => o.applicationId.toString())).size,
            trend: evo?.trend,
            recencyBucket: bucketFor(candidateIdStr, r.skillNodeId.toString(), r.lastObservedAt),
          };
        })
        .sort((a, b) => (a.canonicalName || '').localeCompare(b.canonicalName || ''));

      let strongestEvidenceScore: number | undefined;
      let mostRecentObservedAtMs = 0;
      for (const s of matchingSkills) {
        if (typeof s.latestEvidenceStrengthScore === 'number') {
          strongestEvidenceScore = strongestEvidenceScore === undefined ? s.latestEvidenceStrengthScore : Math.max(strongestEvidenceScore, s.latestEvidenceStrengthScore);
        }
        mostRecentObservedAtMs = Math.max(mostRecentObservedAtMs, s.lastObservedAt.getTime());
      }

      results.push({
        candidate: { id: candidate._id.toString(), firstName: candidate.firstName, lastName: candidate.lastName },
        matchingSkills,
        matchSummary: { matchedSkillCount: matchingSkills.length, strongestEvidenceScore },
        mostRecentObservedAtMs,
      });
    }

    // Deterministic discovery ordering — NOT a fit/hiring rank.
    results.sort((a, b) => {
      if (b.matchSummary.matchedSkillCount !== a.matchSummary.matchedSkillCount) {
        return b.matchSummary.matchedSkillCount - a.matchSummary.matchedSkillCount;
      }
      const bScore = b.matchSummary.strongestEvidenceScore ?? -1;
      const aScore = a.matchSummary.strongestEvidenceScore ?? -1;
      if (bScore !== aScore) return bScore - aScore;
      if (b.mostRecentObservedAtMs !== a.mostRecentObservedAtMs) return b.mostRecentObservedAtMs - a.mostRecentObservedAtMs;
      return a.candidate.id.localeCompare(b.candidate.id);
    });

    const total = results.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const start = (page - 1) * limit;
    const paged = results.slice(start, start + limit).map((r, idx) => ({
      candidate: r.candidate,
      matchingSkills: r.matchingSkills,
      matchSummary: r.matchSummary,
      displayPosition: start + idx + 1,
    }));

    return { candidates: paged, pagination: { page, limit, total, totalPages }, skillMatchMode: 'all' };
  }

  /** GET .../talent/skill-map — requires ANALYTICS_VIEW. Aggregate-only; never returns candidate identities. */
  async getOrgSkillMap(organizationId: string, actingRole: OrganizationMemberRole): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ANALYTICS_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const memoryRows = await EmployerCandidateSkillMemory.find({ organizationId: organization._id })
      .select('candidateId skillNodeId observationCount lastObservedAt')
      .lean();

    if (memoryRows.length === 0) {
      return { summary: { candidateCountWithSkillMemory: 0, uniqueSkillCount: 0, totalSkillObservations: 0 }, skills: [] };
    }

    const nodeIds = [...new Set(memoryRows.map((m) => m.skillNodeId.toString()))].map((id) => new Types.ObjectId(id));
    const [nodes, evolutionRows] = await Promise.all([
      EmployerSkillNode.find({ organizationId: organization._id, _id: { $in: nodeIds } }).select('_id canonicalName').lean(),
      EmployerCandidateSkillEvolution.find({ organizationId: organization._id, skillNodeId: { $in: nodeIds } })
        .select('candidateId skillNodeId recency')
        .lean(),
    ]);
    const nodeById = new Map(nodes.map((n) => [n._id.toString(), n]));
    const evolutionByKey = new Map(evolutionRows.map((e) => [`${e.candidateId.toString()}:${e.skillNodeId.toString()}`, e]));

    const now = new Date();
    interface SkillAgg {
      candidateIds: Set<string>;
      observationCount: number;
      recentCandidateIds: Set<string>;
      staleCandidateIds: Set<string>;
    }
    const bySkill = new Map<string, SkillAgg>();
    const allCandidateIds = new Set<string>();

    for (const m of memoryRows) {
      const candidateIdStr = m.candidateId.toString();
      const skillNodeIdStr = m.skillNodeId.toString();
      allCandidateIds.add(candidateIdStr);

      if (!bySkill.has(skillNodeIdStr)) {
        bySkill.set(skillNodeIdStr, { candidateIds: new Set(), observationCount: 0, recentCandidateIds: new Set(), staleCandidateIds: new Set() });
      }
      const agg = bySkill.get(skillNodeIdStr)!;
      agg.candidateIds.add(candidateIdStr);
      agg.observationCount += m.observationCount;

      const evo = evolutionByKey.get(`${candidateIdStr}:${skillNodeIdStr}`);
      const bucket = evo ? evo.recency.bucket : recencyBucketFor(daysBetween(m.lastObservedAt, now));
      if (bucket === 'recent') agg.recentCandidateIds.add(candidateIdStr);
      if (bucket === 'stale') agg.staleCandidateIds.add(candidateIdStr);
    }

    const skills = [...bySkill.entries()]
      .map(([skillNodeId, agg]) => ({
        skillNodeId,
        canonicalName: nodeById.get(skillNodeId)?.canonicalName,
        candidateCount: agg.candidateIds.size,
        observationCount: agg.observationCount,
        recentEvidenceCandidateCount: agg.recentCandidateIds.size,
        staleEvidenceCandidateCount: agg.staleCandidateIds.size,
      }))
      .sort((a, b) => b.candidateCount - a.candidateCount || (a.canonicalName || '').localeCompare(b.canonicalName || ''));

    const totalSkillObservations = memoryRows.reduce((sum, m) => sum + m.observationCount, 0);

    return {
      summary: {
        candidateCountWithSkillMemory: allCandidateIds.size,
        uniqueSkillCount: bySkill.size,
        totalSkillObservations,
      },
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
}

export const employerTalentSkillMapService = new EmployerTalentSkillMapService();
export default employerTalentSkillMapService;
