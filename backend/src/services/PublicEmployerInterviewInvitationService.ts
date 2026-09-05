import crypto from 'crypto';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJob, { IEmployerJob } from '../models/EmployerJob.model';
import { EmployerJobStatus } from '../constants/employerJob';
import EmployerCandidate from '../models/EmployerCandidate.model';
import { EmployerCandidateStatus } from '../constants/employerCandidate';
import EmployerJobApplication from '../models/EmployerJobApplication.model';
import EmployerInterviewBlueprint, { IEmployerInterviewBlueprint } from '../models/EmployerInterviewBlueprint.model';
import { EmployerInterviewBlueprintStatus } from '../constants/employerInterviewBlueprint';
import EmployerInterviewCompetencyRubric from '../models/EmployerInterviewCompetencyRubric.model';
import EmployerInterviewInvitation from '../models/EmployerInterviewInvitation.model';
import { EmployerInterviewInvitationStatus } from '../constants/employerInterviewInvitation';
import { OrganizationStatus } from '../constants/organization';
import { ApiError } from '../utils/ApiError';

interface ResolvedChain {
  organization: IOrganization;
  job: IEmployerJob;
  blueprint: IEmployerInterviewBlueprint;
}

/**
 * PUBLIC, unauthenticated candidate invitation access (20D) — no `protect`,
 * no organization RBAC, reachable by anyone holding a valid raw token. This
 * is the ONLY place a raw invitation token is ever hashed and looked up
 * for a public caller; every organization/application/job/candidate/
 * blueprint/rubric id involved is derived EXCLUSIVELY from the matched
 * invitation row itself — nothing is ever trusted from the request beyond
 * the token. Invalid, unknown, revoked, and reference-broken tokens all
 * collapse to the SAME generic 404 so a caller can never learn whether a
 * given token ever existed. No AI, no email, no interview session/answer
 * capture, no EmployerJobApplication status change happens here — this
 * sprint only establishes secure candidate access + explicit acceptance.
 */
export class PublicEmployerInterviewInvitationService {
  /** GET /public/employer-interview-invitations/:token — read-only. Accepted invitations remain readable through the same token until they'd otherwise expire. */
  async getPublicInvitation(rawToken: string): Promise<Record<string, unknown>> {
    this.assertTokenFormat(rawToken);
    const tokenHash = this.hashToken(rawToken);

    const invitation = await EmployerInterviewInvitation.findOne({ tokenHash });
    if (!invitation) {
      throw this.notFoundError();
    }

    const chain = await this.resolveChain(invitation);
    return this.toPublicDetail(invitation, chain);
  }

  /**
   * POST /public/employer-interview-invitations/:token/accept — the ONLY
   * mutation here. ACTIVE -> ACCEPTED via an atomic conditional update
   * (status ACTIVE + tokenHash) so concurrent accept requests safely
   * converge on ACCEPTED rather than racing each other. An already-
   * ACCEPTED invitation is treated as an idempotent success. Never creates
   * an interview session, never changes EmployerJobApplication status,
   * never creates a candidate account, never consumes credits, never
   * calls AI, never sends email.
   */
  async acceptInvitation(rawToken: string): Promise<Record<string, unknown>> {
    this.assertTokenFormat(rawToken);
    const tokenHash = this.hashToken(rawToken);

    const invitation = await EmployerInterviewInvitation.findOne({ tokenHash });
    if (!invitation) {
      throw this.notFoundError();
    }

    // Validates the full chain (org/job/candidate/blueprint/rubric) and
    // lazily expires — throws for EXPIRED/REVOKED, lets ACTIVE/ACCEPTED through.
    const chain = await this.resolveChain(invitation);

    if (invitation.status === EmployerInterviewInvitationStatus.ACCEPTED) {
      return this.toPublicDetail(invitation, chain);
    }

    const accepted = await EmployerInterviewInvitation.findOneAndUpdate(
      { _id: invitation._id, tokenHash, status: EmployerInterviewInvitationStatus.ACTIVE },
      { $set: { status: EmployerInterviewInvitationStatus.ACCEPTED, acceptedAt: new Date() } },
      { new: true }
    );

    // If we lost the race, another concurrent accept already flipped it —
    // re-fetch the now-settled row rather than erroring; both callers
    // converge on the same accepted state.
    const finalDoc = accepted ?? (await EmployerInterviewInvitation.findOne({ tokenHash }));
    if (!finalDoc) {
      throw this.notFoundError();
    }

    return this.toPublicDetail(finalDoc, chain);
  }

