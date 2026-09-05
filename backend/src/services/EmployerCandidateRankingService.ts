import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJob, { IEmployerJob } from '../models/EmployerJob.model';
import EmployerJobApplication from '../models/EmployerJobApplication.model';
import { EmployerJobApplicationStatus } from '../constants/employerJobApplication';
import EmployerCandidate from '../models/EmployerCandidate.model';
import EmployerJobDescriptionSource from '../models/EmployerJobDescriptionSource.model';
import EmployerJobIntelligenceSnapshot from '../models/EmployerJobIntelligenceSnapshot.model';
import EmployerCandidateResumeSource from '../models/EmployerCandidateResumeSource.model';
import EmployerCandidateResumeAnalysis from '../models/EmployerCandidateResumeAnalysis.model';
import { EmployerCandidateResumeAnalysisStatus } from '../constants/employerCandidateResumeAnalysis';
import EmployerCandidateScreening from '../models/EmployerCandidateScreening.model';
import { EmployerCandidateScreeningStatus } from '../constants/employerCandidateScreening';
import EmployerCandidateScreeningScore from '../models/EmployerCandidateScreeningScore.model';
import EmployerCandidateScreeningGap from '../models/EmployerCandidateScreeningGap.model';
import { EmployerCandidateRankingUnrankedReason } from '../constants/employerCandidateRanking';
import { OrganizationType } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

export interface RankingFilters {
  status?: EmployerJobApplicationStatus;
  minScore?: number;
  search?: string;
}

interface CandidateSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface RankedRowInternal {
  applicationId: string;
  candidate: CandidateSummary;
  applicationStatus: EmployerJobApplicationStatus;
  explainableScore: number;
  competencyComponentScore: number;
  skillsComponentScore: number;
  aiScreeningScore: number;
  recommendation: string;
  confidence: number;
  gapSummary?: { criticalGapCount: number; highGapCount: number };
  appliedAt: Date;
  scoredAt: Date;
}

interface UnrankedRowInternal {
  applicationId: string;
  candidate: CandidateSummary;
  applicationStatus: EmployerJobApplicationStatus;
  reason: EmployerCandidateRankingUnrankedReason;
}

/**
 * Candidate Ranking (19D) — a live, deterministic, job-level read. Never
 * persists a ranking document; every call recomputes from the CURRENT
 * applicable state of each application's screening + 19B score, reusing
 * the SAME "current finalized JD snapshot" / "current resolvable resume
 * analysis" derivation rules 19A/19B already established (mirrored here,
 * not imported, since those are private to their own services — this is
 * the same intentional per-service duplication pattern used throughout
 * this codebase). No AI call anywhere. Ranks ONLY by the deterministic 19B
 * `score.overallScore` — never the 19A AI `result.overallScore`, never
 * `recommendation`, never gap severity, never a protected attribute.
 */
