import crypto from 'crypto';
import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJob from '../models/EmployerJob.model';
import { EmployerJobStatus } from '../constants/employerJob';
import EmployerCandidate from '../models/EmployerCandidate.model';
import { EmployerCandidateStatus } from '../constants/employerCandidate';
import EmployerJobApplication from '../models/EmployerJobApplication.model';
import { EmployerJobApplicationStatus } from '../constants/employerJobApplication';
import { employerInterviewBlueprintService } from './EmployerInterviewBlueprintService';
import { EmployerInterviewBlueprintStatus } from '../constants/employerInterviewBlueprint';
import { employerInterviewCompetencyRubricService } from './EmployerInterviewCompetencyRubricService';
import EmployerInterviewInvitation from '../models/EmployerInterviewInvitation.model';
import {
  EmployerInterviewInvitationStatus,
  MIN_EXPIRY_DAYS,
  MAX_EXPIRY_DAYS,
  DEFAULT_EXPIRY_DAYS,
  MAX_INVITATION_MESSAGE_LENGTH,
} from '../constants/employerInterviewInvitation';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

interface CreateInvitationFields {
  expiresInDays?: number;
  message?: string;
}

interface JobRef {
  _id: Types.ObjectId;
  status: EmployerJobStatus;
}
interface CandidateRef {
  _id: Types.ObjectId;
  status: EmployerCandidateStatus;
}

/**
 * Secure employer interview invitation (20C) — creates and manages a
 * hashed-token invitation for a shortlisted application with a completed
 * 20A blueprint + 20B rubric. Reuses the EXISTING 20A/20B "current
 * applicable" resolution methods rather than re-deriving that logic a
 * third/fourth time. No email is sent, no interview session/answer
 * capture happens here, and there is no public token-consumption endpoint
 * yet (20D). The raw token is generated with `crypto.randomBytes(32)` and
 * hashed with SHA-256 before persistence — mirroring the existing
 * `OrganizationInvitationService` convention exactly, except base64url-
 * encoded (rather than hex) since this token is designed to be embedded
 * directly in a URL path segment.
 */
