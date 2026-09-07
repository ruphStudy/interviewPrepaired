import Organization, { IOrganization } from '../models/Organization.model';
import Interview, { IInterview } from '../models/interview.model';
import { InterviewPurpose } from '../constants/interview';
import EmployerJob from '../models/EmployerJob.model';
import EmployerInterviewCalendarEvent, { IEmployerInterviewCalendarEvent } from '../models/EmployerInterviewCalendarEvent.model';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const CALENDAR_VERSION = 'interview-calendar-v1';
const MIN_DURATION_MINUTES = 5;
const MAX_DURATION_MINUTES = 8 * 60;

export interface ScheduleCalendarEventInput {
  startsAt: string;
  endsAt: string;
  timezone: string;
}

/**
 * A local calendar record for ONE hiring interview (31E) — useful on its
 * own regardless of any external provider OAuth state. Never stores
 * candidate answers/evaluation/hidden assessment data; `title` is always
 * server-generated from safe job metadata only.
 */
export class EmployerInterviewCalendarEventService {
  /** POST .../interviews/:interviewId/calendar-event — requires INTERVIEWS_MANAGE. Idempotent upsert (schedule or reschedule the SAME local record). */
  async scheduleEvent(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    interviewId: string,
    input: ScheduleCalendarEventInput
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);
    const interview = await this.loadInterview(organization, interviewId);

    if (!interview.employerApplicationId || !interview.employerJobId) {
      throw new ApiError(409, 'This interview is not linked to a hiring application/job.');
    }

    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new ApiError(400, 'startsAt and endsAt must be valid dates');
    }
    if (endsAt <= startsAt) {
      throw new ApiError(400, 'endsAt must be after startsAt');
    }
    const durationMinutes = (endsAt.getTime() - startsAt.getTime()) / 60_000;
    if (durationMinutes < MIN_DURATION_MINUTES || durationMinutes > MAX_DURATION_MINUTES) {
      throw new ApiError(400, `Duration must be between ${MIN_DURATION_MINUTES} and ${MAX_DURATION_MINUTES} minutes`);
    }
    const timezone = typeof input.timezone === 'string' ? input.timezone.trim().slice(0, 100) : '';
    if (!timezone) {
      throw new ApiError(400, 'timezone is required');
    }

    const job = await EmployerJob.findOne({ _id: interview.employerJobId, organizationId: organization._id }).select('title');
    const title = `Interview — ${job?.title ?? 'Hiring Assessment'}`.slice(0, 300);

    const doc = await EmployerInterviewCalendarEvent.findOneAndUpdate(
      { organizationId: organization._id, interviewId: interview._id, connectionId: { $exists: false } },
      {
        $set: {
          applicationId: interview.employerApplicationId,
          jobId: interview.employerJobId,
          provider: 'local',
          startsAt,
          endsAt,
          timezone,
          title,
          status: 'scheduled',
          calendarVersion: CALENDAR_VERSION,
        },
        $unset: { errorMessage: 1 },
      },
      { upsert: true, new: true }
    );

    return this.toDetail(doc!);
  }

  /** GET .../interviews/:interviewId/calendar-event — requires ORGANIZATION_VIEW. */
  async getEvent(organizationId: string, actingRole: OrganizationMemberRole, interviewId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    const interview = await this.loadInterview(organization, interviewId);

    const doc = await EmployerInterviewCalendarEvent.findOne({
      organizationId: organization._id,
      interviewId: interview._id,
      connectionId: { $exists: false },
    });
    if (!doc) {
      return { scheduled: false };
    }
    return this.toDetail(doc);
  }

  /** POST .../interviews/:interviewId/calendar-event/cancel — requires INTERVIEWS_MANAGE. */
  async cancelEvent(organizationId: string, actingRole: OrganizationMemberRole, interviewId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);
    const interview = await this.loadInterview(organization, interviewId);

    const doc = await EmployerInterviewCalendarEvent.findOne({
      organizationId: organization._id,
      interviewId: interview._id,
      connectionId: { $exists: false },
    });
    if (!doc) {
      throw new ApiError(404, 'No calendar event is scheduled for this interview.');
    }
    doc.status = 'cancelled';
    await doc.save();
    return this.toDetail(doc);
  }

  /** GET .../interviews/:interviewId/calendar-event/ics — requires ORGANIZATION_VIEW. Standards-compatible `.ics` text, no package. Never includes evaluation/answers/hidden data. */
  async getIcs(organizationId: string, actingRole: OrganizationMemberRole, interviewId: string): Promise<string> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    const interview = await this.loadInterview(organization, interviewId);

    const doc = await EmployerInterviewCalendarEvent.findOne({
      organizationId: organization._id,
      interviewId: interview._id,
      connectionId: { $exists: false },
      status: { $ne: 'cancelled' },
    });
    if (!doc) {
      throw new ApiError(404, 'No calendar event is scheduled for this interview.');
    }
    return this.buildIcs(doc);
  }

  private buildIcs(event: IEmployerInterviewCalendarEvent): string {
    const toIcsUtc = (date: Date) => date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const escapeIcsText = (text: string) => text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//EnterSkill//Interview Scheduling//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${event._id.toString()}@enterskill`,
      `DTSTAMP:${toIcsUtc(new Date())}`,
      `DTSTART:${toIcsUtc(event.startsAt)}`,
      `DTEND:${toIcsUtc(event.endsAt)}`,
      `SUMMARY:${escapeIcsText(event.title)}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ];
    return lines.join('\r\n');
  }

  private async loadInterview(organization: IOrganization, interviewId: string): Promise<IInterview> {
    const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id });
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }
    return interview;
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

  private toDetail(doc: IEmployerInterviewCalendarEvent): Record<string, unknown> {
    return {
      scheduled: true,
      startsAt: doc.startsAt,
      endsAt: doc.endsAt,
      timezone: doc.timezone,
      title: doc.title,
      status: doc.status,
      provider: doc.provider,
      lastSyncedAt: doc.lastSyncedAt,
      errorMessage: doc.errorMessage,
    };
  }
}

export const employerInterviewCalendarEventService = new EmployerInterviewCalendarEventService();
export default employerInterviewCalendarEventService;
