import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJob from '../models/EmployerJob.model';
import EmployerJobApplication from '../models/EmployerJobApplication.model';
import { EmployerJobApplicationStatus } from '../constants/employerJobApplication';
import EmployerJobApplicationNote from '../models/EmployerJobApplicationNote.model';
import EmployerJobApplicationCollaborator from '../models/EmployerJobApplicationCollaborator.model';
import { EmployerJobApplicationCollaborationRole } from '../constants/employerJobApplicationCollaboration';
import EmployerCollaborationNotification, {
  EmployerCollaborationNotificationType,
} from '../models/EmployerCollaborationNotification.model';
import EmployerCandidateCommunication, {
  EmployerCandidateCommunicationChannel,
  EmployerCandidateCommunicationType,
} from '../models/EmployerCandidateCommunication.model';
import EmployerJobApplicationDecision from '../models/EmployerJobApplicationDecision.model';
import { OrganizationType } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const TREND_DAYS = 30;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Deterministic (no AI), live, job-level analytics over 24A-24D employer
 * collaboration/communication activity (24E) — never persisted. Purely
 * activity-frequency aggregates: no recruiter ranking/scoring, no hiring
 * recommendation, no bias score. Never includes note bodies, communication
 * summaries, candidate contact details, notification payloads, or
 * assessment/resume/JD text — counts and safe metadata only.
 */
export class EmployerCollaborationAnalyticsService {
  async getJobAnalytics(organizationId: string, actingRole: OrganizationMemberRole, jobId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ANALYTICS_VIEW);

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
      .select('_id')
      .lean();
    const applicationIds = applications.map((a) => a._id);
    const totalApplications = applications.length;

    const [notes, collaborators, notifications, communications, decisions] = await Promise.all([
      EmployerJobApplicationNote.find({ organizationId: organization._id, applicationId: { $in: applicationIds } })
        .select('applicationId mentionMembershipIds createdAt')
        .lean(),
      EmployerJobApplicationCollaborator.find({ organizationId: organization._id, applicationId: { $in: applicationIds } })
        .select('applicationId membershipId collaborationRole')
        .lean(),
      EmployerCollaborationNotification.find({ organizationId: organization._id, jobId: job._id }).select('type readAt').lean(),
      EmployerCandidateCommunication.find({ organizationId: organization._id, applicationId: { $in: applicationIds } })
        .select('applicationId direction channel communicationType occurredAt createdAt')
        .lean(),
      EmployerJobApplicationDecision.find({ organizationId: organization._id, applicationId: { $in: applicationIds } })
        .select('applicationId decisionType createdAt')
        .lean(),
    ]);

    const coverage = {
      totalApplications,
      applicationsWithCollaborators: new Set(collaborators.map((c) => c.applicationId.toString())).size,
      applicationsWithInternalNotes: new Set(notes.map((n) => n.applicationId.toString())).size,
      applicationsWithCommunications: new Set(communications.map((c) => c.applicationId.toString())).size,
      applicationsWithDecisions: new Set(decisions.map((d) => d.applicationId.toString())).size,
    };

    const collaborationRoleCounts: Record<EmployerJobApplicationCollaborationRole, number> = {
      [EmployerJobApplicationCollaborationRole.OWNER]: 0,
      [EmployerJobApplicationCollaborationRole.INTERVIEWER]: 0,
      [EmployerJobApplicationCollaborationRole.REVIEWER]: 0,
      [EmployerJobApplicationCollaborationRole.OBSERVER]: 0,
    };
    for (const c of collaborators) {
      collaborationRoleCounts[c.collaborationRole] = (collaborationRoleCounts[c.collaborationRole] ?? 0) + 1;
    }

    const collaboration = {
      totalInternalNotes: notes.length,
      totalMentions: notes.reduce((sum, n) => sum + (n.mentionMembershipIds?.length ?? 0), 0),
      totalCollaboratorAssignments: collaborators.length,
      uniqueCollaborators: new Set(collaborators.map((c) => c.membershipId.toString())).size,
      collaborationRoleCounts,
    };

    const notificationTypeCounts: Record<EmployerCollaborationNotificationType, number> = {
      note_mention: 0,
      collaborator_assigned: 0,
    };
    for (const n of notifications) {
      notificationTypeCounts[n.type] = (notificationTypeCounts[n.type] ?? 0) + 1;
    }
    const notificationMetrics = {
      totalNotifications: notifications.length,
      unreadNotifications: notifications.filter((n) => !n.readAt).length,
      notificationTypeCounts,
    };