export class EmployerInterviewInvitationService {
  /** GET .../interview-invitation — the invitation for the CURRENT applicable blueprint, or null if none exists for it. Read-only, so an archived organization/application remains readable. */
  async getCurrentInvitation(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    applicationId: string
  ): Promise<Record<string, unknown> | null> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id }).select('_id');
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }

    const blueprintDetail = await employerInterviewBlueprintService.getCurrentBlueprint(organizationId, actingRole, applicationId);
    if (!blueprintDetail || blueprintDetail.status !== EmployerInterviewBlueprintStatus.COMPLETED) {
      return null;
    }

    const invitation = await EmployerInterviewInvitation.findOne({
      organizationId: organization._id,
      applicationId: application._id,
      blueprintId: new Types.ObjectId(blueprintDetail.id as string),
    });
    if (!invitation) {
      return null;
    }

    await this.lazilyExpire(invitation);
    return this.toDetail(invitation.toObject());
  }

  /**
   * POST .../interview-invitation — creates a brand-new ACTIVE invitation
   * for the CURRENT applicable blueprint. If an invitation already exists
   * for that exact {applicationId, blueprintId}: active/accepted are
   * rejected outright; expired/revoked direct the caller to the dedicated
   * regenerate endpoint rather than silently issuing a new token here.
   * `invitedEmail`/`invitedName` are ALWAYS derived from the candidate's
   * own record — never accepted from the request body.
   */
  async createInvitation(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    actorMembershipId: string,
    applicationId: string,
    fields: CreateInvitationFields
  ): Promise<{ invitation: Record<string, unknown>; token: string }> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id });
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }
    if (application.status !== EmployerJobApplicationStatus.SHORTLISTED) {
      throw new ApiError(409, 'Shortlist this candidate before creating an interview invitation');
    }
    await this.assertReferencedEntitiesMutable(organization._id, application.jobId, application.candidateId);

    const blueprintDetail = await employerInterviewBlueprintService.getCurrentBlueprint(organizationId, actingRole, applicationId);
    if (!blueprintDetail || blueprintDetail.status !== EmployerInterviewBlueprintStatus.COMPLETED) {
      throw new ApiError(409, 'Generate a completed interview blueprint before creating an interview invitation');
    }
    const rubricDetail = await employerInterviewCompetencyRubricService.getCurrentRubric(organizationId, actingRole, applicationId);
    if (!rubricDetail) {
      throw new ApiError(409, 'Generate an evaluation rubric before creating an interview invitation');
    }

    const candidate = await EmployerCandidate.findOne({ _id: application.candidateId, organizationId: organization._id });
    if (!candidate) {
      throw new ApiError(404, 'Candidate not found');
    }

    const blueprintId = new Types.ObjectId(blueprintDetail.id as string);
    const rubricId = new Types.ObjectId(rubricDetail.id as string);

    const existing = await EmployerInterviewInvitation.findOne({ organizationId: organization._id, applicationId: application._id, blueprintId });
    if (existing) {
      await this.lazilyExpire(existing);
      this.assertCanCreateOverExisting(existing.status);
    }

    const expiresAt = this.computeExpiresAt(fields.expiresInDays);
    const { token, tokenHash } = this.generateToken();
    const invitedName = `${candidate.firstName} ${candidate.lastName}`.trim();

    try {
      const created = await EmployerInterviewInvitation.create({
        organizationId: organization._id,
        applicationId: application._id,
        jobId: application.jobId,
        candidateId: candidate._id,
        blueprintId,
        rubricId,
        status: EmployerInterviewInvitationStatus.ACTIVE,
        tokenHash,
        expiresAt,
        invitedEmail: candidate.email,
        invitedName: invitedName || undefined,
        message: this.cleanMessage(fields.message),
        createdByMembershipId: new Types.ObjectId(actorMembershipId),
      });
      return { invitation: this.toDetail(created.toObject()), token };
    } catch (error: any) {
      if (error?.code !== 11000) {
        throw error;
      }
      // Concurrent duplicate — inspect whatever the racer actually created.
      const winner = await EmployerInterviewInvitation.findOne({ organizationId: organization._id, applicationId: application._id, blueprintId });
      if (!winner) {
        throw new ApiError(409, 'An interview invitation is already being created — please try again shortly');
      }
      await this.lazilyExpire(winner);
      this.assertCanCreateOverExisting(winner.status);
      throw new ApiError(409, 'An interview invitation already exists for this application');
    }
  }

  /**
   * POST .../interview-invitation/regenerate — requires the existing
   * invitation for the CURRENT blueprint to be expired or revoked (never
   * active or accepted). Updates that SAME row in place with a brand-new
   * token/expiry (never creates a second row for the same
   * {applicationId, blueprintId} — the unique index wouldn't allow it
   * anyway) and returns the new raw token once.
   */
  async regenerateInvitation(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    applicationId: string
  ): Promise<{ invitation: Record<string, unknown>; token: string }> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id });
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }
    if (application.status !== EmployerJobApplicationStatus.SHORTLISTED) {
      throw new ApiError(409, 'Shortlist this candidate before regenerating an interview invitation');
    }
    await this.assertReferencedEntitiesMutable(organization._id, application.jobId, application.candidateId);

    const blueprintDetail = await employerInterviewBlueprintService.getCurrentBlueprint(organizationId, actingRole, applicationId);
    if (!blueprintDetail || blueprintDetail.status !== EmployerInterviewBlueprintStatus.COMPLETED) {
      throw new ApiError(409, 'A completed interview blueprint is required to regenerate an interview invitation');
    }
    const rubricDetail = await employerInterviewCompetencyRubricService.getCurrentRubric(organizationId, actingRole, applicationId);
    if (!rubricDetail) {
      throw new ApiError(409, 'An evaluation rubric is required to regenerate an interview invitation');
    }

    const blueprintId = new Types.ObjectId(blueprintDetail.id as string);
    const invitation = await EmployerInterviewInvitation.findOne({ organizationId: organization._id, applicationId: application._id, blueprintId });
    if (!invitation) {
      throw new ApiError(409, 'No interview invitation exists to regenerate — create one first');
    }

    await this.lazilyExpire(invitation);

    if (invitation.status === EmployerInterviewInvitationStatus.ACTIVE) {
      throw new ApiError(409, 'Invitation is already active');
    }
    if (invitation.status === EmployerInterviewInvitationStatus.ACCEPTED) {
      throw new ApiError(409, 'Cannot regenerate an accepted invitation');
    }

    const { token, tokenHash } = this.generateToken();
    invitation.tokenHash = tokenHash;
    invitation.expiresAt = this.computeExpiresAt(undefined);
    invitation.status = EmployerInterviewInvitationStatus.ACTIVE;
    invitation.acceptedAt = undefined;
    invitation.revokedAt = undefined;
    await invitation.save();

    return { invitation: this.toDetail(invitation.toObject()), token };
  }

  /** POST .../interview-invitation/revoke — allowed only from ACTIVE. No hard delete, ever. */
  async revokeInvitation(organizationId: string, actingRole: OrganizationMemberRole, applicationId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id });
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }
    await this.assertReferencedEntitiesMutable(organization._id, application.jobId, application.candidateId);

    const blueprintDetail = await employerInterviewBlueprintService.getCurrentBlueprint(organizationId, actingRole, applicationId);
    if (!blueprintDetail) {
      throw new ApiError(404, 'Interview invitation not found');
    }
    const blueprintId = new Types.ObjectId(blueprintDetail.id as string);

    const invitation = await EmployerInterviewInvitation.findOne({ organizationId: organization._id, applicationId: application._id, blueprintId });
    if (!invitation) {
      throw new ApiError(404, 'Interview invitation not found');
    }

    await this.lazilyExpire(invitation);

    if (invitation.status !== EmployerInterviewInvitationStatus.ACTIVE) {
      throw new ApiError(409, `Cannot revoke an invitation with status "${invitation.status}"`);
    }

    invitation.status = EmployerInterviewInvitationStatus.REVOKED;
    invitation.revokedAt = new Date();
    await invitation.save();

    return this.toDetail(invitation.toObject());
  }

  /** ACTIVE and past its own expiry is treated/persisted as EXPIRED on every read/mutate access path — never relies on the frontend's clock, and centralized here exactly once. */
  private async lazilyExpire(invitation: InstanceType<typeof EmployerInterviewInvitation>): Promise<void> {
    if (invitation.status === EmployerInterviewInvitationStatus.ACTIVE && invitation.expiresAt < new Date()) {
      invitation.status = EmployerInterviewInvitationStatus.EXPIRED;
      await invitation.save();
    }
  }

  private assertCanCreateOverExisting(status: EmployerInterviewInvitationStatus): void {
    if (status === EmployerInterviewInvitationStatus.ACTIVE) {
      throw new ApiError(409, 'Invitation already active');
    }
    if (status === EmployerInterviewInvitationStatus.ACCEPTED) {
      throw new ApiError(409, 'Invitation already accepted');
    }
    if (status === EmployerInterviewInvitationStatus.EXPIRED || status === EmployerInterviewInvitationStatus.REVOKED) {
      throw new ApiError(409, 'This invitation has expired or been revoked — use the regenerate endpoint to create a new one');
    }
  }

  /** `crypto.randomBytes(32)` base64url-encoded raw token (URL-path-safe) + SHA-256 hex digest — same primitives as the existing OrganizationInvitationService, only the raw-token encoding differs since this one is designed to sit directly in a URL path segment. */
  private generateToken(): { token: string; tokenHash: string } {
    const token = crypto.randomBytes(32).toString('base64url');
    return { token, tokenHash: this.hashToken(token) };
  }

  private hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  private computeExpiresAt(expiresInDays?: number): Date {
    let days = DEFAULT_EXPIRY_DAYS;
    if (expiresInDays !== undefined) {
      if (typeof expiresInDays !== 'number' || !Number.isFinite(expiresInDays) || expiresInDays < MIN_EXPIRY_DAYS || expiresInDays > MAX_EXPIRY_DAYS) {
        throw new ApiError(400, `expiresInDays must be between ${MIN_EXPIRY_DAYS} and ${MAX_EXPIRY_DAYS}`);
      }
      days = Math.floor(expiresInDays);
    }
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private cleanMessage(message?: string): string | undefined {
    if (typeof message !== 'string') return undefined;
    const trimmed = message.trim();
    return trimmed ? trimmed.slice(0, MAX_INVITATION_MESSAGE_LENGTH) : undefined;
  }

  /** Mirrors EmployerJobApplicationService's own `assertReferencedEntitiesMutable` exactly — only an ARCHIVED job/candidate blocks a mutation; a merely CLOSED job does not. */
  private async assertReferencedEntitiesMutable(organizationId: Types.ObjectId, jobId: Types.ObjectId, candidateId: Types.ObjectId): Promise<void> {
    const [job, candidate] = await Promise.all([
      EmployerJob.findOne({ _id: jobId, organizationId }).select('status').lean<JobRef>(),
      EmployerCandidate.findOne({ _id: candidateId, organizationId }).select('status').lean<CandidateRef>(),
    ]);
    if (job?.status === EmployerJobStatus.ARCHIVED) {
      throw new ApiError(409, 'This job is archived — mutation is disabled');
    }
    if (candidate?.status === EmployerCandidateStatus.ARCHIVED) {
      throw new ApiError(409, 'This candidate is archived — mutation is disabled');
    }
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

  private assertOrganizationMutable(organization: IOrganization): void {
    if (organization.status === OrganizationStatus.ARCHIVED) {
      throw new ApiError(409, 'Organization is archived');
    }
  }

  /** Type guard — interview invitations don't apply to an institute org. */
  private assertIsCompany(organization: IOrganization): void {
    if (organization.type !== OrganizationType.COMPANY) {
      throw new ApiError(400, 'This organization is not a company');
    }
  }

  /** Never exposes tokenHash or any storage/internal secret — the raw token is returned ONLY from create/regenerate, never persisted, never re-derivable from this shape. */
  private toDetail(doc: any): Record<string, unknown> {
    return {
      id: doc._id.toString(),
      applicationId: doc.applicationId.toString(),
      jobId: doc.jobId.toString(),
      candidateId: doc.candidateId.toString(),
      blueprintId: doc.blueprintId.toString(),
      rubricId: doc.rubricId.toString(),
      status: doc.status,
      invitedEmail: doc.invitedEmail,
      invitedName: doc.invitedName,
      message: doc.message,
      expiresAt: doc.expiresAt,
      sentAt: doc.sentAt,
      acceptedAt: doc.acceptedAt,
      revokedAt: doc.revokedAt,
      createdByMembershipId: doc.createdByMembershipId.toString(),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}

export const employerInterviewInvitationService = new EmployerInterviewInvitationService();
