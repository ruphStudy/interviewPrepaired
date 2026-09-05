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
import Interview, { IInterview } from '../models/interview.model';
import interviewService from './InterviewService';
import { hiringQuestionMaterializationService } from './HiringQuestionMaterializationService';
import { OrganizationStatus } from '../constants/organization';
import { ApiError } from '../utils/ApiError';

interface ResolvedChain {
  organization: IOrganization;
  job: IEmployerJob;
  blueprint: IEmployerInterviewBlueprint;
}

/**
 * PUBLIC, unauthenticated candidate invitation access (20D) + hiring
 * session creation/handoff (20E) — no `protect`, no organization RBAC,
 * reachable by anyone holding a valid raw token. This is the ONLY place a
 * raw invitation token is ever hashed and looked up for a public caller;
 * every organization/application/job/candidate/blueprint/rubric id
 * involved is derived EXCLUSIVELY from the matched invitation row itself —
 * nothing is ever trusted from the request beyond the token. Invalid,
 * unknown, revoked, and reference-broken tokens all collapse to the SAME
 * generic 404 so a caller can never learn whether a given token ever
 * existed. Session creation reuses the existing Interview domain (via
 * `InterviewService.createEmployerHiringInterview`) rather than a parallel
 * engine, creates exactly ONE session per accepted invitation, and never
 * calls AI, never sends email, never changes EmployerJobApplication
 * status, never consumes credits, and never creates a candidate account.
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
   * POST /public/employer-interview-invitations/:token/session — creates
   * exactly ONE hiring-assessment Interview session for an ACCEPTED
   * invitation (20E). ACTIVE-but-not-yet-accepted is rejected with a
   * clear 409. Idempotent: an already-linked session is returned as-is; a
   * concurrent duplicate create is caught via the Interview model's own
   * unique {employerInvitationId} index (E11000) and resolved by
   * refetching the winner — never a second session, ever. No AI, no
   * email, no EmployerJobApplication status change, no credit
   * consumption, no candidate account.
   */
  async createSession(rawToken: string): Promise<Record<string, unknown>> {
    this.assertTokenFormat(rawToken);
    const tokenHash = this.hashToken(rawToken);

    const invitation = await EmployerInterviewInvitation.findOne({ tokenHash });
    if (!invitation) {
      throw this.notFoundError();
    }

    const chain = await this.resolveChain(invitation);

    if (invitation.status === EmployerInterviewInvitationStatus.ACTIVE) {
      throw new ApiError(409, 'Accept the invitation first.');
    }
    // resolveChain only ever lets ACTIVE or ACCEPTED through, and ACTIVE is
    // excluded above, so invitation.status is ACCEPTED from here on.

    // Idempotent fast path — a session already exists for this invitation.
    if (invitation.interviewId) {
      const existing = await Interview.findById(invitation.interviewId);
      if (existing) {
        return this.toSessionDetail(existing, chain);
      }
      // Reverse pointer set but target missing (shouldn't normally happen) — fall through and create/refetch via the authoritative unique index below.
    }

    const blueprintContent = chain.blueprint.blueprint!;
    let interview: IInterview;
    try {
      interview = await interviewService.createEmployerHiringInterview({
        organizationId: chain.organization._id.toString(),
        jobId: invitation.jobId.toString(),
        jobTitle: chain.job.title,
        candidateId: invitation.candidateId.toString(),
        applicationId: invitation.applicationId.toString(),
        invitationId: invitation._id.toString(),
        blueprintId: invitation.blueprintId.toString(),
        rubricId: invitation.rubricId.toString(),
        totalQuestions: blueprintContent.metadata.totalPlannedQuestions,
      });
    } catch (error: any) {
      if (error?.code !== 11000) {
        throw error;
      }
      // Concurrent duplicate create — the Interview's own unique index is
      // the authoritative guard; refetch whoever actually won.
      const winner = await Interview.findOne({ employerInvitationId: invitation._id });
      if (!winner) {
        throw new ApiError(409, 'Interview session is already being prepared — please try again shortly');
      }
      interview = winner;
    }

    // Best-effort reverse-link for fast future lookups — never load-bearing for correctness.
    if (!invitation.interviewId) {
      await EmployerInterviewInvitation.updateOne(
        { _id: invitation._id, interviewId: { $exists: false } },
        { $set: { interviewId: interview._id } }
      );
    }

    return this.toSessionDetail(interview, chain);
  }

  /** GET /public/employer-interview-invitations/:token/session — read-only. Returns the linked session summary, or null if none has been created yet. */
  async getSession(rawToken: string): Promise<Record<string, unknown> | null> {
    this.assertTokenFormat(rawToken);
    const tokenHash = this.hashToken(rawToken);

    const invitation = await EmployerInterviewInvitation.findOne({ tokenHash });
    if (!invitation) {
      throw this.notFoundError();
    }

    const chain = await this.resolveChain(invitation);

    if (!invitation.interviewId) {
      return null;
    }
    const interview = await Interview.findById(invitation.interviewId);
    if (!interview) {
      return null;
    }

    return this.toSessionDetail(interview, chain);
  }

  /**
   * POST /public/employer-interview-invitations/:token/session/questions
   * (21A) — materializes the session's final candidate-facing questions
   * from the exact blueprint/rubric it was created against. Requires an
   * ACCEPTED invitation with an existing session; idempotent (an
   * already-materialized session is returned as-is, no new AI call).
   */
  async createSessionQuestions(rawToken: string): Promise<Record<string, unknown>> {
    this.assertTokenFormat(rawToken);
    const tokenHash = this.hashToken(rawToken);

    const invitation = await EmployerInterviewInvitation.findOne({ tokenHash });
    if (!invitation) {
      throw this.notFoundError();
    }

    const chain = await this.resolveChain(invitation);

    if (invitation.status === EmployerInterviewInvitationStatus.ACTIVE) {
      throw new ApiError(409, 'Accept the invitation first.');
    }
    if (!invitation.interviewId) {
      throw new ApiError(409, 'Prepare the interview session first.');
    }

    const interview = await hiringQuestionMaterializationService.materialize(
      chain.organization._id.toString(),
      invitation.interviewId.toString()
    );

    return this.toQuestionsDetail(interview);
  }

  /** GET /public/employer-interview-invitations/:token/session/questions — read-only. Returns the candidate-safe question list, or null if no session exists yet. */
  async getSessionQuestions(rawToken: string): Promise<Record<string, unknown> | null> {
    this.assertTokenFormat(rawToken);
    const tokenHash = this.hashToken(rawToken);

    const invitation = await EmployerInterviewInvitation.findOne({ tokenHash });
    if (!invitation) {
      throw this.notFoundError();
    }

    await this.resolveChain(invitation);

    if (!invitation.interviewId) {
      return null;
    }
    const interview = await Interview.findById(invitation.interviewId);
    if (!interview) {
      return null;
    }

    return this.toQuestionsDetail(interview);
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

  /**
   * Safe, minimal public session shape — NEVER internal candidate/user
   * ids, organizationId, applicationId, invitationId, blueprint/rubric
   * ids, tokenHash, screening/score/gap details, or recruiter ids.
   * `sessionId` is the Interview's own id — the one internal id this
   * response is explicitly required to expose.
   */
  private toSessionDetail(interview: IInterview, chain: ResolvedChain): Record<string, unknown> {
    const blueprintContent = chain.blueprint.blueprint!;
    return {
      sessionId: interview._id.toString(),
      status: interview.status,
      interviewPurpose: interview.purpose,
      organizationName: chain.organization.name,
      jobTitle: chain.job.title,
      blueprintTitle: blueprintContent.title,
      estimatedDurationMinutes: blueprintContent.estimatedDurationMinutes,
      createdAt: interview.createdAt,
    };
  }

  /**
   * Candidate-safe question list (21A) — NEVER competencies, skills,
   * rubric content, evaluationIntent, evidenceExpected, followUpFocus,
   * model answers, or any screening/ranking data. Only what a candidate
   * needs to see the question itself.
   */
  private toQuestionsDetail(interview: IInterview): Record<string, unknown> {
    return {
      sessionId: interview._id.toString(),
      status: interview.status,
      totalQuestions: interview.questions.length,
      questions: interview.questions.map((q, index) => ({
        id: String(index),
        question: q.questionText,
        category: q.questionType,
        difficulty: q.difficulty,
      })),
    };
  }
}

export const publicEmployerInterviewInvitationService = new PublicEmployerInterviewInvitationService();
