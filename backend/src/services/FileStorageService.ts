import crypto from 'crypto';
import { getObjectStorageProvider, ObjectStorageProvider, HeadObjectResult } from '../storage';
import { StoredFileCategory, MAX_SIGNED_URL_TTL_SECONDS } from '../constants/storage';
import { env } from '../config/environment';
import { ApiError } from '../utils/ApiError';

export interface UploadFileParams {
  category: StoredFileCategory;
  /** Tenant/owner scope segments, e.g. [organizationId, candidateId] — never a filename, email, or other PII. */
  scope: string[];
  buffer: Buffer;
  extension: string;
  contentType: string;
}

export interface UploadFileResult {
  provider: 's3' | 'local';
  objectKey: string;
  checksumSha256: string;
  sizeBytes: number;
}

export interface SignedReadUrlResult {
  url: string;
  expiresAt: Date;
}

/**
 * The ONLY path business services use to talk to object storage
 * (PR-STORAGE-2) — never call the AWS SDK or a provider class directly
 * from a controller/service. Centralizes safe object-key generation
 * (never a client filename), checksum computation, and signed-URL TTL
 * bounding.
 */
class FileStorageService {
  isProviderAvailable(): boolean {
    return getObjectStorageProvider() !== null;
  }

  async uploadFile(params: UploadFileParams): Promise<UploadFileResult> {
    const provider = this.requireProvider();
    const objectKey = this.buildObjectKey(params.category, params.scope, params.extension);
    const checksumSha256 = crypto.createHash('sha256').update(params.buffer).digest('hex');

    try {
      await provider.uploadObject({
        objectKey,
        body: params.buffer,
        contentType: params.contentType,
        contentLength: params.buffer.length,
      });
    } catch (error) {
      console.error('[FileStorageService] Upload failed', { objectKey, provider: provider.name, error });
      throw new ApiError(502, 'Failed to store the uploaded file. Please try again.', undefined, 'FILE_UPLOAD_FAILED');
    }

    return { provider: provider.name, objectKey, checksumSha256, sizeBytes: params.buffer.length };
  }

  /** Throws on failure — use when the caller must know a delete genuinely didn't happen (e.g. an explicit user-facing delete action). */
  async deleteFile(objectKey: string): Promise<void> {
    const provider = this.requireProvider();
    try {
      await provider.deleteObject(objectKey);
    } catch (error) {
      console.error('[FileStorageService] Delete failed', { objectKey, provider: provider.name, error });
      throw new ApiError(502, 'Failed to delete the stored file. Please try again.', undefined, 'FILE_DELETE_FAILED');
    }
  }

  /**
   * Best-effort — logged, never thrown. Use for compensating cleanup (e.g.
   * an orphaned upload after a DB write failed) where the caller has
   * nothing useful to do with a failure anyway. On a failed delete, a
   * STORAGE_DELETE_RETRY operational job is enqueued (PR-OPS-1) so the
   * orphaned object eventually gets cleaned up instead of staying orphaned
   * forever — this is still non-throwing/best-effort from the caller's
   * perspective; control flow here is unchanged.
   */
  async deleteFileBestEffort(objectKey: string, context?: string): Promise<void> {
    try {
      await this.deleteFile(objectKey);
    } catch (error) {
      console.error('[FileStorageService] Best-effort delete failed (leaves storage metadata inconsistent — safe for later cleanup)', {
        objectKey,
        context,
      });
      try {
        // Lazy import to avoid a hard circular dependency at module-load
        // time (OperationalJobService's STORAGE_DELETE_RETRY handler calls
        // back into this same file's deleteFile).
        const { operationalJobService } = await import('./OperationalJobService');
        const { OperationalJobType } = await import('../constants/operationalJob');
        await operationalJobService.enqueue({
          jobType: OperationalJobType.STORAGE_DELETE_RETRY,
          payload: { objectKey },
          idempotencyKey: `storage-delete-retry:${objectKey}`,
        });
      } catch (enqueueError) {
        console.error('[FileStorageService] Failed to enqueue STORAGE_DELETE_RETRY job — orphaned object may require manual cleanup', {
          objectKey,
          error: enqueueError instanceof Error ? enqueueError.message : String(enqueueError),
        });
      }
    }
  }

  async getSignedReadUrl(objectKey: string, expiresInSeconds?: number): Promise<SignedReadUrlResult> {
    const provider = this.requireProvider();
    const ttl = Math.min(Math.max(expiresInSeconds ?? env.storageSignedUrlTtlSeconds, 60), MAX_SIGNED_URL_TTL_SECONDS);
    try {
      const url = await provider.getSignedReadUrl(objectKey, ttl);
      return { url, expiresAt: new Date(Date.now() + ttl * 1000) };
    } catch (error) {
      console.error('[FileStorageService] Signed URL generation failed', { objectKey, provider: provider.name, error });
      throw new ApiError(502, 'Failed to generate file access. Please try again.', undefined, 'FILE_NOT_AVAILABLE');
    }
  }

  async headFile(objectKey: string): Promise<HeadObjectResult> {
    const provider = this.requireProvider();
    return provider.headObject(objectKey);
  }

  /**
   * Fetches the object's raw bytes for server-side reprocessing (e.g.
   * re-extracting text from a knowledge-base document) — never exposed to
   * a client. Implemented via a short-lived signed URL rather than a
   * provider-specific "download" method, so it works uniformly across
   * every ObjectStorageProvider without growing the interface.
   */
  async downloadFile(objectKey: string): Promise<Buffer> {
    const { url } = await this.getSignedReadUrl(objectKey, 60);
    const response = await fetch(url);
    if (!response.ok) {
      throw new ApiError(502, 'Failed to retrieve the stored file', undefined, 'FILE_NOT_AVAILABLE');
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private requireProvider(): ObjectStorageProvider {
    const provider = getObjectStorageProvider();
    if (!provider) {
      throw new ApiError(503, 'File storage is not configured', undefined, 'STORAGE_PROVIDER_UNAVAILABLE');
    }
    return provider;
  }

  /**
   * `env/category/scope.../yyyy/mm/uuid.ext` — deliberately never derived
   * from the client's original filename (which may contain PII like a
   * candidate's name) or any other sensitive value; `scope` segments are
   * expected to already be opaque IDs.
   */
  private buildObjectKey(category: StoredFileCategory, scope: string[], extension: string): string {
    const safeExtension = extension.replace(/[^a-z0-9.]/gi, '').toLowerCase();
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const safeScope = scope.map((segment) => segment.replace(/[^a-zA-Z0-9_-]/g, '')).filter(Boolean);
    return [env.nodeEnv, category, ...safeScope, String(yyyy), mm, `${crypto.randomUUID()}${safeExtension}`].join('/');
  }
}

export const fileStorageService = new FileStorageService();
