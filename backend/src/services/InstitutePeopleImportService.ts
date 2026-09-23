import { parse as parseCsvSync } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import OrganizationMember from '../models/OrganizationMember.model';
import OrganizationInvitation from '../models/OrganizationInvitation.model';
import InstituteStudent from '../models/InstituteStudent.model';
import { OrganizationMemberRole, OrganizationMemberStatus } from '../constants/organizationMember';
import { OrganizationInvitationStatus } from '../constants/organizationInvitation';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import {
  MAX_PEOPLE_IMPORT_ROWS,
  PeopleImportUserType,
  normalizePeopleImportUserType,
  PeopleImportRawRow,
  PeopleImportRowStatus,
  PeopleImportPreviewRow,
  PeopleImportPreviewResult,
  PeopleImportResultRow,
  PeopleImportCommitResult,
} from '../constants/institutePeopleImport';
import { userIdentityService, normalizeEmail } from './UserIdentityService';
import { instituteTrainerService } from './InstituteTrainerService';
import { instituteStudentService } from './InstituteStudentService';
import { organizationProvisioningAuditService } from './OrganizationProvisioningAuditService';
import { ApiError } from '../utils/ApiError';

const TEMPLATE_HEADERS = ['name', 'email', 'userType'];
const TEMPLATE_EXAMPLE_ROWS = [
  ['Jane Trainer', 'jane.trainer@example.com', 'TRAINER'],
  ['John Student', 'john.student@example.com', 'STUDENT'],
];

const EMAIL_PATTERN = /^[\w.+-]+@\w+([.-]?\w+)*(\.\w{2,3})+$/;

/**
 * Institute Trainer + Student bulk import from a CSV/XLSX file
 * (PR-PEOPLE-1 §5-11). Deliberately file-oriented and stateless: `preview`
 * and `commit` each independently parse+validate+classify the SAME
 * uploaded file — nothing about a preview is persisted server-side to
 * "confirm" later, so there is no server-side session state to expire, race,
 * or leak across requests; the client re-sends the file to commit exactly
 * what it previewed. This also makes retry/re-upload trivially idempotent:
 * every row is re-classified against CURRENT database state at commit time,
 * never against a stale preview.
 *
 * Every row dispatches to already-existing, already-tested single-row
 * primitives (`InstituteTrainerService.inviteTrainer`,
 * `InstituteStudentService.createStudentWithAccountLink`) — this file adds
 * parsing, per-row classification/conflict-detection, and result
 * aggregation only, never a parallel creation path.
 */
export class InstitutePeopleImportService {
  private parseCsv(buffer: Buffer): PeopleImportRawRow[] {
    let records: Record<string, string>[];
    try {
      records = parseCsvSync(buffer, {
        columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });
    } catch (error) {
      throw new ApiError(400, 'Could not parse this CSV file. Please check the file format.');
    }
    return records.map((r) => this.toRawRow(r));
  }