export class EmployerCandidateRankingService {
  async getJobRanking(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    jobId: string,
    filters: RankingFilters
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const job = await EmployerJob.findOne({ _id: jobId, organizationId: organization._id }).select('title jobCode status');
    if (!job) {
      throw new ApiError(404, 'Job not found');
    }

    // Eligibility: exact org+job scope, never archived.
    const applications = await EmployerJobApplication.find({
      organizationId: organization._id,
      jobId: job._id,
      status: { $ne: EmployerJobApplicationStatus.ARCHIVED },
    }).lean();

    const totalApplications = applications.length;

    if (totalApplications === 0) {
      return this.toResponse(job, [], [], totalApplications);
    }

    // Batch-load candidates — one query, never N+1.
    const candidateIds = [...new Set(applications.map((a) => a.candidateId.toString()))].map((id) => new Types.ObjectId(id));
    const candidates = await EmployerCandidate.find({ organizationId: organization._id, _id: { $in: candidateIds } })
      .select('firstName lastName email')
      .lean();
    const candidateById = new Map(candidates.map((c) => [c._id.toString(), c]));

    // The CURRENT finalized JD snapshot is shared by every application for
    // this job — resolved ONCE, not per application.
    const currentSnapshot = await this.getCurrentFinalizedSnapshot(organization._id, job._id);

    const ranked: RankedRowInternal[] = [];
    const unranked: UnrankedRowInternal[] = [];

    for (const application of applications) {
      const candidateDoc = candidateById.get(application.candidateId.toString());
      // A candidate row always exists within the same organization by
      // referential design — if somehow orphaned, skip rather than guess.
      if (!candidateDoc) continue;

      const candidate: CandidateSummary = {
        id: candidateDoc._id.toString(),
        firstName: candidateDoc.firstName,
        lastName: candidateDoc.lastName,
        email: candidateDoc.email,
      };

      if (!currentSnapshot) {
        unranked.push({
          applicationId: application._id.toString(),
          candidate,
          applicationStatus: application.status,
          reason: EmployerCandidateRankingUnrankedReason.SCREENING_REQUIRED,
        });
        continue;
      }

      const resumeAnalysis = await this.resolveResumeAnalysis(organization._id, application);
      if (!resumeAnalysis) {
        unranked.push({
          applicationId: application._id.toString(),
          candidate,
          applicationStatus: application.status,
          reason: EmployerCandidateRankingUnrankedReason.SCREENING_REQUIRED,
        });
        continue;
      }

      const screening = await EmployerCandidateScreening.findOne({
        organizationId: organization._id,
        applicationId: application._id,
        jdSnapshotId: currentSnapshot._id,
        resumeAnalysisId: resumeAnalysis._id,
        status: EmployerCandidateScreeningStatus.COMPLETED,
      }).lean();

      if (!screening || !screening.result) {
        unranked.push({
          applicationId: application._id.toString(),
          candidate,
          applicationStatus: application.status,
          reason: EmployerCandidateRankingUnrankedReason.SCREENING_REQUIRED,
        });
        continue;
      }

      const score = await EmployerCandidateScreeningScore.findOne({
        organizationId: organization._id,
        screeningId: screening._id,
      }).lean();

      if (!score) {
        unranked.push({
          applicationId: application._id.toString(),
          candidate,
          applicationStatus: application.status,
          reason: EmployerCandidateRankingUnrankedReason.EXPLAINABLE_SCORE_REQUIRED,
        });
        continue;
      }

      // Optional — display only, never part of the ranking formula.
      const gap = await EmployerCandidateScreeningGap.findOne({ organizationId: organization._id, screeningId: screening._id })
        .select('gap.summary.criticalGapCount gap.summary.highGapCount')
        .lean();

      ranked.push({
        applicationId: application._id.toString(),
        candidate,
        applicationStatus: application.status,
        explainableScore: score.score.overallScore,
        competencyComponentScore: score.score.components.competencies.score,
        skillsComponentScore: score.score.components.skills.score,
        aiScreeningScore: screening.result.overallScore,
        recommendation: screening.result.recommendation,
        confidence: screening.result.confidence,
        gapSummary: gap
          ? { criticalGapCount: gap.gap.summary.criticalGapCount, highGapCount: gap.gap.summary.highGapCount }
          : undefined,
        appliedAt: application.appliedAt,
        scoredAt: score.createdAt,
      });
    }

    this.sortRanked(ranked);
    // Competition-safe sequential rank (1, 2, 3...) assigned over the FULL
    // eligible set BEFORE filters are applied, so a candidate's rank always
    // reflects their true position among every applicant for this job —
    // filters only narrow which rows are displayed, they never renumber them.
    const rankedWithRank = ranked.map((row, index) => ({ rank: index + 1, ...row }));

    const filteredRanked = this.applyFilters(rankedWithRank, filters, true);
    const filteredUnranked = this.applyFilters(unranked, filters, false);

    return this.toResponse(job, filteredRanked, filteredUnranked, totalApplications);
  }

  private sortRanked(ranked: RankedRowInternal[]): void {
    ranked.sort((a, b) => {
      if (b.explainableScore !== a.explainableScore) return b.explainableScore - a.explainableScore;
      if (b.competencyComponentScore !== a.competencyComponentScore) return b.competencyComponentScore - a.competencyComponentScore;
      if (b.skillsComponentScore !== a.skillsComponentScore) return b.skillsComponentScore - a.skillsComponentScore;
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      const appliedDiff = a.appliedAt.getTime() - b.appliedAt.getTime();
      if (appliedDiff !== 0) return appliedDiff;
      return a.applicationId.localeCompare(b.applicationId);
    });
  }

