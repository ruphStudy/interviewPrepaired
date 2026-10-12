import { Types } from 'mongoose';
import { User } from '../models/user.model';
import EmployerCandidate from '../models/EmployerCandidate.model';
import { EmployerCandidateStatus } from '../constants/employerCandidate';
import EmployerInterviewInvitation from '../models/EmployerInterviewInvitation.model';
import { EmployerInterviewInvitationStatus } from '../constants/employerInterviewInvitation';
import EmployerJob from '../models/EmployerJob.model';
import Organization from '../models/Organization.model';
import Interview from '../models/interview.model';
import { InterviewStatus } from '../constants/interview';
import { ApiError } from '../utils/ApiError';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_UPCOMING_PER_ORGANIZATION = 5;

/**
 * Candidate-facing lifecycle status — deliberately its own small enum
 * rather than exposing raw `EmployerInterviewInvitationStatus` /
 * `InterviewStatus` values, since neither alone maps 1:1 onto what a
 * candidate needs to know ("in_progress" spans both "accepted but no
 * session yet" and "session created but not finished").
 */
type CandidatePortalStatus = 'invited' | 'in_progress' | 'completed' | 'expired' | 'closed';

interface CandidateAssessmentRow {
  invitationId: string;
  organization: { id: string; name: string };
  job: { id: string; title: string };
  status: CandidatePortalStatus;
  invitedAt?: Date;
  expiresAt: Date;
  acceptedAt?: Date;
  completedAt?: Date;
}

interface CandidateDashboardBlock {
  organization: { id: string; name: string };
  candidate: { id: string };
  summary: { total: number; invited: number; inProgress: number; completed: number };
  upcoming: CandidateAssessmentRow[];
}

/** Minimal shape actually used from a lean EmployerCandidate doc. */
interface LinkedCandidate {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
}

/**
 * Candidate self-service portal — read-only aggregation across every
 * ACTIVE EmployerCandidate record whose email matches the authenticated
 * user's own email, mirroring StudentPortalService's ownership model
 * exactly (never a userId/candidateId/organizationId trusted from the
 * caller — the only trusted identity is `req.user`). Deliberately
 * email-matched at read time rather than a persisted `userId` link on
 * EmployerCandidate: it reuses the EXISTING candidate/invitation/public-
 * assessment architecture with zero schema changes and creates no second,
 * parallel candidate-identity system.
 *
 * Never exposes a raw invitation token (none is ever persisted server-side
 * — see PublicEmployerInterviewInvitationService/EmployerInterviewInvitation
 * model — the candidate's only way to actually take/resume an assessment
 * remains the original secure link from their email), never exposes a
 * score/evaluation (mirrors `toCompletionDetail`'s own exclusion — hiring
 * assessment results are never shown to the candidate, unlike a student's
 * own practice-interview score), never exposes another employer's data in
 * a different employer's context, and never grants any
 * OrganizationMember/RBAC capability — this is participant-level access
 * only, exactly like the Institute Student portal.
 */
export class CandidatePortalService {
  async getDashboard(userId: string): Promise<{ dashboards: CandidateDashboardBlock[] }> {
    const candidates = await this.getActiveLinkedCandidates(userId);
    if (candidates.length === 0) {
      return { dashboards: [] };
    }

    const { organizationById, rows } = await this.loadRows(candidates);

    const rowsByCandidate = new Map<string, CandidateAssessmentRow[]>();
    for (let i = 0; i < candidates.length; i++) {
      rowsByCandidate.set(candidates[i]._id.toString(), []);
    }
    for (const { candidateId, row } of rows) {
      const list = rowsByCandidate.get(candidateId) || [];
      list.push(row);
      rowsByCandidate.set(candidateId, list);
    }

    const dashboards: CandidateDashboardBlock[] = candidates.map((candidate) => {
      const candidateRows = rowsByCandidate.get(candidate._id.toString()) || [];
      const organization = organizationById.get(candidate.organizationId.toString());

      let invited = 0;
      let inProgress = 0;
      let completed = 0;
      for (const row of candidateRows) {
        if (row.status === 'invited') invited += 1;
        else if (row.status === 'in_progress') inProgress += 1;
        else if (row.status === 'completed') completed += 1;
      }

      const upcoming = candidateRows
        .filter((r) => r.status === 'invited' || r.status === 'in_progress')
        .sort((a, b) => (b.invitedAt?.getTime() ?? 0) - (a.invitedAt?.getTime() ?? 0))
        .slice(0, MAX_UPCOMING_PER_ORGANIZATION);

      return {
        organization: { id: candidate.organizationId.toString(), name: organization ? organization.name : '' },
        candidate: { id: candidate._id.toString() },
        summary: { total: candidateRows.length, invited, inProgress, completed },
        upcoming,
      };
    });

    return { dashboards };
  }

