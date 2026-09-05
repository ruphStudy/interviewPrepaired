import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerCandidate from '../models/EmployerCandidate.model';
import { EmployerCandidateSource, EmployerCandidateStatus, EMPLOYER_CANDIDATE_STATUS_TRANSITIONS } from '../constants/employerCandidate';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 50;
const SIMPLE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ListCandidatesParams {
  page: number;
  limit: number;
  status?: EmployerCandidateStatus;
  source?: EmployerCandidateSource;
  search?: string;
}

interface CandidateFields {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  headline?: string;
  currentCompany?: string;
  currentTitle?: string;
  location?: string;
  totalExperienceYears?: number;
  linkedinUrl?: string;
  portfolioUrl?: string;
  githubUrl?: string;
  noticePeriodDays?: number;
  currentSalary?: number;
  expectedSalary?: number;
  salaryCurrency?: string;
  source?: EmployerCandidateSource;
  notes?: string;
  tags?: string[];
}

/**
 * Employer candidate profiles (18A). Authorization mirrors EmployerJobService
 * exactly: the `requireOrganizationPermission` middleware (8D) resolves the
 * caller's trusted role onto the request, and these methods take that
 * already-trusted `organizationId`/`actingRole`. Company-only: an INSTITUTE
 * organization gets 400 from every method here. Reads use ORGANIZATION_VIEW;
 * mutations use INTERVIEWS_MANAGE. No resume upload/parsing, job/application
 * linkage, screening/ranking, or AI happens here — this is manually-entered
 * candidate metadata only.
 */
export class EmployerCandidateService {
  async getCandidates(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    params: ListCandidatesParams
  ): Promise<{
    candidates: Array<Record<string, unknown>>;
    pagination: { page: number; limit: number; total: number; pages: number };
  }> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const filter: Record<string, unknown> = { organizationId: organization._id };
    if (params.status) filter.status = params.status;
    if (params.source) filter.source = params.source;

    const search = params.search?.trim();
    if (search) {
      // Escape regex metacharacters — this is a plain substring search, not a pattern language exposed to the caller.
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(escaped, 'i');
      filter.$or = [
        { firstName: pattern },
        { lastName: pattern },
        { email: pattern },
        { phone: pattern },
        { currentCompany: pattern },
        { currentTitle: pattern },
        { location: pattern },
      ];
    }

    const skip = (params.page - 1) * params.limit;
    const [candidates, total] = await Promise.all([
      EmployerCandidate.find(filter).sort({ createdAt: -1 }).skip(skip).limit(params.limit).lean(),
      EmployerCandidate.countDocuments(filter),
    ]);

