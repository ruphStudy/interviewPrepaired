import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJob from '../models/EmployerJob.model';
import EmployerJobApplication from '../models/EmployerJobApplication.model';
import { EmployerJobApplicationStatus } from '../constants/employerJobApplication';
import EmployerJobApplicationActivity from '../models/EmployerJobApplicationActivity.model';
import { OrganizationType } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const CURRENT_PIPELINE_STAGES: EmployerJobApplicationStatus[] = [
  EmployerJobApplicationStatus.APPLIED,
  EmployerJobApplicationStatus.SCREENING,
  EmployerJobApplicationStatus.SHORTLISTED,
  EmployerJobApplicationStatus.INTERVIEW,
  EmployerJobApplicationStatus.OFFER,
  EmployerJobApplicationStatus.HIRED,
  EmployerJobApplicationStatus.REJECTED,
  EmployerJobApplicationStatus.WITHDRAWN,
];

const FUNNEL_STAGES: EmployerJobApplicationStatus[] = [
  EmployerJobApplicationStatus.APPLIED,
  EmployerJobApplicationStatus.SCREENING,
  EmployerJobApplicationStatus.SHORTLISTED,
  EmployerJobApplicationStatus.INTERVIEW,
  EmployerJobApplicationStatus.OFFER,
  EmployerJobApplicationStatus.HIRED,
];

const TRANSITIONS: Array<[EmployerJobApplicationStatus, EmployerJobApplicationStatus]> = [
  [EmployerJobApplicationStatus.APPLIED, EmployerJobApplicationStatus.SCREENING],
  [EmployerJobApplicationStatus.SCREENING, EmployerJobApplicationStatus.SHORTLISTED],
  [EmployerJobApplicationStatus.SHORTLISTED, EmployerJobApplicationStatus.INTERVIEW],
  [EmployerJobApplicationStatus.INTERVIEW, EmployerJobApplicationStatus.OFFER],
  [EmployerJobApplicationStatus.OFFER, EmployerJobApplicationStatus.HIRED],
];

interface StageEvent {
  status: EmployerJobApplicationStatus;
  enteredAt: Date;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Deterministic (no AI), live job-level hiring funnel/conversion analytics
 * (23D) — never persisted. `currentPipeline` counts are authoritative
 * (current `EmployerJobApplication.status` only). `observedFunnel` and
 * `transitionTiming` use ONLY stored 23C `EmployerJobApplicationActivity`
 * rows — a candidate currently at `offer` is never assumed to have
 * reached `screening`/`shortlisted`/`interview` unless a stored event says
 * so. `dataCoverage.historicalTrackingComplete` is the honest signal for
 * whether the observed funnel represents complete history or only
 * activity recorded since 23C was introduced.
 */
export class EmployerHiringPipelineAnalyticsService {
  async getJobPipelineAnalytics(organizationId: string, actingRole: OrganizationMemberRole, jobId: string): Promise<Record<string, unknown>> {
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
    })
      .select('_id status appliedAt')
      .lean();

    const totalApplications = applications.length;

    // Current pipeline — authoritative counts from current status only.
    const currentCounts = new Map<EmployerJobApplicationStatus, number>(CURRENT_PIPELINE_STAGES.map((s) => [s, 0]));
    for (const application of applications) {
      currentCounts.set(application.status, (currentCounts.get(application.status) ?? 0) + 1);
    }

    // Activities scoped to EXACT organization + job + this job's own
    // application ids — a query shape that structurally excludes any
    // orphan/mismatched row rather than needing to detect one after the fact.
    const applicationIds = applications.map((a) => a._id);
    const activities =
      applicationIds.length > 0
        ? await EmployerJobApplicationActivity.find({
            organizationId: organization._id,
            jobId: job._id,
            applicationId: { $in: applicationIds },
          })
            .sort({ occurredAt: 1 })
            .lean()
        : [];

    const activitiesByApplication = new Map<string, typeof activities>();
    for (const activity of activities) {
      const key = activity.applicationId.toString();
      if (!activitiesByApplication.has(key)) activitiesByApplication.set(key, []);
      activitiesByApplication.get(key)!.push(activity);
    }

    let trackedApplications = 0;
    let applicationsWithCreationEvent = 0;
    const stageHistoryByApplication = new Map<string, StageEvent[]>();