  /**
   * All assessments (pending + in-progress + completed + expired/closed)
   * across every ACTIVE linked candidate record, newest-invited first.
   * `organizationId` narrows an already-authorized set — it can never
   * widen access to an organization the caller has no matching candidate
   * record in, exactly like StudentPortalService's own params.
   */
  async listAssessments(
    userId: string,
    params: { organizationId?: string; status?: CandidatePortalStatus; page?: number; limit?: number }
  ): Promise<{ assessments: CandidateAssessmentRow[]; pagination: { page: number; limit: number; total: number; pages: number } }> {
    const page = params.page && params.page > 0 ? params.page : DEFAULT_PAGE;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, MAX_LIMIT) : DEFAULT_LIMIT;

    let candidates = await this.getActiveLinkedCandidates(userId);
    if (params.organizationId) {
      candidates = candidates.filter((c) => c.organizationId.toString() === params.organizationId);
    }
    if (candidates.length === 0) {
      return { assessments: [], pagination: { page, limit, total: 0, pages: 0 } };
    }

    const { rows } = await this.loadRows(candidates);
    let allRows = rows.map((r) => r.row);
    if (params.status) {
      allRows = allRows.filter((r) => r.status === params.status);
    }
    allRows.sort((a, b) => (b.invitedAt?.getTime() ?? 0) - (a.invitedAt?.getTime() ?? 0));

    const total = allRows.length;
    const start = (page - 1) * limit;
    const assessments = allRows.slice(start, start + limit);

