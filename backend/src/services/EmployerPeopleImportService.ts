import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import OrganizationMember from '../models/OrganizationMember.model';
import OrganizationInvitation from '../models/OrganizationInvitation.model';
import EmployerCandidate from '../models/EmployerCandidate.model';
import { OrganizationMemberRole, OrganizationMemberStatus } from '../constants/organizationMember';
import { OrganizationInvitationStatus } from '../constants/organizationInvitation';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import {
  MAX_PEOPLE_IMPORT_ROWS,
  PeopleImportRawRow,
  PeopleImportRowStatus,
  PeopleImportPreviewRow,
  PeopleImportPreviewResult,
  PeopleImportResultRow,
  PeopleImportCommitResult,
} from '../constants/institutePeopleImport';
import { EmployerPeopleImportUserType, normalizeEmployerPeopleImportUserType } from '../constants/employerPeopleImport';
import { userIdentityService, normalizeEmail } from './UserIdentityService';
import { peopleImportFileParserService } from './PeopleImportFileParserService';
import { employerRecruiterService } from './EmployerRecruiterService';
import { employerCandidateService } from './EmployerCandidateService';
import { organizationProvisioningAuditService } from './OrganizationProvisioningAuditService';
import { ApiError } from '../utils/ApiError';

const TEMPLATE_HEADERS = ['name', 'email', 'userType'];
const TEMPLATE_EXAMPLE_ROWS = [
  ['Jane Recruiter', 'jane.recruiter@example.com', 'RECRUITER'],
  ['John Candidate', 'john.candidate@example.com', 'CANDIDATE'],
];

const EMAIL_PATTERN = /^[\w.+-]+@\w+([.-]?\w+)*(\.\w{2,3})+$/;

/**
 * Employer Recruiter + Candidate bulk import from a CSV/XLSX file
 * (PR-PEOPLE-2). Mirrors InstitutePeopleImportService exactly in shape
 * (stateless preview/commit, per-row classification, partial success) but
 * for the Employer domain: RECRUITER rows dispatch to
 * `EmployerRecruiterService.inviteRecruiter` (User-account-backed, same as
 * Institute Trainer); CANDIDATE rows dispatch to
 * `EmployerCandidateService.createCandidate` (NEVER User-account-backed —
 * `EmployerCandidate` has no `userId` field at all; candidates interact
 * entirely through the existing token-based `EmployerInterviewInvitation`
 * flow, never by logging in — see that model's own doc comment). File
 * parsing is shared with Institute via `PeopleImportFileParserService`.
 */
export class EmployerPeopleImportService {
  async parseUploadedFile(buffer: Buffer, filename: string): Promise<PeopleImportRawRow[]> {
    return peopleImportFileParserService.parseUploadedFile(buffer, filename);
  }

  /** Read-only — parses+validates+classifies every row against current DB state, never persists anything. */
  async previewImport(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    rawRows: PeopleImportRawRow[]
  ): Promise<PeopleImportPreviewResult> {
    this.assertHasPermission(actingRole);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    this.assertRowCount(rawRows);
    const rows = await this.classifyRows(organization, rawRows);

    return {
      totalRows: rows.length,
      validRows: rows.filter((r) => r.status === 'valid_new_user' || r.status === 'valid_existing_user').length,
      invalidRows: rows.filter((r) => r.status === 'invalid').length,
      newUsers: rows.filter((r) => r.status === 'valid_new_user').length,
      existingUsers: rows.filter((r) => r.status === 'valid_existing_user').length,
      duplicateRows: rows.filter((r) => r.status === 'duplicate_in_file').length,
      userTypeCounts: {
        [EmployerPeopleImportUserType.RECRUITER]: rows.filter((r) => r.userType === EmployerPeopleImportUserType.RECRUITER).length,
        [EmployerPeopleImportUserType.CANDIDATE]: rows.filter((r) => r.userType === EmployerPeopleImportUserType.CANDIDATE).length,
      },
      rows,
    };
  }

  /**
   * Re-validates/re-classifies against CURRENT state (never trusts a
   * client-supplied preview) then, for each importable row, dispatches to
   * the real single-row create primitive. One bad/conflicting row never
   * aborts the others (partial success).
   */
  async commitImport(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    actorUserId: string,
    creatorMembershipId: string,
    rawRows: PeopleImportRawRow[]
  ): Promise<PeopleImportCommitResult> {
    this.assertHasPermission(actingRole);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);
    this.assertRowCount(rawRows);

    const classified = await this.classifyRows(organization, rawRows);

