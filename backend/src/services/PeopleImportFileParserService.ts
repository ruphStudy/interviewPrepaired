import { parse as parseCsvSync } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { PeopleImportRawRow } from '../constants/institutePeopleImport';
import { ApiError } from '../utils/ApiError';

/**
 * Generic CSV/XLSX -> {name,email,userType} row parsing (PR-PEOPLE-1),
 * extracted out of InstitutePeopleImportService (PR-PEOPLE-2) so Employer
 * People bulk import reuses the exact same parser rather than a second
 * copy — this file has no domain knowledge at all (no TRAINER/STUDENT vs
 * RECRUITER/CANDIDATE awareness), it only ever produces raw string rows;
 * each domain's own import service owns userType normalization/validation
 * and conflict classification.
 */
class PeopleImportFileParserService {
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

  /** Unified async entry point regardless of format — the one method callers should use. */
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
}

export const peopleImportFileParserService = new PeopleImportFileParserService();