    for (const application of applications) {
      const key = application._id.toString();
      const appActivities = activitiesByApplication.get(key) ?? [];
      if (appActivities.length > 0) trackedApplications += 1;
      if (appActivities.some((a) => a.type === 'application_created')) applicationsWithCreationEvent += 1;

      const history: StageEvent[] = [];
      for (const a of appActivities) {
        if (a.type === 'application_created') {
          history.push({ status: EmployerJobApplicationStatus.APPLIED, enteredAt: a.occurredAt });
        } else if (a.type === 'status_changed' && a.toStatus) {
          history.push({ status: a.toStatus, enteredAt: a.occurredAt });
        }
      }
      stageHistoryByApplication.set(key, history);
    }

    const historicalTrackingComplete = totalApplications > 0 && applicationsWithCreationEvent === totalApplications;
    const trackingCoveragePercent = totalApplications > 0 ? round2((trackedApplications / totalApplications) * 100) : 0;

    // Observed funnel — "reached stage S" derived ONLY from stored events,
    // never from current status.
    const reachedSets = new Map<EmployerJobApplicationStatus, Set<string>>(FUNNEL_STAGES.map((s) => [s, new Set<string>()]));
    for (const [applicationId, history] of stageHistoryByApplication.entries()) {
      for (const event of history) {
        const set = reachedSets.get(event.status);
        if (set) set.add(applicationId);
      }
    }

    const observedFunnel = FUNNEL_STAGES.map((stage, index) => {
      const observedReachedCount = reachedSets.get(stage)!.size;
      let conversionFromPreviousPercent: number | null = null;
      if (index > 0) {
        const previousCount = reachedSets.get(FUNNEL_STAGES[index - 1])!.size;
        conversionFromPreviousPercent = previousCount > 0 ? clamp(round2((observedReachedCount / previousCount) * 100), 0, 100) : null;
      }
      return { stage, observedReachedCount, conversionFromPreviousPercent };
    });

    // Transition timing — only exact CONSECUTIVE stored events for the
    // SAME application (adjacent entries in its own real history), never
    // an inferred/current-status-derived timestamp. One sample per
    // application per transition (first observed occurrence).
    const transitionTiming = TRANSITIONS.map(([fromStage, toStage]) => {
      const durationsHours: number[] = [];
      for (const history of stageHistoryByApplication.values()) {
        for (let i = 0; i < history.length - 1; i++) {
          if (history[i].status === fromStage && history[i + 1].status === toStage) {
            const durationHours = (history[i + 1].enteredAt.getTime() - history[i].enteredAt.getTime()) / (1000 * 60 * 60);
            if (durationHours >= 0) durationsHours.push(durationHours);
            break;
          }
        }
      }
      return {
        transition: `${fromStage}_to_${toStage}`,
        observedSampleCount: durationsHours.length,
        averageHours: durationsHours.length > 0 ? round2(durationsHours.reduce((sum, v) => sum + v, 0) / durationsHours.length) : undefined,
        medianHours: durationsHours.length > 0 ? round2(median(durationsHours)) : undefined,
      };
    });

    const offerCount = currentCounts.get(EmployerJobApplicationStatus.OFFER) ?? 0;
    const hiredCount = currentCounts.get(EmployerJobApplicationStatus.HIRED) ?? 0;
    const rejectedCount = currentCounts.get(EmployerJobApplicationStatus.REJECTED) ?? 0;
    const withdrawnCount = currentCounts.get(EmployerJobApplicationStatus.WITHDRAWN) ?? 0;
    const openPipelineCount =
      (currentCounts.get(EmployerJobApplicationStatus.APPLIED) ?? 0) +
      (currentCounts.get(EmployerJobApplicationStatus.SCREENING) ?? 0) +
      (currentCounts.get(EmployerJobApplicationStatus.SHORTLISTED) ?? 0) +
      (currentCounts.get(EmployerJobApplicationStatus.INTERVIEW) ?? 0) +
      offerCount;

    return {
      job: {
        id: job._id.toString(),
        title: job.title,
        jobCode: job.jobCode,
        status: job.status,
      },
      currentPipeline: {
        totalActiveApplications: totalApplications,
        stages: CURRENT_PIPELINE_STAGES.map((status) => ({ status, count: currentCounts.get(status) ?? 0 })),
      },
      observedFunnel,
      outcomes: { offerCount, hiredCount, rejectedCount, withdrawnCount, openPipelineCount },
      transitionTiming,
      dataCoverage: { trackedApplications, totalApplications, trackingCoveragePercent, historicalTrackingComplete },
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

export const employerHiringPipelineAnalyticsService = new EmployerHiringPipelineAnalyticsService();
export default employerHiringPipelineAnalyticsService;