    const results: PeopleImportResultRow[] = [];
    let created = 0;
    let linkedExisting = 0;
    let alreadyExisted = 0;
    let invited = 0;
    let conflict = 0;
    let failed = 0;

    for (const row of classified) {
      if (row.status === 'invalid') {
        results.push({ index: row.index, email: row.email, userType: row.userType, outcome: 'failed', error: row.reason });
        failed += 1;
        continue;
      }
      if (row.status === 'duplicate_in_file') {
        results.push({ index: row.index, email: row.email, userType: row.userType, outcome: 'failed', error: 'Duplicate email within this file' });
        failed += 1;
        continue;
      }
      if (row.status === 'conflict') {
        results.push({ index: row.index, email: row.email, userType: row.userType, outcome: 'conflict', error: row.reason });
        conflict += 1;
        continue;
      }
      if (row.status === 'already_existed') {
        results.push({ index: row.index, email: row.email, userType: row.userType, outcome: 'already_existed' });
        alreadyExisted += 1;
        continue;
      }

      // valid_new_user | valid_existing_user
      try {
        if (row.userType === EmployerPeopleImportUserType.RECRUITER) {
          await employerRecruiterService.inviteRecruiter(organizationId, actingRole, actorUserId, { name: row.name, email: row.email });
          results.push({ index: row.index, email: row.email, userType: row.userType, outcome: 'invited' });
          invited += 1;
        } else {
          const [firstName, ...rest] = row.name.split(/\s+/);
          const lastName = rest.join(' ');
          await employerCandidateService.createCandidate(
            organizationId,
            actingRole,
            creatorMembershipId,
            { firstName, lastName, email: row.email },
            actorUserId
          );
          results.push({ index: row.index, email: row.email, userType: row.userType, outcome: 'created' });
          created += 1;
        }
      } catch (error: any) {
        const message = error instanceof ApiError ? error.message : 'Failed to import this row';
        results.push({ index: row.index, email: row.email, userType: row.userType, outcome: 'failed', error: message });
        failed += 1;
      }
    }

    await organizationProvisioningAuditService.record('people_import_completed', {
      actorUserId,
      organizationId,
      metadata: { total: classified.length, created, linkedExisting, alreadyExisted, invited, conflict, failed },
    });