  /**
   * Validates the invitation's full reference chain and lazily expires it
   * first (never trusts the caller's clock). Throws a generic 404 for any
   * broken/archived reference, and a 410 specifically for an expired
   * invitation (the one case where the spec calls for a distinguishable
   * response). Lets ACTIVE and ACCEPTED through unchanged.
   */
  private async resolveChain(invitation: InstanceType<typeof EmployerInterviewInvitation>): Promise<ResolvedChain> {
    if (invitation.status === EmployerInterviewInvitationStatus.ACTIVE && invitation.expiresAt < new Date()) {
      invitation.status = EmployerInterviewInvitationStatus.EXPIRED;
      await invitation.save();
    }

    if (invitation.status === EmployerInterviewInvitationStatus.EXPIRED) {
      throw new ApiError(410, 'This invitation has expired.');
    }
    if (
      invitation.status === EmployerInterviewInvitationStatus.REVOKED ||
      invitation.status === EmployerInterviewInvitationStatus.DRAFT
    ) {
      // Indistinguishable from "token never existed" — never reveal that a revoked token was once valid.
      throw this.notFoundError();
    }

    const organization = await Organization.findById(invitation.organizationId);
    if (!organization || organization.status === OrganizationStatus.ARCHIVED) {
      throw this.notFoundError();
    }

    const application = await EmployerJobApplication.findOne({
      _id: invitation.applicationId,
      organizationId: invitation.organizationId,
    }).select('_id');
    if (!application) {
      throw this.notFoundError();
    }

    const job = await EmployerJob.findOne({ _id: invitation.jobId, organizationId: invitation.organizationId });
    if (!job || job.status === EmployerJobStatus.ARCHIVED) {
      throw this.notFoundError();
    }

    const candidate = await EmployerCandidate.findOne({ _id: invitation.candidateId, organizationId: invitation.organizationId }).select(
      'status'
    );
    if (!candidate || candidate.status === EmployerCandidateStatus.ARCHIVED) {
      throw this.notFoundError();
    }

    const blueprint = await EmployerInterviewBlueprint.findOne({
      _id: invitation.blueprintId,
      organizationId: invitation.organizationId,
    });
    if (!blueprint || blueprint.status !== EmployerInterviewBlueprintStatus.COMPLETED || !blueprint.blueprint) {
      throw this.notFoundError();
    }

    const rubric = await EmployerInterviewCompetencyRubric.findOne({
      _id: invitation.rubricId,
      organizationId: invitation.organizationId,
    }).select('_id');
    if (!rubric) {
      throw this.notFoundError();
    }

    return { organization, job, blueprint };
  }

  private assertTokenFormat(rawToken: string): void {
    // base64url alphabet only — never logged, and a format failure returns
    // the exact same generic response as a well-formed-but-unknown token.
    if (typeof rawToken !== 'string' || rawToken.length < 32 || rawToken.length > 128 || !/^[A-Za-z0-9_-]+$/.test(rawToken)) {
      throw this.notFoundError();
    }
  }

  private hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  private notFoundError(): ApiError {
    return new ApiError(404, 'Invitation not found');
  }

  /**
   * Safe, minimal public shape — NEVER candidateId/organizationId/
   * applicationId/blueprintId/rubricId/screening ids/tokenHash/recruiter
   * membership ids/JD/resume/screening/score/gap content, and never the
   * candidate's email.
   */
  private toPublicDetail(invitation: InstanceType<typeof EmployerInterviewInvitation>, chain: ResolvedChain): Record<string, unknown> {
    const blueprintContent = chain.blueprint.blueprint!;
    return {
      status: invitation.status,
      invitedName: invitation.invitedName,
      organization: { name: chain.organization.name },
      job: { title: chain.job.title, jobCode: chain.job.jobCode },
      interview: {
        blueprintTitle: blueprintContent.title,
        estimatedDurationMinutes: blueprintContent.estimatedDurationMinutes,
        totalSections: blueprintContent.metadata.totalSections,
        totalPlannedQuestions: blueprintContent.metadata.totalPlannedQuestions,
      },
      expiresAt: invitation.expiresAt,
      message: invitation.message,
      acceptedAt: invitation.acceptedAt,
    };
  }
}

export const publicEmployerInterviewInvitationService = new PublicEmployerInterviewInvitationService();
