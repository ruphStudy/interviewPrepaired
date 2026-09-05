import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJobApplication from '../models/EmployerJobApplication.model';
import { EmployerJobApplicationStatus } from '../constants/employerJobApplication';
import EmployerJobApplicationNote, { IEmployerJobApplicationNote } from '../models/EmployerJobApplicationNote.model';
import OrganizationMember from '../models/OrganizationMember.model';
import { User } from '../models/user.model';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const MAX_BODY_LENGTH = 3000;

/**
 * Internal employer collaboration notes (24A) — discussion/context only.
 * Immutable after creation; no edit/delete endpoint. Never affects scores,
 * recommendations, pipeline status, or any candidate-visible data —
 * distinct from 23E's structured decision/reason audit log.
 */
export class EmployerJobApplicationNoteService {
  /** POST .../applications/:applicationId/notes — requires INTERVIEWS_MANAGE. `createdByMembershipId` is always the ACTING organization context's own membership — never accepted from the request body. */
  async createNote(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    actingMembershipId: string,
    applicationId: string,
    body: unknown
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);

    if (typeof body !== 'string' || body.trim().length === 0) {
      throw new ApiError(400, 'body is required');
    }
    const trimmedBody = body.trim().slice(0, MAX_BODY_LENGTH);

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id });
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }
    this.assertApplicationMutable(application.status);

    const note = await EmployerJobApplicationNote.create({
      organizationId: organization._id,
      applicationId: application._id,
      jobId: application.jobId,
      candidateId: application.candidateId,
      body: trimmedBody,
      createdByMembershipId: new Types.ObjectId(actingMembershipId),
    });

    const displayNames = await this.resolveDisplayNames(organization._id, [actingMembershipId]);
    return this.toDetail(note, displayNames);
  }

  /** GET .../applications/:applicationId/notes — requires ORGANIZATION_VIEW. Read-only; an archived application/organization remains readable. */
  async getNotes(organizationId: string, actingRole: OrganizationMemberRole, applicationId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id }).select('_id');
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }

    const notes = await EmployerJobApplicationNote.find({
      organizationId: organization._id,
      applicationId: application._id,
    }).sort({ createdAt: -1 });

    const displayNames = await this.resolveDisplayNames(
      organization._id,
      notes.map((n) => n.createdByMembershipId.toString())
    );

    return { notes: notes.map((n) => this.toDetail(n, displayNames)) };
  }

  /** Best-effort display-name resolution — a lookup failure (member/user no longer exists) never blocks note reads; that note simply carries no `displayName`. Never exposes email/contact. */
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

  private toDetail(note: IEmployerJobApplicationNote, displayNames: Map<string, string>): Record<string, unknown> {
    const membershipId = note.createdByMembershipId.toString();
    return {
      id: note._id.toString(),
      body: note.body,
      createdAt: note.createdAt,
      author: {
        membershipId,
        displayName: displayNames.get(membershipId),
      },
    };
  }
}

export const employerJobApplicationNoteService = new EmployerJobApplicationNoteService();
export default employerJobApplicationNoteService;
