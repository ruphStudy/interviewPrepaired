/**
 * Employer People bulk import (PR-PEOPLE-2) — reuses the exact same
 * row/result shapes, file-size limit, and max-row limit as Institute's
 * import (institutePeopleImport.ts): MAX_PEOPLE_IMPORT_ROWS,
 * MAX_PEOPLE_IMPORT_FILE_SIZE_BYTES, ALLOWED_PEOPLE_IMPORT_EXTENSIONS,
 * isAllowedPeopleImportFile, PeopleImportRawRow, PeopleImportRowStatus,
 * PeopleImportPreviewRow, PeopleImportPreviewResult, PeopleImportResultRow,
 * PeopleImportRowOutcome, PeopleImportCommitResult are all imported
 * directly from there — genuinely domain-agnostic, not duplicated. Only
 * the userType vocabulary differs between domains (TRAINER/STUDENT vs
 * RECRUITER/CANDIDATE), which is exactly what this file owns.
 */

/** Internal, exact system values a bulk-import row's `userType` column maps onto — never OWNER/SUPER_ADMIN/TRAINER/STUDENT/ADMIN/MEMBER, whatever the file contains. */
export enum EmployerPeopleImportUserType {
  RECRUITER = 'RECRUITER',
  CANDIDATE = 'CANDIDATE',
}

/** Case/whitespace-insensitive mapping from a raw file cell to the exact internal value — anything else (including any other real role name, or Institute's TRAINER/STUDENT) is intentionally unmapped (returns undefined), never guessed. */
export function normalizeEmployerPeopleImportUserType(raw: string | undefined | null): EmployerPeopleImportUserType | undefined {
  const normalized = (raw ?? '').trim().toUpperCase();
  if (normalized === EmployerPeopleImportUserType.RECRUITER) return EmployerPeopleImportUserType.RECRUITER;
  if (normalized === EmployerPeopleImportUserType.CANDIDATE) return EmployerPeopleImportUserType.CANDIDATE;
  return undefined;
}