  private applyFilters<T extends { applicationStatus: EmployerJobApplicationStatus; candidate: CandidateSummary }>(
    rows: T[],
    filters: RankingFilters,
    applyMinScore: boolean
  ): T[] {
    let result = rows;

    if (filters.status) {
      result = result.filter((row) => row.applicationStatus === filters.status);
    }

    if (applyMinScore && filters.minScore !== undefined) {
      result = result.filter((row) => 'explainableScore' in row && (row as any).explainableScore >= filters.minScore!);
    }

    if (filters.search) {
      const needle = filters.search.trim().toLowerCase();
      if (needle) {
        result = result.filter((row) => {
          const c = row.candidate;
          return (
            c.firstName.toLowerCase().includes(needle) ||
            c.lastName.toLowerCase().includes(needle) ||
            c.email.toLowerCase().includes(needle)
          );
        });
      }
    }

    return result;
  }

  /**
   * Mirrors EmployerCandidateScreeningService's private
   * `getCurrentFinalizedSnapshot` exactly — resolved ONCE per job here,
   * never per application.
   */
  private async getCurrentFinalizedSnapshot(organizationId: Types.ObjectId, jobId: Types.ObjectId) {
    const currentSource = await EmployerJobDescriptionSource.findOne({ organizationId, jobId }).sort({ version: -1 }).select('_id');
    if (!currentSource) return null;
    return EmployerJobIntelligenceSnapshot.findOne({ organizationId, jobId, jdSourceId: currentSource._id });
  }

  /** Mirrors EmployerCandidateScreeningService's private `resolveResumeAnalysis` exactly — accepts a lean application row (this service reads applications via `.lean()`, never as full Mongoose documents). */
  private async resolveResumeAnalysis(
    organizationId: Types.ObjectId,
    application: { resumeAnalysisId?: Types.ObjectId; candidateId: Types.ObjectId }
  ) {
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

  /** Type guard — candidate ranking doesn't apply to an institute org. */
  private assertIsCompany(organization: IOrganization): void {
    if (organization.type !== OrganizationType.COMPANY) {
      throw new ApiError(400, 'This organization is not a company');
    }
  }

  private toResponse(
    job: Pick<IEmployerJob, '_id' | 'title' | 'jobCode' | 'status'>,
    ranked: Array<{ rank: number } & RankedRowInternal>,
    unranked: UnrankedRowInternal[],
    totalApplications: number
  ): Record<string, unknown> {
    const scores = ranked.map((r) => r.explainableScore);
    const averageScore = scores.length > 0 ? Math.round((scores.reduce((sum, s) => sum + s, 0) / scores.length) * 100) / 100 : undefined;
    const highestScore = scores.length > 0 ? Math.max(...scores) : undefined;
    const lowestScore = scores.length > 0 ? Math.min(...scores) : undefined;

    return {
      job: {
        id: job._id.toString(),
        title: job.title,
        jobCode: job.jobCode,
        status: job.status,
      },
      ranked: ranked.map((r) => ({
        rank: r.rank,
        applicationId: r.applicationId,
        candidate: r.candidate,
        applicationStatus: r.applicationStatus,
        explainableScore: r.explainableScore,
        aiScreeningScore: r.aiScreeningScore,
        recommendation: r.recommendation,
        gapSummary: r.gapSummary,
        scoredAt: r.scoredAt,
      })),
      unranked: unranked.map((u) => ({
        applicationId: u.applicationId,
        candidate: u.candidate,
        applicationStatus: u.applicationStatus,
        reason: u.reason,
      })),
      summary: {
        totalApplications,
        rankedCount: ranked.length,
        unrankedCount: unranked.length,
        averageScore,
        highestScore,
        lowestScore,
      },
    };
  }
}

export const employerCandidateRankingService = new EmployerCandidateRankingService();