    return {
      candidates: candidates.map((c) => this.toDetail(c)),
      pagination: { page: params.page, limit: params.limit, total, pages: Math.ceil(total / params.limit) },
    };
  }

  async getCandidateById(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    candidateId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    // Tenant-scoped: never findById(candidateId) alone.
    const candidate = await EmployerCandidate.findOne({ _id: candidateId, organizationId: organization._id }).lean();
    if (!candidate) {
      throw new ApiError(404, 'Candidate not found');
    }
    return this.toDetail(candidate);
  }

  async createCandidate(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    creatorMembershipId: string,
    fields: CandidateFields
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);

    const firstName = fields.firstName?.trim();
    const lastName = fields.lastName?.trim();
    if (!firstName) {
      throw new ApiError(400, 'firstName is required');
    }
    if (!lastName) {
      throw new ApiError(400, 'lastName is required');
    }
    const email = this.normalizeAndValidateEmail(fields.email);

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);
    this.assertSalaryIntegrity(fields.currentSalary, fields.expectedSalary);

    try {
      const candidate = await EmployerCandidate.create({
        organizationId: organization._id,
        firstName,
        lastName,
        email,
        phone: fields.phone?.trim() || undefined,
        headline: fields.headline?.trim() || undefined,
        currentCompany: fields.currentCompany?.trim() || undefined,
        currentTitle: fields.currentTitle?.trim() || undefined,
        location: fields.location?.trim() || undefined,
        totalExperienceYears: fields.totalExperienceYears,
        linkedinUrl: fields.linkedinUrl?.trim() || undefined,
        portfolioUrl: fields.portfolioUrl?.trim() || undefined,
        githubUrl: fields.githubUrl?.trim() || undefined,
        noticePeriodDays: fields.noticePeriodDays,
        currentSalary: fields.currentSalary,
        expectedSalary: fields.expectedSalary,
        salaryCurrency: fields.salaryCurrency?.trim().toUpperCase() || undefined,
        source: fields.source ?? EmployerCandidateSource.MANUAL,
        // Always ACTIVE server-side — never accepted from the request body at all.
        status: EmployerCandidateStatus.ACTIVE,
        notes: fields.notes?.trim() || undefined,
        tags: this.cleanTags(fields.tags),
        createdByMembershipId: new Types.ObjectId(creatorMembershipId),
      });
      return this.toDetail(candidate.toObject());
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ApiError(409, 'A candidate with this email already exists in this organization');
      }
      throw error;
    }
  }

  /**
   * PATCH-like merge despite the PUT route — status/organizationId/
   * createdByMembershipId/timestamps are never accepted here (rejected at
   * the route validator). The dedicated status endpoint is the only status
   * transition path. An archived candidate is read-only — restore it to
   * active first.
   */
  async updateCandidate(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    candidateId: string,
    fields: CandidateFields
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    if (Object.values(fields).every((value) => value === undefined)) {
      throw new ApiError(400, 'At least one field is required');
    }

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const candidate = await EmployerCandidate.findOne({ _id: candidateId, organizationId: organization._id });
    if (!candidate) {
      throw new ApiError(404, 'Candidate not found');
    }
    this.assertCandidateEditable(candidate.status);

    if (fields.firstName !== undefined) {
      const trimmed = fields.firstName.trim();
      if (!trimmed) throw new ApiError(400, 'firstName cannot be empty');
      candidate.firstName = trimmed;
    }
    if (fields.lastName !== undefined) {
      const trimmed = fields.lastName.trim();
      if (!trimmed) throw new ApiError(400, 'lastName cannot be empty');
      candidate.lastName = trimmed;
    }
    if (fields.email !== undefined) {
      candidate.email = this.normalizeAndValidateEmail(fields.email);
    }
    if (fields.phone !== undefined) candidate.phone = fields.phone.trim() || undefined;
    if (fields.headline !== undefined) candidate.headline = fields.headline.trim() || undefined;
    if (fields.currentCompany !== undefined) candidate.currentCompany = fields.currentCompany.trim() || undefined;
    if (fields.currentTitle !== undefined) candidate.currentTitle = fields.currentTitle.trim() || undefined;
    if (fields.location !== undefined) candidate.location = fields.location.trim() || undefined;
    if (fields.totalExperienceYears !== undefined) candidate.totalExperienceYears = fields.totalExperienceYears;
    if (fields.linkedinUrl !== undefined) candidate.linkedinUrl = fields.linkedinUrl.trim() || undefined;
    if (fields.portfolioUrl !== undefined) candidate.portfolioUrl = fields.portfolioUrl.trim() || undefined;
    if (fields.githubUrl !== undefined) candidate.githubUrl = fields.githubUrl.trim() || undefined;
    if (fields.noticePeriodDays !== undefined) candidate.noticePeriodDays = fields.noticePeriodDays;
    if (fields.currentSalary !== undefined) candidate.currentSalary = fields.currentSalary;
    if (fields.expectedSalary !== undefined) candidate.expectedSalary = fields.expectedSalary;
    if (fields.salaryCurrency !== undefined) candidate.salaryCurrency = fields.salaryCurrency.trim().toUpperCase() || undefined;
    if (fields.source !== undefined) candidate.source = fields.source;
    if (fields.notes !== undefined) candidate.notes = fields.notes.trim() || undefined;
    if (fields.tags !== undefined) candidate.tags = this.cleanTags(fields.tags);

    this.assertSalaryIntegrity(candidate.currentSalary, candidate.expectedSalary);

    try {
      await candidate.save();
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ApiError(409, 'A candidate with this email already exists in this organization');
      }
      throw error;
    }

    return this.toDetail(candidate.toObject());
  }

  /**
   * The ONLY way a candidate's status changes. Explicit transition map
   * (EMPLOYER_CANDIDATE_STATUS_TRANSITIONS); an unlisted or same-status
   * "transition" is rejected with a clear 409, never silently accepted.
   */
  async updateCandidateStatus(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    candidateId: string,
    targetStatus: EmployerCandidateStatus
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);

    if (!targetStatus || !Object.values(EmployerCandidateStatus).includes(targetStatus)) {
      throw new ApiError(400, 'A valid status is required');
    }

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const candidate = await EmployerCandidate.findOne({ _id: candidateId, organizationId: organization._id });
    if (!candidate) {
      throw new ApiError(404, 'Candidate not found');
    }

    if (candidate.status === targetStatus) {
      throw new ApiError(409, `Candidate is already "${targetStatus}"`);
    }

    const allowedNextStatuses = EMPLOYER_CANDIDATE_STATUS_TRANSITIONS[candidate.status] ?? [];
    if (!allowedNextStatuses.includes(targetStatus)) {
      throw new ApiError(409, `Cannot transition candidate from "${candidate.status}" to "${targetStatus}"`);
    }

    candidate.status = targetStatus;
    await candidate.save();
    return this.toDetail(candidate.toObject());
  }

  /** An archived candidate is read-only through the generic update endpoint — it must be restored to active (via the status endpoint) before it can be edited again. */
  private assertCandidateEditable(status: EmployerCandidateStatus): void {
    if (status === EmployerCandidateStatus.ARCHIVED) {
      throw new ApiError(409, 'Archived candidates are read-only — restore to active before editing');
    }
  }

  private normalizeAndValidateEmail(email?: string): string {
    const normalized = email?.trim().toLowerCase();
    if (!normalized || !SIMPLE_EMAIL_PATTERN.test(normalized)) {
      throw new ApiError(400, 'A valid email is required');
    }
    return normalized;
  }

  private assertSalaryIntegrity(currentSalary?: number, expectedSalary?: number): void {
    if (currentSalary !== undefined && currentSalary < 0) {
      throw new ApiError(400, 'currentSalary cannot be negative');
    }
    if (expectedSalary !== undefined && expectedSalary < 0) {
      throw new ApiError(400, 'expectedSalary cannot be negative');
    }
  }

  /** Trimmed, empty-filtered, de-duplicated (case-insensitive), and capped — same pattern as EmployerJobService's skill/responsibility array cleanup. */
  private cleanTags(tags?: string[]): string[] | undefined {
    if (tags === undefined) return undefined;
    const seen = new Set<string>();
    const cleaned: string[] = [];
    for (const raw of tags) {
      if (typeof raw !== 'string') continue;
      const trimmed = raw.trim().slice(0, MAX_TAG_LENGTH);
      const key = trimmed.toLowerCase();
      if (!trimmed || seen.has(key)) continue;
      seen.add(key);
      cleaned.push(trimmed);
      if (cleaned.length >= MAX_TAGS) break;
    }
    return cleaned.length > 0 ? cleaned : undefined;
  }

  /** Access is already verified by the RBAC middleware — this just loads by ID (trusted organizationId). */
  private async getOrganizationById(organizationId: string): Promise<IOrganization> {
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      throw new ApiError(404, 'Organization not found');
    }
    return organization;
  }

  /** Defense in depth — the middleware already checked this; never duplicates the 8C matrix, just reuses it. */
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

  /** Type guard — candidates don't apply to an institute org. */
  private assertIsCompany(organization: IOrganization): void {
    if (organization.type !== OrganizationType.COMPANY) {
      throw new ApiError(400, 'This organization is not a company');
    }
  }

  private toDetail(candidate: any): Record<string, unknown> {
    return {
      id: candidate._id.toString(),
      organizationId: candidate.organizationId.toString(),
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: candidate.email,
      phone: candidate.phone,
      headline: candidate.headline,
      currentCompany: candidate.currentCompany,
      currentTitle: candidate.currentTitle,
      location: candidate.location,
      totalExperienceYears: candidate.totalExperienceYears,
      linkedinUrl: candidate.linkedinUrl,
      portfolioUrl: candidate.portfolioUrl,
      githubUrl: candidate.githubUrl,
      noticePeriodDays: candidate.noticePeriodDays,
      currentSalary: candidate.currentSalary,
      expectedSalary: candidate.expectedSalary,
      salaryCurrency: candidate.salaryCurrency,
      source: candidate.source,
      status: candidate.status,
      notes: candidate.notes,
      tags: candidate.tags,
      createdByMembershipId: candidate.createdByMembershipId.toString(),
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
    };
  }
}

export const employerCandidateService = new EmployerCandidateService();