    return { assessments, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  /**
   * Completed/expired/closed assessments only — the candidate-safe
   * "history" view. Never includes a score/evaluation.
   */
  async getHistory(
    userId: string,
    params: { organizationId?: string; page?: number; limit?: number }
  ): Promise<{ history: CandidateAssessmentRow[]; pagination: { page: number; limit: number; total: number; pages: number } }> {
    const page = params.page && params.page > 0 ? params.page : DEFAULT_PAGE;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, MAX_LIMIT) : DEFAULT_LIMIT;

    let candidates = await this.getActiveLinkedCandidates(userId);
    if (params.organizationId) {
      candidates = candidates.filter((c) => c.organizationId.toString() === params.organizationId);
    }
    if (candidates.length === 0) {
      return { history: [], pagination: { page, limit, total: 0, pages: 0 } };
    }

    const { rows } = await this.loadRows(candidates);
    const historyRows = rows
      .map((r) => r.row)
      .filter((r) => r.status === 'completed' || r.status === 'expired' || r.status === 'closed')
      .sort((a, b) => (b.completedAt?.getTime() ?? b.invitedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? a.invitedAt?.getTime() ?? 0));

    const total = historyRows.length;
    const start = (page - 1) * limit;
    const history = historyRows.slice(start, start + limit);

    return { history, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  /**
   * Single-assessment detail — authorizes via the same ownership-scoped
   * candidate set as every other method here, so a foreign invitationId
   * (wrong candidate, wrong organization, or nonexistent) is indistinguishable
   * and always 404s. Never leaks blueprint/rubric/screening/score data.
   */
  async getAssessmentDetail(userId: string, invitationId: string): Promise<CandidateAssessmentRow> {
    if (!Types.ObjectId.isValid(invitationId)) {
      throw new ApiError(404, 'Assessment not found');
    }

    const candidates = await this.getActiveLinkedCandidates(userId);
    if (candidates.length === 0) {
      throw new ApiError(404, 'Assessment not found');
    }

    const { rows } = await this.loadRows(candidates);
    const match = rows.find((r) => r.row.invitationId === invitationId);
    if (!match) {
      throw new ApiError(404, 'Assessment not found');
    }
    return match.row;
  }

  /** The sole source of authorized {organizationId, candidateId} pairs for a caller — matched by normalized email, never trusted from the request. */
  private async getActiveLinkedCandidates(userId: string): Promise<LinkedCandidate[]> {
    const user = await User.findById(userId).select('email');
    if (!user) {
      return [];
    }
    return EmployerCandidate.find({
      email: user.email,
      status: EmployerCandidateStatus.ACTIVE,
    })
      .select('organizationId')
      .lean();
  }

  /** Batched, candidate-scoped invitation + job + organization + interview lookups shared by every list/detail method above. */
  private async loadRows(
    candidates: LinkedCandidate[]
  ): Promise<{
    organizationById: Map<string, { name: string }>;
    jobById: Map<string, { title: string }>;
    rows: Array<{ candidateId: string; row: CandidateAssessmentRow }>;
  }> {
    const organizationIds = Array.from(new Set(candidates.map((c) => c.organizationId.toString())));
    // Exact {organizationId, candidateId} pairs only — never a bare candidateId filter.
    const pairFilter = candidates.map((c) => ({ organizationId: c.organizationId, candidateId: c._id }));

    const invitations = await EmployerInterviewInvitation.find({ $or: pairFilter })
      .select('organizationId candidateId jobId status expiresAt sentAt acceptedAt interviewId')
      .lean();

    const jobIds = Array.from(new Set(invitations.map((i) => i.jobId.toString())));
    const [organizations, jobs] = await Promise.all([
      Organization.find({ _id: { $in: organizationIds } }).select('name').lean(),
      jobIds.length > 0
        ? EmployerJob.find({ _id: { $in: jobIds }, organizationId: { $in: organizationIds } })
            .select('title organizationId')
            .lean()
        : Promise.resolve([]),
    ]);
    const organizationById = new Map(organizations.map((o) => [o._id.toString(), { name: o.name }]));
    // Keyed by organizationId+jobId — a job lookup is only ever trusted when it belongs to the same organization as the invitation referencing it.
    const jobByKey = new Map(jobs.map((j) => [`${j.organizationId.toString()}:${j._id.toString()}`, { title: j.title }]));

    const interviewIds = invitations.filter((i) => i.interviewId).map((i) => i.interviewId as Types.ObjectId);
    const interviews =
      interviewIds.length > 0
        ? await Interview.find({ _id: { $in: interviewIds }, organizationId: { $in: organizationIds } })
            .select('organizationId status completedAt')
            .lean()
        : [];
    const interviewByKey = new Map(interviews.map((iv) => [`${iv.organizationId!.toString()}:${iv._id.toString()}`, iv]));

    const rows = invitations.map((invitation) => {
      const orgKey = invitation.organizationId.toString();
      const job = jobByKey.get(`${orgKey}:${invitation.jobId.toString()}`);
      const interview = invitation.interviewId ? interviewByKey.get(`${orgKey}:${invitation.interviewId.toString()}`) : undefined;

      const row: CandidateAssessmentRow = {
        invitationId: invitation._id.toString(),
        organization: { id: orgKey, name: organizationById.get(orgKey)?.name ?? '' },
        job: { id: invitation.jobId.toString(), title: job ? job.title : '' },
        status: this.toCandidateStatus(invitation.status, interview?.status),
        invitedAt: invitation.sentAt,
        expiresAt: invitation.expiresAt,
        acceptedAt: invitation.acceptedAt,
        completedAt: interview?.completedAt,
      };

      return { candidateId: invitation.candidateId.toString(), row };
    });

    return { organizationById, jobById: jobByKey, rows };
  }

  /**
   * Maps the internal invitation/interview status pair onto the small
   * candidate-facing status enum. A completed/evaluated interview always
   * wins regardless of the invitation's own status (an ACCEPTED invitation
   * whose interview finished is "completed", never "in_progress").
   */
  private toCandidateStatus(
    invitationStatus: EmployerInterviewInvitationStatus,
    interviewStatus?: InterviewStatus
  ): CandidatePortalStatus {
    if (interviewStatus === InterviewStatus.COMPLETED || interviewStatus === InterviewStatus.EVALUATED) {
      return 'completed';
    }
    switch (invitationStatus) {
      case EmployerInterviewInvitationStatus.ACTIVE:
        return 'invited';
      case EmployerInterviewInvitationStatus.ACCEPTED:
        return 'in_progress';
      case EmployerInterviewInvitationStatus.EXPIRED:
        return 'expired';
      case EmployerInterviewInvitationStatus.REVOKED:
      case EmployerInterviewInvitationStatus.DRAFT:
      default:
        return 'closed';
    }
  }
}

export const candidatePortalService = new CandidatePortalService();
