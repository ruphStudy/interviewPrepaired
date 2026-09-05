import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJob, { IEmployerJob } from '../models/EmployerJob.model';
import EmployerJobApplication from '../models/EmployerJobApplication.model';
import { EmployerJobApplicationStatus } from '../constants/employerJobApplication';
import EmployerCandidate from '../models/EmployerCandidate.model';
import EmployerHiringAssessmentFinalization from '../models/EmployerHiringAssessmentFinalization.model';
import { employerJobApplicationService } from './EmployerJobApplicationService';
import { OrganizationType } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const COLUMN_ORDER: EmployerJobApplicationStatus[] = [
  EmployerJobApplicationStatus.APPLIED,
  EmployerJobApplicationStatus.SCREENING,
  EmployerJobApplicationStatus.SHORTLISTED,
  EmployerJobApplicationStatus.INTERVIEW,
  EmployerJobApplicationStatus.OFFER,
  EmployerJobApplicationStatus.HIRED,
  EmployerJobApplicationStatus.REJECTED,
  EmployerJobApplicationStatus.WITHDRAWN,
];

interface CandidateSummary {
  id: string;
  firstName: string;
  lastName: string;
}

interface PipelineAssessmentSummary {
  finalized: boolean;
  overallScore?: number;
  competencyCoveragePercent?: number;
  criticalFollowUpCount?: number;
  finalizedAt?: Date;
}

interface PipelineRowInternal {
  applicationId: string;
  candidate: CandidateSummary;
  status: EmployerJobApplicationStatus;
  appliedAt: Date;
  assessment: PipelineAssessmentSummary;
}

/**
 * Hiring Pipeline Board (23B) — a live, deterministic, job-level read
 * grouping EXISTING `EmployerJobApplication.status` values into columns,
 * with finalized 22E assessment metadata shown for context only. Uses NO
 * new status model — pipeline "stage" IS the existing application
 * lifecycle status. `EmployerJobApplicationService.updateApplicationStatus`
 * remains the SINGLE lifecycle authority: this service never writes
 * `application.status` directly and never auto-advances a stage based on
 * score/finalization/comparison position. NO AI, no persisted board
 * document.
 */
export class EmployerHiringPipelineService {
  /** GET .../jobs/:jobId/pipeline — requires ORGANIZATION_VIEW. */
  async getJobPipeline(organizationId: string, actingRole: OrganizationMemberRole, jobId: string): Promise<Record<string, unknown>> {
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

    const totalActiveApplications = applications.length;
    if (totalActiveApplications === 0) {
      return this.toResponse(job, [], totalActiveApplications);
    }

    const candidateIds = [...new Set(applications.map((a) => a.candidateId.toString()))].map((id) => new Types.ObjectId(id));
    const candidates = await EmployerCandidate.find({ organizationId: organization._id, _id: { $in: candidateIds } })
      .select('firstName lastName')
      .lean();
    const candidateById = new Map(candidates.map((c) => [c._id.toString(), c]));

    // Batch-load finalizations for every application of this job — one
    // query, never N+1. A job/application may have multiple historical
    // finalizations (across sessions); the most recently created one per
    // application is the CURRENT one.
    const applicationIds = applications.map((a) => a._id);
    const finalizations = await EmployerHiringAssessmentFinalization.find({
      organizationId: organization._id,
      applicationId: { $in: applicationIds },
    })
      .sort({ createdAt: -1 })
      .lean();
    const finalizationByApplication = new Map<string, (typeof finalizations)[number]>();
    for (const f of finalizations) {
      const key = f.applicationId.toString();
      if (!finalizationByApplication.has(key)) {
        finalizationByApplication.set(key, f); // already sorted desc — first seen is the latest
      }
    }

    const rows: PipelineRowInternal[] = [];
    for (const application of applications) {
      const candidateDoc = candidateById.get(application.candidateId.toString());
      if (!candidateDoc) continue; // orphaned reference — skip rather than guess

      const candidate: CandidateSummary = {
        id: candidateDoc._id.toString(),
        firstName: candidateDoc.firstName,
        lastName: candidateDoc.lastName,
      };

      const finalization = finalizationByApplication.get(application._id.toString());
      const assessment: PipelineAssessmentSummary = finalization
        ? {
            finalized: true,
            overallScore: finalization.snapshot.overallScore,
            competencyCoveragePercent: finalization.snapshot.competencyCoveragePercent,
            criticalFollowUpCount: finalization.snapshot.evidenceSummary.criticalFollowUpCount,
            finalizedAt: finalization.finalizedAt,
          }
        : { finalized: false };

      rows.push({
        applicationId: application._id.toString(),
        candidate,
        status: application.status,
        appliedAt: application.appliedAt,
        assessment,
      });
    }

    return this.toResponse(job, rows, totalActiveApplications);
  }

