import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJob, { IEmployerJob } from '../models/EmployerJob.model';
import EmployerJobApplication from '../models/EmployerJobApplication.model';
import { EmployerJobApplicationStatus } from '../constants/employerJobApplication';
import EmployerCandidate from '../models/EmployerCandidate.model';
import EmployerHiringAssessmentFinalization from '../models/EmployerHiringAssessmentFinalization.model';
import EmployerHiringAssessmentResult from '../models/EmployerHiringAssessmentResult.model';
import EmployerHiringEvidenceMatrix from '../models/EmployerHiringEvidenceMatrix.model';
import { OrganizationType } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

export interface ComparisonFilters {
  status?: EmployerJobApplicationStatus;
  minOverallScore?: number;
  search?: string;
  /** Accepted for API symmetry with 19D; `notReady` is always returned separately per spec regardless of this flag — it never gates inclusion. */
  finalizedOnly?: boolean;
}

interface CandidateSummary {
  id: string;
  firstName: string;
  lastName: string;
}

interface ComparisonCompetencyRow {
  competencyName: string;
  importance: string;
  jdWeight: number;
  score: number;
  evidenceStatus: string;
}

interface ComparisonRowInternal {
  applicationId: string;
  candidate: CandidateSummary;
  applicationStatus: EmployerJobApplicationStatus;
  overallScore: number;
  averageRubricScore: number;
  competencyCoveragePercent: number;
  assessedWeight: number;
  evidenceSummary: {
    strongCount: number;
    sufficientCount: number;
    partialCount: number;
    insufficientCount: number;
    followUpCompetencyCount: number;
    criticalFollowUpCount: number;
  };
  followUpQuestionCount: number;
  reviewedCount: number;
  finalizedAt: Date;
  competencies: ComparisonCompetencyRow[];
}

interface NotReadyRowInternal {
  applicationId: string;
  candidate: CandidateSummary;
  applicationStatus: EmployerJobApplicationStatus;
  reason: 'assessment_not_finalized';
}

/**
 * Job Candidate Comparison (23A) — a live, deterministic, job-level read
 * across candidates with a COMPLETED 22E finalization. Never persists a
 * comparison/ranking document; every call recomputes from the CURRENT
 * finalization + its exact pinned 21E result / 22A evidence matrix. NO AI,
 * no resume/screening scores in ordering (distinct from 19D's pre-interview
 * screening ranking), no hire/reject/recommendation language — this is
 * `comparisonPosition` ordering by finalized assessment metrics only.
 */
