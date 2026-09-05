import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Local persistent storage for candidate resume files (18B). This backend
 * otherwise only ever parses uploads in-memory and discards them (see
 * questionFileUpload in interview.routes.ts) — resumes are the first case
 * that needs to persist the original binary, so this is new, minimal, local
 * disk storage rather than storing file bytes in MongoDB. Path convention
 * mirrors the existing `path.join(process.cwd(), 'logs', ...)` pattern used
 * by the winston logger (see middleware/logger.ts).
 */
const RESUME_STORAGE_ROOT = path.join(process.cwd(), 'uploads', 'candidate-resumes');

/**
 * Builds a brand-new, server-generated stored file location for one resume
 * upload. Never derived from the client's original filename — only the
 * (already-validated, DB-scoped) organizationId/candidateId and a random
 * UUID are used, so there is nothing here for a client to influence.
 */
export function buildStoredResumeLocation(
  organizationId: string,
  candidateId: string,
  extension: string
): { relativePath: string; absolutePath: string } {
  const safeExtension = extension.replace(/[^a-z0-9.]/gi, '').toLowerCase();
  const fileName = `${crypto.randomUUID()}${safeExtension}`;
  const relativePath = path.join(organizationId, candidateId, fileName);
  const absolutePath = path.join(RESUME_STORAGE_ROOT, relativePath);
  return { relativePath, absolutePath };
}

/**
 * Resolves a DB-stored relative path back to an absolute one. `relativePath`
 * only ever originates from our own database (never from a client request),
 * but the containment check is kept anyway as defense in depth against path
 * traversal.
 */
export function resolveStoredResumeAbsolutePath(relativePath: string): string {
  const absolutePath = path.join(RESUME_STORAGE_ROOT, relativePath);
  const normalizedRoot = RESUME_STORAGE_ROOT + path.sep;
  if (absolutePath !== RESUME_STORAGE_ROOT && !absolutePath.startsWith(normalizedRoot)) {
    throw new Error('Resolved resume path escapes the storage root');
  }
  return absolutePath;
}

export async function writeResumeFile(absolutePath: string, buffer: Buffer): Promise<void> {
  await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.promises.writeFile(absolutePath, buffer);
}

/** Best-effort cleanup of an orphaned file — safe to call even if the file was never written. */
export async function deleteResumeFileIfExists(absolutePath: string): Promise<void> {
  try {
    await fs.promises.unlink(absolutePath);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
}
