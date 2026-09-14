/**
 * Provider-neutral object storage contract (PR-STORAGE-2). Business
 * services (FileStorageService, and everything above it) only ever import
 * this interface plus the `getObjectStorageProvider()` factory — never a
 * concrete provider class or an AWS SDK type directly.
 */

export interface UploadObjectParams {
  objectKey: string;
  body: Buffer;
  contentType: string;
  contentLength?: number;
  /** Bounded, non-sensitive key/value context only — never a secret. */
  metadata?: Record<string, string>;
}

export interface HeadObjectResult {
  exists: boolean;
  sizeBytes?: number;
  contentType?: string;
}

export interface ObjectStorageProvider {
  readonly name: 's3' | 'local';

  uploadObject(params: UploadObjectParams): Promise<void>;
  deleteObject(objectKey: string): Promise<void>;
  /** Time-limited, single-purpose read URL — never persisted as a durable DB field. */
  getSignedReadUrl(objectKey: string, expiresInSeconds: number): Promise<string>;
  headObject(objectKey: string): Promise<HeadObjectResult>;
}
