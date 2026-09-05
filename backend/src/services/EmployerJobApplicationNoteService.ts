import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJob from '../models/EmployerJob.model';
import EmployerJobApplication from '../models/EmployerJobApplication.model';
import { EmployerJobApplicationStatus } from '../constants/employerJobApplication';
import EmployerCandidate from '../models/EmployerCandidate.model';
import EmployerJobApplicationNote, { IEmployerJobApplicationNote } from '../models/EmployerJobApplicationNote.model';
import { employerCollaborationNotificationService } from './EmployerCollaborationNotificationService';
import OrganizationMember from '../models/OrganizationMember.model';
import { User } from '../models/user.model';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole, OrganizationMemberStatus } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const MAX_BODY_LENGTH = 3000;
const MAX_MENTIONS = 10;

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
    body: unknown,
    mentionMembershipIds: unknown
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

    const validatedMentionIds = await this.validateMentions(organization._id, mentionMembershipIds);

    const note = await EmployerJobApplicationNote.create({
      organizationId: organization._id,
      applicationId: application._id,
      jobId: application.jobId,
      candidateId: application.candidateId,
      body: trimmedBody,
      mentionMembershipIds: validatedMentionIds,
      createdByMembershipId: new Types.ObjectId(actingMembershipId),
    });

    // Notification write is secondary — never fails/undoes the already-created note.
    try {
      await employerCollaborationNotificationService.createNoteMentionNotifications({
        organizationId: organization._id,
        applicationId: application._id as Types.ObjectId,
        jobId: application.jobId,
        candidateId: application.candidateId,
        noteId: note._id as Types.ObjectId,
        authorMembershipId: new Types.ObjectId(actingMembershipId),
        mentionMembershipIds: validatedMentionIds,
      });
    } catch (error) {
      console.error('[EmployerJobApplicationNoteService] Failed to create mention notifications (non-fatal)', error);
    }

    const displayNames = await this.resolveDisplayNames(organization._id, [
      actingMembershipId,
      ...validatedMentionIds.map((id) => id.toString()),
    ]);
    return this.toDetail(note, displayNames);
  }

  /**
   * Explicit, UI-selected mentions only — never parsed from free-form
   * @text. Deduped, capped at 10, and every id must be an ACTIVE
   * OrganizationMember in this SAME organization — never trusted as-is,
   * never an external/user id. Unknown/invalid ids are silently dropped
   * rather than rejecting the whole note (the note body itself is always
   * the authoritative content).
   */
  private async validateMentions(organizationId: Types.ObjectId, mentionMembershipIds: unknown): Promise<Types.ObjectId[]> {
    if (!Array.isArray(mentionMembershipIds) || mentionMembershipIds.length === 0) {
      return [];
    }

    const uniqueRawIds = [...new Set(mentionMembershipIds.filter((id): id is string => typeof id === 'string'))].slice(0, MAX_MENTIONS);
    if (uniqueRawIds.length === 0) {
      return [];
    }

    const validObjectIds = uniqueRawIds.filter((id) => Types.ObjectId.isValid(id));
    if (validObjectIds.length === 0) {
      return [];
    }

    const activeMembers = await OrganizationMember.find({
      _id: { $in: validObjectIds.map((id) => new Types.ObjectId(id)) },
      organizationId,
      status: OrganizationMemberStatus.ACTIVE,
    })
      .select('_id')
      .lean();

    return activeMembers.map((m) => m._id as Types.ObjectId);
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

    const allMembershipIds = notes.flatMap((n) => [
      n.createdByMembershipId.toString(),
      ...n.mentionMembershipIds.map((id) => id.toString()),
    ]);
    const displayNames = await this.resolveDisplayNames(organization._id, allMembershipIds);

    return { notes: notes.map((n) => this.toDetail(n, displayNames)) };
  }

  /**
   * GET /organizations/:organizationId/collaboration/mentions — requires
   * ORGANIZATION_VIEW. Notes where the ACTING membership appears in
   * `mentionMembershipIds`, newest-first, paginated. Safe context only —
   * never resume/contact/assessment internals.
   */
  async getMentionsForMember(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    actingMembershipId: string,
    page: number,
    limit: number
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const filter = { organizationId: organization._id, mentionMembershipIds: new Types.ObjectId(actingMembershipId) };
    const skip = (page - 1) * limit;
    const [notes, total] = await Promise.all([
      EmployerJobApplicationNote.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      EmployerJobApplicationNote.countDocuments(filter),
    ]);

    if (notes.length === 0) {
      return { mentions: [], pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
    }

    const candidateIds = [...new Set(notes.map((n) => n.candidateId.toString()))].map((id) => new Types.ObjectId(id));
    const jobIds = [...new Set(notes.map((n) => n.jobId.toString()))].map((id) => new Types.ObjectId(id));
    const [candidates, jobs] = await Promise.all([
      EmployerCandidate.find({ organizationId: organization._id, _id: { $in: candidateIds } }).select('firstName lastName').lean(),
      EmployerJob.find({ organizationId: organization._id, _id: { $in: jobIds } }).select('title').lean(),
    ]);
    const candidateById = new Map(candidates.map((c) => [c._id.toString(), c]));
    const jobById = new Map(jobs.map((j) => [j._id.toString(), j]));

    const displayNames = await this.resolveDisplayNames(
      organization._id,
      notes.map((n) => n.createdByMembershipId.toString())
    );

    return {
      mentions: notes.map((n) => {
        const candidate = candidateById.get(n.candidateId.toString());
        const authorMembershipId = n.createdByMembershipId.toString();
        return {
          noteId: n._id.toString(),
          body: n.body,
          applicationId: n.applicationId.toString(),
          jobId: n.jobId.toString(),
          jobTitle: jobById.get(n.jobId.toString())?.title,
          candidate: candidate ? { firstName: candidate.firstName, lastName: candidate.lastName } : undefined,
          author: { membershipId: authorMembershipId, displayName: displayNames.get(authorMembershipId) },
          createdAt: n.createdAt,
        };
      }),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
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
      mentions: note.mentionMembershipIds.map((id) => {
        const mentionId = id.toString();
        return { membershipId: mentionId, displayName: displayNames.get(mentionId) };
      }),
    };
  }
}

export const employerJobApplicationNoteService = new EmployerJobApplicationNoteService();
export default employerJobApplicationNoteService;