  /**
   * PATCH .../applications/:applicationId/pipeline-stage — the ONLY
   * mutation in this service, and it is a pure pass-through:
   * `EmployerJobApplicationService.updateApplicationStatus` remains the
   * single lifecycle authority (its own transition map, RBAC, and
   * mutability checks apply unchanged) — this service never writes
   * `status` directly and never duplicates the transition rules.
   */
  async moveApplicationStage(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    actingMembershipId: string,
    applicationId: string,
    targetStatus: EmployerJobApplicationStatus
  ): Promise<Record<string, unknown>> {
    return employerJobApplicationService.updateApplicationStatus(organizationId, actingRole, actingMembershipId, applicationId, targetStatus);
  }

  /** Deterministic column order: finalized candidates first, then overallScore DESC (finalized only), then appliedAt ASC, then applicationId — never called "ranking". */
  private sortColumn(rows: PipelineRowInternal[]): void {
    rows.sort((a, b) => {
      if (a.assessment.finalized !== b.assessment.finalized) return a.assessment.finalized ? -1 : 1;
      if (a.assessment.finalized && b.assessment.finalized) {
        const scoreDiff = (b.assessment.overallScore ?? 0) - (a.assessment.overallScore ?? 0);
        if (scoreDiff !== 0) return scoreDiff;
      }
      const appliedDiff = a.appliedAt.getTime() - b.appliedAt.getTime();
      if (appliedDiff !== 0) return appliedDiff;
      return a.applicationId.localeCompare(b.applicationId);
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

  /** Type guard — the hiring pipeline board doesn't apply to an institute org. */
  private assertIsCompany(organization: IOrganization): void {
    if (organization.type !== OrganizationType.COMPANY) {
      throw new ApiError(400, 'This organization is not a company');
    }
  }

  private toResponse(
    job: Pick<IEmployerJob, '_id' | 'title' | 'jobCode' | 'status'>,
    rows: PipelineRowInternal[],
    totalActiveApplications: number
  ): Record<string, unknown> {
    const columns = COLUMN_ORDER.map((status) => {
      const columnRows = rows.filter((r) => r.status === status);
      this.sortColumn(columnRows);
      return {
        status,
        count: columnRows.length,
        applications: columnRows.map((r) => ({
          applicationId: r.applicationId,
          candidate: r.candidate,
          status: r.status,
          appliedAt: r.appliedAt,
          assessment: r.assessment,
        })),
      };
    });

    return {
      job: {
        id: job._id.toString(),
        title: job.title,
        jobCode: job.jobCode,
        status: job.status,
      },
      columns,
      summary: {
        totalActiveApplications,
        finalizedAssessmentCount: rows.filter((r) => r.assessment.finalized).length,
        offerCount: rows.filter((r) => r.status === EmployerJobApplicationStatus.OFFER).length,
        hiredCount: rows.filter((r) => r.status === EmployerJobApplicationStatus.HIRED).length,
        rejectedCount: rows.filter((r) => r.status === EmployerJobApplicationStatus.REJECTED).length,
      },
    };
  }
}

export const employerHiringPipelineService = new EmployerHiringPipelineService();
export default employerHiringPipelineService;