    const channelCounts: Record<EmployerCandidateCommunicationChannel, number> = {
      email: 0,
      phone: 0,
      sms: 0,
      whatsapp: 0,
      video_call: 0,
      in_person: 0,
      other: 0,
    };
    const typeCounts: Record<EmployerCandidateCommunicationType, number> = {
      outreach: 0,
      interview_scheduling: 0,
      interview_update: 0,
      follow_up: 0,
      offer_discussion: 0,
      rejection_notice: 0,
      candidate_question: 0,
      general: 0,
      other: 0,
    };
    for (const c of communications) {
      channelCounts[c.channel] = (channelCounts[c.channel] ?? 0) + 1;
      typeCounts[c.communicationType] = (typeCounts[c.communicationType] ?? 0) + 1;
    }

    const { observedResponseSamples, averageResponseHours, medianResponseHours } = this.computeObservedResponseTime(communications);

    const communication = {
      totalCommunications: communications.length,
      outboundCount: communications.filter((c) => c.direction === 'outbound').length,
      inboundCount: communications.filter((c) => c.direction === 'inbound').length,
      channelCounts,
      typeCounts,
      observedResponseSamples,
      averageResponseHours,
      medianResponseHours,
    };

    const decisionTypeCounts: Record<string, number> = {
      continue_process: 0,
      hold: 0,
      advance_to_offer: 0,
      hired: 0,
      rejected: 0,
      withdrawn: 0,
      other: 0,
    };
    for (const d of decisions) {
      decisionTypeCounts[d.decisionType] = (decisionTypeCounts[d.decisionType] ?? 0) + 1;
    }
    const decisionActivity = { totalDecisionLogs: decisions.length, decisionTypeCounts };

    const activityTrend = this.buildActivityTrend(notes, communications, decisions);

    return {
      job: { id: job._id.toString(), title: job.title, jobCode: job.jobCode, status: job.status },
      coverage,
      collaboration,
      notifications: notificationMetrics,
      communication,
      decisionActivity,
      activityTrend,
    };
  }

  /**
   * "Observed response time" only — never claimed as an SLA or recruiter
   * performance metric. Only counts an inbound communication IMMEDIATELY
   * followed (in that application's own chronological communication
   * history) by an outbound one; never infers a reply across an
   * unrelated gap.
   */
  private computeObservedResponseTime(
    communications: Array<{ applicationId: Types.ObjectId; direction: string; occurredAt: Date }>
  ): { observedResponseSamples: number; averageResponseHours?: number; medianResponseHours?: number } {
    const byApplication = new Map<string, Array<{ direction: string; occurredAt: Date }>>();
    for (const c of communications) {
      const key = c.applicationId.toString();
      if (!byApplication.has(key)) byApplication.set(key, []);
      byApplication.get(key)!.push({ direction: c.direction, occurredAt: c.occurredAt });
    }

    const responseHours: number[] = [];
    for (const list of byApplication.values()) {
      const sorted = [...list].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
      for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i].direction === 'inbound' && sorted[i + 1].direction === 'outbound') {
          const hours = (sorted[i + 1].occurredAt.getTime() - sorted[i].occurredAt.getTime()) / (1000 * 60 * 60);
          if (hours >= 0) responseHours.push(hours);
        }
      }
    }

    return {
      observedResponseSamples: responseHours.length,
      averageResponseHours: responseHours.length > 0 ? round2(responseHours.reduce((sum, v) => sum + v, 0) / responseHours.length) : undefined,
      medianResponseHours: responseHours.length > 0 ? round2(median(responseHours)) : undefined,
    };
  }

  /** Exactly TREND_DAYS UTC daily buckets (including zero-count days), keyed by each row's own `createdAt` for a consistent "when was this logged" activity trend. */
  private buildActivityTrend(
    notes: Array<{ createdAt: Date }>,
    communications: Array<{ createdAt: Date }>,
    decisions: Array<{ createdAt: Date }>
  ): Array<{ date: string; notes: number; communications: number; decisions: number }> {
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const buckets = new Map<string, { notes: number; communications: number; decisions: number }>();
    for (let i = TREND_DAYS - 1; i >= 0; i--) {
      const d = new Date(todayUTC);
      d.setUTCDate(d.getUTCDate() - i);
      buckets.set(d.toISOString().slice(0, 10), { notes: 0, communications: 0, decisions: 0 });
    }

    const bump = (date: Date, field: 'notes' | 'communications' | 'decisions') => {
      const key = date.toISOString().slice(0, 10);
      const bucket = buckets.get(key);
      if (bucket) bucket[field] += 1;
    };

    for (const n of notes) bump(n.createdAt, 'notes');
    for (const c of communications) bump(c.createdAt, 'communications');
    for (const d of decisions) bump(d.createdAt, 'decisions');

    return [...buckets.entries()].map(([date, counts]) => ({ date, ...counts }));
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

export const employerCollaborationAnalyticsService = new EmployerCollaborationAnalyticsService();
export default employerCollaborationAnalyticsService;
