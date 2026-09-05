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
import { InterviewPurpose, InterviewStatus } from '../constants/interview';
import interviewService from './InterviewService';
import { hiringQuestionMaterializationService } from './HiringQuestionMaterializationService';
import { employerJobApplicationService } from './EmployerJobApplicationService';
import { EmployerJobApplicationStatus } from '../constants/employerJobApplication';
import { OrganizationStatus } from '../constants/organization';
import { ApiError } from '../utils/ApiError';

const MAX_ANSWER_LENGTH = 5000; // matches the schema's own answerText cap
const MAX_ANSWER_DURATION_SECONDS = 3600; // matches the schema's own duration cap

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
   * GET /public/employer-interview-invitations/:token/session/assessment
   * (21B) — candidate-safe progress + question list, with `answerText`
   * populated only for questions the candidate has already saved. Returns
   * null (never throws) when the invitation isn't accepted yet or no
   * materialized session exists — mirrors the existing getSession/
   * getSessionQuestions "not ready" convention.
   */
  async getAssessment(rawToken: string): Promise<Record<string, unknown> | null> {
    this.assertTokenFormat(rawToken);
    const tokenHash = this.hashToken(rawToken);

    const invitation = await EmployerInterviewInvitation.findOne({ tokenHash });
    if (!invitation) {
      throw this.notFoundError();
    }

    await this.resolveChain(invitation);

    if (invitation.status !== EmployerInterviewInvitationStatus.ACCEPTED || !invitation.interviewId) {
      return null;
    }

    const interview = await Interview.findById(invitation.interviewId);
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      return null;
    }

    return this.toAssessmentDetail(interview);
  }

  /**
   * POST /public/employer-interview-invitations/:token/session/answers
   * (21B) — saves exactly one answer via the existing
   * `Interview.submitAnswer` instance method (index bounds + answer
   * persistence, no evaluation/AI side effects). `questionIndex` is only
   * ever resolved against THIS session's own `interview.questions` — no
   * id/metadata is ever trusted from the request body beyond the index,
   * text, and duration. Re-answering an already-answered question is
   * rejected with 409, matching the existing practice-interview behavior
   * of never silently overwriting a saved answer.
   */
  async submitAnswer(rawToken: string, questionIndex: number, answerText: string, duration?: number): Promise<Record<string, unknown>> {
    this.assertTokenFormat(rawToken);
    const tokenHash = this.hashToken(rawToken);

    const invitation = await EmployerInterviewInvitation.findOne({ tokenHash });
    if (!invitation) {
      throw this.notFoundError();
    }

    await this.resolveChain(invitation);

    if (invitation.status !== EmployerInterviewInvitationStatus.ACCEPTED) {
      throw new ApiError(409, 'Accept the invitation first.');
    }
    if (!invitation.interviewId) {
      throw new ApiError(409, 'Prepare the interview session first.');
    }

    const interview = await Interview.findById(invitation.interviewId);
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }
    if (interview.questionMaterializationStatus !== 'completed' || interview.questions.length === 0) {
      throw new ApiError(409, 'Interview questions are not ready yet.');
    }
    if (interview.status === InterviewStatus.COMPLETED || interview.status === InterviewStatus.EVALUATED) {
      throw new ApiError(409, 'This interview has already been completed.');
    }
    if (!Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex >= interview.questions.length) {
      throw new ApiError(400, 'Invalid question index');
    }

    const trimmedAnswer = typeof answerText === 'string' ? answerText.trim() : '';
    if (!trimmedAnswer) {
      throw new ApiError(400, 'answerText is required');
    }
    if (trimmedAnswer.length > MAX_ANSWER_LENGTH) {
      throw new ApiError(400, `answerText cannot exceed ${MAX_ANSWER_LENGTH} characters`);
    }

    let safeDuration: number | undefined;
    if (duration !== undefined) {
      if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0 || duration > MAX_ANSWER_DURATION_SECONDS) {
        throw new ApiError(400, `duration must be a number between 0 and ${MAX_ANSWER_DURATION_SECONDS}`);
      }
      safeDuration = duration;
    }

    const existing = interview.questions[questionIndex];
    if (existing.answerText && existing.answerText.trim().length > 0) {
      throw new ApiError(409, 'This question has already been answered.');
    }

    await interview.submitAnswer(questionIndex, trimmedAnswer, safeDuration);

    return this.toAssessmentDetail(interview);
  }

  /**
   * POST /public/employer-interview-invitations/:token/session/complete
   * (21C) — explicit, hiring-specific, status-only completion. Deliberately
   * does NOT reuse the practice-interview completion path: no evaluation,
   * no final report, no AI call, no credit consumption. IN_PROGRESS ->
   * COMPLETED is an atomic conditional update (never `.save()`, so no
   * practice-side pre-save side effects run); a lost race safely converges
   * on whatever the winner produced. Already COMPLETED/EVALUATED is treated
   * as an idempotent success.
   */
  async completeSession(rawToken: string): Promise<Record<string, unknown>> {
    this.assertTokenFormat(rawToken);
    const tokenHash = this.hashToken(rawToken);

    const invitation = await EmployerInterviewInvitation.findOne({ tokenHash });
    if (!invitation) {
      throw this.notFoundError();
    }

    const chain = await this.resolveChain(invitation);

    if (invitation.status !== EmployerInterviewInvitationStatus.ACCEPTED) {
      throw new ApiError(409, 'Accept the invitation first.');
    }
    if (!invitation.interviewId) {
      throw new ApiError(409, 'Prepare the interview session first.');
    }

    const interview = await Interview.findById(invitation.interviewId);
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }

    // Idempotent — already submitted (evaluation, if ever added, moves
    // COMPLETED -> EVALUATED separately; both are a "already done" success here).
    if (interview.status === InterviewStatus.COMPLETED || interview.status === InterviewStatus.EVALUATED) {
      return this.toCompletionDetail(interview);
    }

    if (interview.status !== InterviewStatus.IN_PROGRESS) {
      // CREATED (no answers yet, so completion is inherently inconsistent) or PAUSED (unsupported here).
      throw new ApiError(409, 'This interview is not ready to be submitted.');
    }

    if (interview.questionMaterializationStatus !== 'completed' || interview.questions.length === 0) {
      throw new ApiError(409, 'Interview questions are not ready yet.');
    }

    const unanswered = interview.questions.filter((q) => !q.answerText || q.answerText.trim().length === 0).length;
    if (unanswered > 0) {
      throw new ApiError(409, `${unanswered} question${unanswered === 1 ? '' : 's'} still need${unanswered === 1 ? 's' : ''} an answer before submitting.`);
    }

    const completed = await Interview.findOneAndUpdate(
      { _id: interview._id, status: InterviewStatus.IN_PROGRESS },
      { $set: { status: InterviewStatus.COMPLETED, completedAt: new Date() } },
      { new: true }
    );

    if (!completed) {
      // Lost the race — someone else already completed it; converge on that state.
      const winner = await Interview.findById(interview._id);
      if (!winner || (winner.status !== InterviewStatus.COMPLETED && winner.status !== InterviewStatus.EVALUATED)) {
        throw new ApiError(409, 'This interview is not ready to be submitted.');
      }
      return this.toCompletionDetail(winner);
    }

    // Best-effort application status sync (18D: shortlisted -> interview),
    // via the trusted-internal-caller-only workflow method — this is a
    // system action with no acting organization member, so it must never
    // impersonate a fake RBAC role. Interview completion above is
    // authoritative — no transaction spans both writes, so any failure here
    // (already "interview", archived job/candidate, etc.) is logged and
    // swallowed, never undoing or failing the completion the candidate
    // already accomplished.
    try {
      await employerJobApplicationService.syncApplicationStatusFromHiringWorkflow(
        chain.organization._id.toString(),
        invitation.applicationId.toString(),
        EmployerJobApplicationStatus.INTERVIEW
      );
    } catch (error) {
      console.error('[PublicEmployerInterviewInvitationService] Best-effort application status sync to "interview" failed', error);
    }

    return this.toCompletionDetail(completed);
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

  /**
   * Candidate-safe progress + assessment detail (21B) — same exclusions as
   * `toQuestionsDetail`, plus: `answerText` is included per-question ONLY
   * when that question already has a saved answer (so a reloading
   * candidate sees their own prior answers, never anyone else's, and
   * never any evaluation/score).
   */
  private toAssessmentDetail(interview: IInterview): Record<string, unknown> {
    const totalQuestions = interview.questions.length;
    const answeredQuestions = interview.questions.filter((q) => q.answerText && q.answerText.trim().length > 0).length;
    const firstUnansweredIndex = interview.questions.findIndex((q) => !q.answerText || q.answerText.trim().length === 0);
    const currentIndex = firstUnansweredIndex === -1 ? Math.max(0, totalQuestions - 1) : firstUnansweredIndex;
    const currentQ = interview.questions[currentIndex];

    return {
      sessionId: interview._id.toString(),
      status: interview.status,
      currentQuestion: currentIndex,
      totalQuestions,
      answeredQuestions,
      completed: answeredQuestions === totalQuestions && totalQuestions > 0,
      question: currentQ
        ? {
            index: currentIndex,
            id: String(currentIndex),
            question: currentQ.questionText,
            category: currentQ.questionType,
            difficulty: currentQ.difficulty,
            answerText: currentQ.answerText || undefined,
          }
        : undefined,
      questions: interview.questions.map((q, index) => ({
        index,
        id: String(index),
        question: q.questionText,
        category: q.questionType,
        difficulty: q.difficulty,
        answerText: q.answerText && q.answerText.trim().length > 0 ? q.answerText : undefined,
      })),
    };
  }

  /** Candidate-safe completion result (21C) — no question text/metadata. */
  private toCompletionDetail(interview: IInterview): Record<string, unknown> {
    const totalQuestions = interview.questions.length;
    const answeredQuestions = interview.questions.filter((q) => q.answerText && q.answerText.trim().length > 0).length;
    return {
      sessionId: interview._id.toString(),
      status: interview.status,
      totalQuestions,
      answeredQuestions,
      completedAt: interview.completedAt,
    };
  }
}

export const publicEmployerInterviewInvitationService = new PublicEmployerInterviewInvitationService();
