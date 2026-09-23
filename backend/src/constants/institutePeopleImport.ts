/**
 * Institute People bulk import (PR-PEOPLE-1). A conservative, configurable
 * MVP limit — mirrors the existing `MAX_BULK_STUDENTS`
 * (InstituteStudentService)/`MAX_ASSIGN_STUDENTS`
 * (InstituteStudentInterviewAssignmentService) convention rather than
 * inventing a different number.
 */
export const MAX_PEOPLE_IMPORT_ROWS = 200;

/** Mirrors the existing resume-upload convention (employerCandidateResume.ts) — same 10MB ceiling, same extension-plus-mimetype double-check at the multer layer. */
export const MAX_PEOPLE_IMPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_PEOPLE_IMPORT_EXTENSIONS = ['.csv', '.xlsx'];

/**
 * Extension-only gate — browsers/OSes send inconsistent mimetypes for CSV
 * in particular, so mimetype is deliberately not checked here. The real
 * content parser (csv-parse/exceljs, InstitutePeopleImportService) is the
 * authoritative check and rejects a genuinely malformed file with a clear
 * 400 regardless of what this passes through.
 */
export function isAllowedPeopleImportFile(filename: string): { allowed: boolean } {
  const extension = `.${(filename.split('.').pop() || '').toLowerCase()}`;
  return { allowed: ALLOWED_PEOPLE_IMPORT_EXTENSIONS.includes(extension) };
}

/** Internal, exact system values a bulk-import row's `userType` column maps onto — never OWNER/SUPER_ADMIN/RECRUITER/ADMIN/MEMBER, whatever the file contains. */
export enum PeopleImportUserType {
  TRAINER = 'TRAINER',
  STUDENT = 'STUDENT',
}

/** Case/whitespace-insensitive mapping from a raw file cell to the exact internal value — anything else (including any other real role name) is intentionally unmapped (returns undefined), never guessed. */
export function normalizePeopleImportUserType(raw: string | undefined | null): PeopleImportUserType | undefined {
  const normalized = (raw ?? '').trim().toUpperCase();
  if (normalized === PeopleImportUserType.TRAINER) return PeopleImportUserType.TRAINER;
  if (normalized === PeopleImportUserType.STUDENT) return PeopleImportUserType.STUDENT;
  return undefined;
}

export type PeopleImportRowStatus =
  | 'valid_new_user'
  | 'valid_existing_user'
  | 'already_existed'
  | 'conflict'
  | 'duplicate_in_file'
  | 'invalid';

export interface PeopleImportRawRow {
  name: string;
  email: string;
  userType: string;
}

export interface PeopleImportPreviewRow {
  index: number;
  name: string;
  email: string;
  userType?: PeopleImportUserType;
  status: PeopleImportRowStatus;
  reason?: string;
}

export interface PeopleImportPreviewResult {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  newUsers: number;
  existingUsers: number;
  duplicateRows: number;
  trainersCount: number;
  studentsCount: number;
  rows: PeopleImportPreviewRow[];
}

export type PeopleImportRowOutcome =
  | 'created'
  | 'linked_existing'
  | 'already_existed'
  | 'invited'
  | 'conflict'
  | 'failed';

export interface PeopleImportResultRow {
  index: number;
  email: string;
  userType?: PeopleImportUserType;
  outcome: PeopleImportRowOutcome;
  error?: string;
}

export interface PeopleImportCommitResult {
  total: number;
  created: number;
  linkedExisting: number;
  alreadyExisted: number;
  invited: number;
  conflict: number;
  failed: number;
  results: PeopleImportResultRow[];
}