  private async parseXlsx(buffer: Buffer): Promise<PeopleImportRawRow[]> {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as any);
    } catch (error) {
      throw new ApiError(400, 'Could not parse this XLSX file. Please check the file format.');
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount === 0) {
      throw new ApiError(400, 'The uploaded file has no rows.');
    }

    const headerRow = worksheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      headers[colNumber - 1] = String(cell.value ?? '').trim().toLowerCase();
    });

    const rows: PeopleImportRawRow[] = [];
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      const row = worksheet.getRow(rowNumber);
      if (row.cellCount === 0) continue;
      const record: Record<string, string> = {};
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const header = headers[colNumber - 1];
        if (header) record[header] = String(cell.value ?? '').trim();
      });
      if (Object.values(record).every((v) => !v)) continue; // blank row
      rows.push(this.toRawRow(record));
    }
    return rows;
  }

  /** Unified async entry point regardless of format — the one method routes/controllers should call. */
  async parseUploadedFile(buffer: Buffer, filename: string): Promise<PeopleImportRawRow[]> {
    const extension = (filename.split('.').pop() || '').toLowerCase();
    if (extension === 'csv') return this.parseCsv(buffer);
    if (extension === 'xlsx' || extension === 'xls') return this.parseXlsx(buffer);
    throw new ApiError(400, 'Unsupported file type. Please upload a .csv or .xlsx file.');
  }

  private toRawRow(record: Record<string, string>): PeopleImportRawRow {
    return {
      name: (record.name ?? '').trim(),
      email: (record.email ?? '').trim(),
      userType: (record.usertype ?? record['user type'] ?? '').trim(),
    };
  }

  /** Read-only — parses+validates+classifies every row against current DB state, never persists anything. */
  async previewImport(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    rawRows: PeopleImportRawRow[]
  ): Promise<PeopleImportPreviewResult> {
    this.assertHasPermission(actingRole);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);

    this.assertRowCount(rawRows);

    const rows = await this.classifyRows(organization, rawRows);

    const result: PeopleImportPreviewResult = {
      totalRows: rows.length,
      validRows: rows.filter((r) => r.status === 'valid_new_user' || r.status === 'valid_existing_user').length,
      invalidRows: rows.filter((r) => r.status === 'invalid').length,
      newUsers: rows.filter((r) => r.status === 'valid_new_user').length,
      existingUsers: rows.filter((r) => r.status === 'valid_existing_user').length,
      duplicateRows: rows.filter((r) => r.status === 'duplicate_in_file').length,
      trainersCount: rows.filter((r) => r.userType === PeopleImportUserType.TRAINER).length,
      studentsCount: rows.filter((r) => r.userType === PeopleImportUserType.STUDENT).length,
      rows,
    };
    return result;
  }

  /**
   * Re-validates/re-classifies against CURRENT state (never trusts a
   * client-supplied preview) then, for each importable row, dispatches to
   * the real single-row create primitive. One bad/conflicting row never
   * aborts the others (partial success) — every row is independently
   * try/caught and reported.
   */
  async commitImport(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    actorUserId: string,
    rawRows: PeopleImportRawRow[]
  ): Promise<PeopleImportCommitResult> {
    this.assertHasPermission(actingRole);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);
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
        if (row.userType === PeopleImportUserType.TRAINER) {
          await instituteTrainerService.inviteTrainer(organizationId, actingRole, actorUserId, { name: row.name, email: row.email });
          results.push({ index: row.index, email: row.email, userType: row.userType, outcome: 'invited' });
          invited += 1;
        } else {
          const [firstName, ...rest] = row.name.split(/\s+/);
          const outcome = await instituteStudentService.createStudentWithAccountLink(organizationId, actingRole, {
            firstName: firstName || row.name,
            lastName: rest.join(' ') || undefined,
            email: row.email,
          });
          if (outcome.accountLinkStatus === 'linked_new_user') {
            results.push({ index: row.index, email: row.email, userType: row.userType, outcome: 'created' });
            created += 1;
          } else {
            results.push({ index: row.index, email: row.email, userType: row.userType, outcome: 'linked_existing' });
            linkedExisting += 1;
          }
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

  /** Generates the downloadable import template as a CSV buffer (Content-Type text/csv) — minimum columns per PR-PEOPLE-1 §6, exact allowed userType values only. */
  buildTemplateCsv(): string {
    const lines = [TEMPLATE_HEADERS.join(',')];
    for (const row of TEMPLATE_EXAMPLE_ROWS) {
      lines.push(row.join(','));
    }
    return lines.join('\n') + '\n';
  }

  /**
   * Shared by preview and commit — the ONE place row validation and
   * conflict classification happens, so the two can never drift apart
   * (what preview shows is exactly what commit acts on, given the same
   * current DB state).
   */
  private async classifyRows(organization: IOrganization, rawRows: PeopleImportRawRow[]): Promise<PeopleImportPreviewRow[]> {
    const seenEmails = new Set<string>();
    const rows: PeopleImportPreviewRow[] = [];

    for (let index = 0; index < rawRows.length; index++) {
      const raw = rawRows[index];
      const name = (raw.name ?? '').trim();
      const rawEmail = (raw.email ?? '').trim();
      const userType = normalizePeopleImportUserType(raw.userType);

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
        rows.push({
          index,
          name,
          email,
          status: 'invalid',
          reason: 'userType must be exactly TRAINER or STUDENT',
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

  /** Direct model read — deliberately bypasses OrganizationInvitationService.getInvitations, which is permission-gated for an actual caller's role and isn't email-filterable; this internal classification already runs inside an already-authorized preview/commit call. */
  private async hasPendingTrainerInvite(organizationId: Types.ObjectId, email: string): Promise<boolean> {
    const invite = await OrganizationInvitation.findOne({
      organizationId,
      email,
      role: OrganizationMemberRole.TRAINER,
      status: OrganizationInvitationStatus.PENDING,
    }).select('_id');
    return !!invite;
  }

  private async classifySingleRow(
    organization: IOrganization,
    email: string,
    userType: PeopleImportUserType
  ): Promise<{ status: PeopleImportRowStatus; reason?: string }> {
    const existingUser = await userIdentityService.findUserByEmail(email);

    if (userType === PeopleImportUserType.TRAINER) {
      if (existingUser) {
        if (existingUser._id.toString() === organization.ownerUserId.toString()) {
          return { status: 'conflict', reason: 'This email is the organization owner' };
        }
        const membership = await OrganizationMember.findOne({ organizationId: organization._id, userId: existingUser._id });
        if (membership?.status === OrganizationMemberStatus.ACTIVE) {
          if (membership.role === OrganizationMemberRole.TRAINER) {
            return { status: 'already_existed' };
          }
          return { status: 'conflict', reason: `This email is already an active ${membership.role} in this institute` };
        }
        const existingStudent = await InstituteStudent.findOne({ organizationId: organization._id, userId: existingUser._id }).select('_id');
        if (existingStudent) {
          return { status: 'conflict', reason: 'This email is already linked as a Student in this institute' };
        }
        const hasPendingInvite = await this.hasPendingTrainerInvite(organization._id, email);
        if (hasPendingInvite) {
          return { status: 'already_existed' };
        }
        return { status: 'valid_existing_user' };
      }
      const hasPendingInvite = await this.hasPendingTrainerInvite(organization._id, email);
      if (hasPendingInvite) {
        return { status: 'already_existed' };
      }
      return { status: 'valid_new_user' };
    }

    // STUDENT
    const existingStudent = await InstituteStudent.findOne({ organizationId: organization._id, email }).select('_id userId');
    if (existingStudent) {
      return { status: 'already_existed' };
    }
    if (existingUser) {
      const membership = await OrganizationMember.findOne({ organizationId: organization._id, userId: existingUser._id });
      if (membership?.status === OrganizationMemberStatus.ACTIVE) {
        return { status: 'conflict', reason: `This email is already an active ${membership.role} in this institute` };
      }
      return { status: 'valid_existing_user' };
    }
    return { status: 'valid_new_user' };
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

  private assertIsInstitute(organization: IOrganization): void {
    if (organization.type !== OrganizationType.INSTITUTE) {
      throw new ApiError(400, 'This organization is not an institute');
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

export const institutePeopleImportService = new InstitutePeopleImportService();