    return { total: classified.length, created, linkedExisting, alreadyExisted, invited, conflict, failed, results };
  }

  /** Downloadable CSV template — minimum columns per master prompt §6, exact allowed userType values only (RECRUITER/CANDIDATE — never OWNER/SUPER_ADMIN/TRAINER/STUDENT). */
  buildTemplateCsv(): string {
    const lines = [TEMPLATE_HEADERS.join(',')];
    for (const row of TEMPLATE_EXAMPLE_ROWS) {
      lines.push(row.join(','));
    }
    return lines.join('\n') + '\n';
  }

  private async classifyRows(organization: IOrganization, rawRows: PeopleImportRawRow[]): Promise<PeopleImportPreviewRow[]> {
    const seenEmails = new Set<string>();
    const rows: PeopleImportPreviewRow[] = [];

    for (let index = 0; index < rawRows.length; index++) {
      const raw = rawRows[index];
      const name = (raw.name ?? '').trim();
      const rawEmail = (raw.email ?? '').trim();
      const userType = normalizeEmployerPeopleImportUserType(raw.userType);

      if (!name) {
        rows.push({ index, name, email: rawEmail, status: 'invalid', reason: 'name is required' });
        continue;
      }
      if (!rawEmail || !EMAIL_PATTERN.test(rawEmail)) {
        rows.push({ index, name, email: rawEmail, status: 'invalid', reason: 'A valid email is required' });
        continue;
      }
      const email = normalizeEmail(rawEmail);
      if (!userType) {
        rows.push({ index, name, email, status: 'invalid', reason: 'userType must be exactly RECRUITER or CANDIDATE' });
        continue;
      }
      // EmployerCandidateService.createCandidate requires BOTH firstName
      // and lastName — checked here so a single-word name fails this ROW
      // clearly during preview, rather than as a generic "failed" outcome
      // only discovered at commit time.
      if (userType === EmployerPeopleImportUserType.CANDIDATE && name.trim().split(/\s+/).length < 2) {
        rows.push({
          index,
          name,
          email,
          userType,
          status: 'invalid',
          reason: 'A full name (first and last) is required for candidates',
        });
        continue;
      }
      if (seenEmails.has(email)) {
        rows.push({ index, name, email, userType, status: 'duplicate_in_file' });
        continue;
      }
      seenEmails.add(email);

      const classification = await this.classifySingleRow(organization, email, userType);
      rows.push({ index, name, email, userType, ...classification });
    }

    return rows;
  }

  private async classifySingleRow(
    organization: IOrganization,
    email: string,
    userType: EmployerPeopleImportUserType
  ): Promise<{ status: PeopleImportRowStatus; reason?: string }> {
    if (userType === EmployerPeopleImportUserType.RECRUITER) {
      const existingUser = await userIdentityService.findUserByEmail(email);
      if (existingUser) {
        if (existingUser._id.toString() === organization.ownerUserId.toString()) {
          return { status: 'conflict', reason: 'This email is the organization owner' };
        }
        const membership = await OrganizationMember.findOne({ organizationId: organization._id, userId: existingUser._id });
        if (membership?.status === OrganizationMemberStatus.ACTIVE) {
          if (membership.role === OrganizationMemberRole.RECRUITER) {
            return { status: 'already_existed' };
          }
          return { status: 'conflict', reason: `This email is already an active ${membership.role} in this employer` };
        }
        const existingCandidate = await EmployerCandidate.findOne({ organizationId: organization._id, email }).select('_id');
        if (existingCandidate) {
          return { status: 'conflict', reason: 'This email is already a Candidate in this employer' };
        }
        const hasPendingInvite = await this.hasPendingRecruiterInvite(organization._id, email);
        if (hasPendingInvite) {
          return { status: 'already_existed' };
        }
        return { status: 'valid_existing_user' };
      }
      const hasPendingInvite = await this.hasPendingRecruiterInvite(organization._id, email);
      if (hasPendingInvite) {
        return { status: 'already_existed' };
      }
      return { status: 'valid_new_user' };
    }

    // CANDIDATE — never User-linked. "Already exists" means an
    // EmployerCandidate row with this email already exists in THIS org;
    // "new/existing user" is purely informational (whether a global User
    // happens to exist for this email at all), it never changes what
    // happens — a Candidate row is always created independently.
    const existingCandidate = await EmployerCandidate.findOne({ organizationId: organization._id, email }).select('_id');
    if (existingCandidate) {
      return { status: 'already_existed' };
    }
    const existingUser = await userIdentityService.findUserByEmail(email);
    if (existingUser) {
      const membership = await OrganizationMember.findOne({ organizationId: organization._id, userId: existingUser._id });
      if (membership?.status === OrganizationMemberStatus.ACTIVE) {
        return { status: 'conflict', reason: `This email is already an active ${membership.role} in this employer` };
      }
      return { status: 'valid_existing_user' };
    }
    return { status: 'valid_new_user' };
  }

  /** Direct model read — same reasoning as InstitutePeopleImportService's hasPendingTrainerInvite: this internal classification already runs inside an already-authorized preview/commit call. */
  private async hasPendingRecruiterInvite(organizationId: Types.ObjectId, email: string): Promise<boolean> {
    const invite = await OrganizationInvitation.findOne({
      organizationId,
      email,
      role: OrganizationMemberRole.RECRUITER,
      status: OrganizationInvitationStatus.PENDING,
    }).select('_id');
    return !!invite;
  }

  private assertRowCount(rows: PeopleImportRawRow[]): void {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new ApiError(400, 'The uploaded file has no rows');
    }
    if (rows.length > MAX_PEOPLE_IMPORT_ROWS) {
      throw new ApiError(400, `Import cannot exceed ${MAX_PEOPLE_IMPORT_ROWS} rows per file`);
    }
  }

  private assertHasPermission(role: OrganizationMemberRole): void {
    if (!hasOrganizationPermission(role, OrganizationPermission.MEMBERS_MANAGE)) {
      throw new ApiError(403, 'You do not have permission to perform this action');
    }
  }

  private assertOrganizationMutable(organization: IOrganization): void {
    if (organization.status === OrganizationStatus.ARCHIVED) {
      throw new ApiError(409, 'Organization is archived');
    }
    if (organization.status === OrganizationStatus.SUSPENDED) {
      throw new ApiError(409, 'Organization is suspended');
    }
  }

  private assertIsCompany(organization: IOrganization): void {
    if (organization.type !== OrganizationType.COMPANY) {
      throw new ApiError(400, 'This organization is not a company');
    }
  }

  private async getOrganizationById(organizationId: string): Promise<IOrganization> {
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      throw new ApiError(404, 'Organization not found');
    }
    return organization;
  }
}

export const employerPeopleImportService = new EmployerPeopleImportService();