export class EmployerHiringCandidateComparisonService {
  async getComparison(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    jobId: string,
    filters: ComparisonFilters
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const job = await EmployerJob.findOne({ _id: jobId, organizationId: organization._id }).select('title jobCode status');
    if (!job) {
      throw new ApiError(404, 'Job not found');
    }

    const applications = await EmployerJobApplication.find({
      organizationId: organization._id,
      jobId: job._id,
      status: { $ne: EmployerJobApplicationStatus.ARCHIVED },
    }).lean();

    const totalApplications = applications.length;
    if (totalApplications === 0) {
      return this.toResponse(job, [], [], totalApplications);
    }

    const candidateIds = [...new Set(applications.map((a) => a.candidateId.toString()))].map((id) => new Types.ObjectId(id));
    const candidates = await EmployerCandidate.find({ organizationId: organization._id, _id: { $in: candidateIds } })
      .select('firstName lastName')
      .lean();
    const candidateById = new Map(candidates.map((c) => [c._id.toString(), c]));

    const comparison: ComparisonRowInternal[] = [];
    const notReady: NotReadyRowInternal[] = [];

    for (const application of applications) {
      const candidateDoc = candidateById.get(application.candidateId.toString());
      if (!candidateDoc) continue; // orphaned reference — skip rather than guess, mirrors 19D's own convention

      const candidate: CandidateSummary = {
        id: candidateDoc._id.toString(),
        firstName: candidateDoc.firstName,
        lastName: candidateDoc.lastName,
      };

      // Exact linkage only — never "current invitation" re-resolution. A
      // job/application may have multiple historical finalizations across
      // sessions; the most recently created one is the CURRENT one.
      const finalization = await EmployerHiringAssessmentFinalization.findOne({
        organizationId: organization._id,
        applicationId: application._id,
        jobId: job._id,
      })
        .sort({ createdAt: -1 })
        .lean();

      if (!finalization) {
        notReady.push({
          applicationId: application._id.toString(),
          candidate,
          applicationStatus: application.status,
          reason: 'assessment_not_finalized',
        });
        continue;
      }

      const assessmentResult = await EmployerHiringAssessmentResult.findOne({
        _id: finalization.assessmentResultId,
        organizationId: organization._id,
      }).lean();
      const evidenceMatrix = await EmployerHiringEvidenceMatrix.findOne({
        _id: finalization.evidenceMatrixId,
        organizationId: organization._id,
      }).lean();

      if (!assessmentResult || !evidenceMatrix) {
        throw new ApiError(500, 'Assessment finalization integrity error: referenced artifact is missing');
      }
      // Integrity: the finalization's pinned artifacts must reference the
      // EXACT same interview/application chain — never silently relinked.
      if (
        assessmentResult.interviewId.toString() !== finalization.interviewId.toString() ||
        assessmentResult.applicationId.toString() !== application._id.toString() ||
        evidenceMatrix.interviewId.toString() !== finalization.interviewId.toString() ||
        evidenceMatrix.assessmentResultId.toString() !== assessmentResult._id.toString()
      ) {
        throw new ApiError(500, 'Assessment finalization integrity error: artifact linkage mismatch');
      }

      const evidenceStatusByName = new Map(evidenceMatrix.matrix.competencies.map((c) => [c.competencyName, c.evidenceStatus]));
      const competencies: ComparisonCompetencyRow[] = assessmentResult.result.competencies.map((c) => ({
        competencyName: c.competencyName,
        importance: c.importance,
        jdWeight: c.jdWeight,
        score: c.score,
        evidenceStatus: evidenceStatusByName.get(c.competencyName) ?? 'insufficient',
      }));

      comparison.push({
        applicationId: application._id.toString(),
        candidate,
        applicationStatus: application.status,
        overallScore: finalization.snapshot.overallScore,
        averageRubricScore: finalization.snapshot.averageRubricScore,
        competencyCoveragePercent: finalization.snapshot.competencyCoveragePercent,
        assessedWeight: finalization.snapshot.assessedWeight,
        evidenceSummary: finalization.snapshot.evidenceSummary,
        followUpQuestionCount: finalization.snapshot.followUpQuestionCount,
        reviewedCount: finalization.snapshot.reviewSummary.reviewedCount,
        finalizedAt: finalization.finalizedAt,
        competencies,
      });
    }

    this.sortComparison(comparison);
    // comparisonPosition assigned over the FULL eligible finalized set
    // BEFORE display filters — filters only narrow which rows are shown,
    // they never renumber them.
    const withPosition = comparison.map((row, index) => ({ comparisonPosition: index + 1, ...row }));

    const filteredComparison = this.applyFilters(withPosition, filters, true);
    const filteredNotReady = this.applyFilters(notReady, filters, false);

    return this.toResponse(job, filteredComparison, filteredNotReady, totalApplications, comparison);
  }

  private sortComparison(rows: ComparisonRowInternal[]): void {
    rows.sort((a, b) => {
      if (b.overallScore !== a.overallScore) return b.overallScore - a.overallScore;
      if (b.competencyCoveragePercent !== a.competencyCoveragePercent) return b.competencyCoveragePercent - a.competencyCoveragePercent;
      if (b.assessedWeight !== a.assessedWeight) return b.assessedWeight - a.assessedWeight;
      const aCritical = a.evidenceSummary.criticalFollowUpCount;
      const bCritical = b.evidenceSummary.criticalFollowUpCount;
      if (aCritical !== bCritical) return aCritical - bCritical;
      const aFollowUp = a.evidenceSummary.followUpCompetencyCount;
      const bFollowUp = b.evidenceSummary.followUpCompetencyCount;
      if (aFollowUp !== bFollowUp) return aFollowUp - bFollowUp;
      const finalizedDiff = a.finalizedAt.getTime() - b.finalizedAt.getTime();
      if (finalizedDiff !== 0) return finalizedDiff;
      return a.applicationId.localeCompare(b.applicationId);
    });
  }

