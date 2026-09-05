import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJobApplication from '../models/EmployerJobApplication.model';
import { EmployerJobApplicationStatus } from '../constants/employerJobApplication';
import EmployerCandidateCommunication, {
  IEmployerCandidateCommunication,
  EmployerCandidateCommunicationDirection,
  EmployerCandidateCommunicationChannel,
  EmployerCandidateCommunicationType,
  EMPLOYER_CANDIDATE_COMMUNICATION_DIRECTIONS,
  EMPLOYER_CANDIDATE_COMMUNICATION_CHANNELS,
  EMPLOYER_CANDIDATE_COMMUNICATION_TYPES,
} from '../models/EmployerCandidateCommunication.model';
import OrganizationMember from '../models/OrganizationMember.model';
import { User } from '../models/user.model';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const MAX_SUBJECT_LENGTH = 300;
const MAX_SUMMARY_LENGTH = 3000;
const FUTURE_CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

export interface CommunicationFilters {
  direction?: EmployerCandidateCommunicationDirection;
  channel?: EmployerCandidateCommunicationChannel;
  communicationType?: EmployerCandidateCommunicationType;
}

/**
 * An auditable LOG of candidate communication that happened outside or
 * around the platform (24D) — creating a row here NEVER sends an actual
 * message, never changes pipeline status, never creates a 23E decision
 * row, never notifies the candidate, and is never used as assessment
 * evidence. Distinct from 24A internal notes, 24B collaborators/mentions,
 * and 24C in-app notifications — none of those concepts are merged here.
 */
export class EmployerCandidateCommunicationService {
  /** POST .../applications/:applicationId/communications — requires INTERVIEWS_MANAGE. `recordedByMembershipId` is always the ACTING organization context's own membership — never accepted from the request body. */
  async createCommunication(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    actingMembershipId: string,
    applicationId: string,
    fields: {
      direction?: unknown;
      channel?: unknown;
      communicationType?: unknown;
      subject?: unknown;
      summary?: unknown;
      occurredAt?: unknown;
    }
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);

    if (typeof fields.direction !== 'string' || !EMPLOYER_CANDIDATE_COMMUNICATION_DIRECTIONS.includes(fields.direction as EmployerCandidateCommunicationDirection)) {
      throw new ApiError(400, 'A valid direction is required');
    }
    if (typeof fields.channel !== 'string' || !EMPLOYER_CANDIDATE_COMMUNICATION_CHANNELS.includes(fields.channel as EmployerCandidateCommunicationChannel)) {
      throw new ApiError(400, 'A valid channel is required');
    }
    if (
      typeof fields.communicationType !== 'string' ||
      !EMPLOYER_CANDIDATE_COMMUNICATION_TYPES.includes(fields.communicationType as EmployerCandidateCommunicationType)
    ) {
      throw new ApiError(400, 'A valid communicationType is required');
    }
    if (typeof fields.summary !== 'string' || fields.summary.trim().length === 0) {
      throw new ApiError(400, 'summary is required');
    }
    if (fields.subject !== undefined && typeof fields.subject !== 'string') {
      throw new ApiError(400, 'subject must be a string');
    }

    const trimmedSummary = fields.summary.trim().slice(0, MAX_SUMMARY_LENGTH);
    const trimmedSubject = typeof fields.subject === 'string' ? fields.subject.trim().slice(0, MAX_SUBJECT_LENGTH) : undefined;

    let occurredAt: Date;
    if (fields.occurredAt !== undefined) {
      const parsed = new Date(fields.occurredAt as string);
      if (Number.isNaN(parsed.getTime())) {
        throw new ApiError(400, 'occurredAt must be a valid timestamp');
      }
      if (parsed.getTime() - Date.now() > FUTURE_CLOCK_SKEW_TOLERANCE_MS) {
        throw new ApiError(400, 'occurredAt cannot be in the future');
      }
      occurredAt = parsed;
    } else {
      occurredAt = new Date();
    }

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id });
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }
    this.assertApplicationMutable(application.status);

    const communication = await EmployerCandidateCommunication.create({
      organizationId: organization._id,
      applicationId: application._id,
      jobId: application.jobId,
      candidateId: application.candidateId,
      direction: fields.direction as EmployerCandidateCommunicationDirection,
      channel: fields.channel as EmployerCandidateCommunicationChannel,
      communicationType: fields.communicationType as EmployerCandidateCommunicationType,
      subject: trimmedSubject || undefined,
      summary: trimmedSummary,
      occurredAt,
      recordedByMembershipId: new Types.ObjectId(actingMembershipId),
    });

    const displayNames = await this.resolveDisplayNames(organization._id, [actingMembershipId]);
    return this.toDetail(communication, displayNames);
  }

  /** GET .../applications/:applicationId/communications — requires ORGANIZATION_VIEW. Read-only; an archived application/organization remains readable. */
  async getCommunications(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    applicationId: string,
    filters: CommunicationFilters
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id }).select('_id');
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }

    const filter: Record<string, unknown> = { organizationId: organization._id, applicationId: application._id };
    if (filters.direction) filter.direction = filters.direction;
    if (filters.channel) filter.channel = filters.channel;
    if (filters.communicationType) filter.communicationType = filters.communicationType;

    const communications = await EmployerCandidateCommunication.find(filter).sort({ occurredAt: -1 });

    const displayNames = await this.resolveDisplayNames(
      organization._id,
      communications.map((c) => c.recordedByMembershipId.toString())
    );

    return { communications: communications.map((c) => this.toDetail(c, displayNames)) };
  }

  /** Best-effort display-name resolution — a lookup failure (member/user no longer exists) never blocks reads; that row simply carries no `displayName`. Never exposes email/contact. */
  private async resolveDisplayNames(organizationId: Types.ObjectId, membershipIds: string[]): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(membershipIds)];
    if (uniqueIds.length === 0) {
      return new Map();
    }

    const members = await OrganizationMember.find({ _id: { $in: uniqueIds.map((id) => new Types.ObjectId(id)) }, organizationId })
      .select('_id userId')
      .lean();
    if (members.length === 0) {
      return new Map();
    }

    const userIds = [...new Set(members.map((m) => m.userId.toString()))].map((id) => new Types.ObjectId(id));
    const users = await User.find({ _id: { $in: userIds } }).select('_id name').lean();
    const nameByUserId = new Map(users.map((u) => [u._id.toString(), u.name]));

    const nameByMembershipId = new Map<string, string>();
    for (const member of members) {
      const name = nameByUserId.get(member.userId.toString());
      if (name) {
        nameByMembershipId.set(member._id.toString(), name);
      }
    }
    return nameByMembershipId;
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

  /** Mirrors EmployerJobApplicationService's own guard exactly — an archived application is read-only. */
  private assertApplicationMutable(status: EmployerJobApplicationStatus): void {
    if (status === EmployerJobApplicationStatus.ARCHIVED) {
      throw new ApiError(400, 'This application is archived and read-only');
    }
  }

  private toDetail(communication: IEmployerCandidateCommunication, displayNames: Map<string, string>): Record<string, unknown> {
    const membershipId = communication.recordedByMembershipId.toString();
    return {
      id: communication._id.toString(),
      direction: communication.direction,
      channel: communication.channel,
      communicationType: communication.communicationType,
      subject: communication.subject,
      summary: communication.summary,
      occurredAt: communication.occurredAt,
      createdAt: communication.createdAt,
      recordedBy: {
        membershipId,
        displayName: displayNames.get(membershipId),
      },
    };
  }
}

export const employerCandidateCommunicationService = new EmployerCandidateCommunicationService();
export default employerCandidateCommunicationService;
