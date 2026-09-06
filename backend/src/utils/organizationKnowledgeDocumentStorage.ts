import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Local persistent storage for organization knowledge base document files
 * (29B) — mirrors `candidateResumeStorage.ts` exactly (same local-disk
 * convention, same path-traversal defense-in-depth), scoped by
 * organizationId/knowledgeBaseId instead of candidateId. Kept so a
 * `failed` file-based document can genuinely be reprocessed later (29B
 * `reprocess`) without re-uploading.
 */
const KNOWLEDGE_DOCUMENT_STORAGE_ROOT = path.join(process.cwd(), 'uploads', 'organization-knowledge-documents');

/**
 * Builds a brand-new, server-generated stored file location for one
 * knowledge document upload. Never derived from the client's original
 * filename — only the (already-validated, DB-scoped)
 * organizationId/knowledgeBaseId and a random UUID are used.
 */
export function buildStoredKnowledgeDocumentLocation(
  organizationId: string,
  knowledgeBaseId: string,
  extension: string
): { relativePath: string; absolutePath: string } {
  const safeExtension = extension.replace(/[^a-z0-9.]/gi, '').toLowerCase();
  const fileName = `${crypto.randomUUID()}${safeExtension}`;
  const relativePath = path.join(organizationId, knowledgeBaseId, fileName);
  const absolutePath = path.join(KNOWLEDGE_DOCUMENT_STORAGE_ROOT, relativePath);
  return { relativePath, absolutePath };
}

/**
 * Resolves a DB-stored relative path back to an absolute one.
 * `relativePath` only ever originates from our own database (never from a
 * client request), but the containment check is kept anyway as defense in
 * depth against path traversal.
 */
export function resolveStoredKnowledgeDocumentAbsolutePath(relativePath: string): string {
  const absolutePath = path.join(KNOWLEDGE_DOCUMENT_STORAGE_ROOT, relativePath);
  const normalizedRoot = KNOWLEDGE_DOCUMENT_STORAGE_ROOT + path.sep;
  if (absolutePath !== KNOWLEDGE_DOCUMENT_STORAGE_ROOT && !absolutePath.startsWith(normalizedRoot)) {
    throw new Error('Resolved knowledge document path escapes the storage root');
  }
  return absolutePath;
}

export async function writeKnowledgeDocumentFile(absolutePath: string, buffer: Buffer): Promise<void> {
  await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.promises.writeFile(absolutePath, buffer);
}

/** Best-effort cleanup of an orphaned file — safe to call even if the file was never written. */
export async function deleteKnowledgeDocumentFileIfExists(absolutePath: string): Promise<void> {
  try {
    await fs.promises.unlink(absolutePath);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
}