  private applyFilters<T extends { applicationStatus: EmployerJobApplicationStatus; candidate: CandidateSummary }>(
    rows: T[],
    filters: ComparisonFilters,
    applyMinScore: boolean
  ): T[] {
    let result = rows;

    if (filters.status) {
      result = result.filter((row) => row.applicationStatus === filters.status);
    }

    if (applyMinScore && filters.minOverallScore !== undefined) {
      result = result.filter((row) => 'overallScore' in row && (row as any).overallScore >= filters.minOverallScore!);
    }

    if (filters.search) {
      const needle = filters.search.trim().toLowerCase();
      if (needle) {
        result = result.filter((row) => {
          const c = row.candidate;
          return c.firstName.toLowerCase().includes(needle) || c.lastName.toLowerCase().includes(needle);
        });
      }
    }

    return result;
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

  /** Type guard — hiring assessment comparison doesn't apply to an institute org. */
  private assertIsCompany(organization: IOrganization): void {
    if (organization.type !== OrganizationType.COMPANY) {
      throw new ApiError(400, 'This organization is not a company');
    }
  }

  private toResponse(
    job: Pick<IEmployerJob, '_id' | 'title' | 'jobCode' | 'status'>,
    comparison: Array<{ comparisonPosition: number } & ComparisonRowInternal>,
    notReady: NotReadyRowInternal[],
    totalApplications: number,
    fullFinalizedSet?: ComparisonRowInternal[]
  ): Record<string, unknown> {
    // Summary metrics are computed over the FULL finalized eligible set,
    // before display filters — falls back to the (already-full) comparison
    // array when there's nothing to filter (e.g. zero applications).
    const scoreSource = fullFinalizedSet ?? comparison;
    const scores = scoreSource.map((r) => r.overallScore);
    const averageOverallScore = scores.length > 0 ? Math.round((scores.reduce((sum, s) => sum + s, 0) / scores.length) * 100) / 100 : undefined;
    const highestOverallScore = scores.length > 0 ? Math.max(...scores) : undefined;
    const lowestOverallScore = scores.length > 0 ? Math.min(...scores) : undefined;

    return {
      job: {
        id: job._id.toString(),
        title: job.title,
        jobCode: job.jobCode,
        status: job.status,
      },
      comparison: comparison.map((r) => ({
        comparisonPosition: r.comparisonPosition,
        applicationId: r.applicationId,
        candidate: r.candidate,
        applicationStatus: r.applicationStatus,
        assessment: {
          overallScore: r.overallScore,
          averageRubricScore: r.averageRubricScore,
          competencyCoveragePercent: r.competencyCoveragePercent,
          assessedWeight: r.assessedWeight,
          evidenceSummary: r.evidenceSummary,
          followUpQuestionCount: r.followUpQuestionCount,
          reviewedCount: r.reviewedCount,
          finalizedAt: r.finalizedAt,
        },
        competencies: r.competencies,
      })),
      notReady: notReady.map((n) => ({
        applicationId: n.applicationId,
        candidate: n.candidate,
        applicationStatus: n.applicationStatus,
        reason: n.reason,
      })),
      summary: {
        totalApplications,
        finalizedCount: scoreSource.length,
        notReadyCount: totalApplications - scoreSource.length,
        averageOverallScore,
        highestOverallScore,
        lowestOverallScore,
      },
    };
  }
}

export const employerHiringCandidateComparisonService = new EmployerHiringCandidateComparisonService();
export default employerHiringCandidateComparisonService;
