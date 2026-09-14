import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ObjectStorageProvider, UploadObjectParams, HeadObjectResult } from './ObjectStorageProvider';

export interface LocalProviderConfig {
  rootDir: string;
  /** Used to HMAC-sign the dev-only "read URL" — see routes/devStorage.routes.ts. Never used for anything security-critical beyond local development. */
  signingSecret: string;
  /** Base URL the signed dev-read link is built against, e.g. `${APP_BASE_URL}/api/v1`. */
  publicBaseUrl: string;
}

/**
 * Local filesystem provider (PR-STORAGE-2) — development/tests ONLY. The
 * factory in `storage/index.ts` refuses to construct this when
 * `NODE_ENV==='production'`, regardless of `STORAGE_PROVIDER`'s value, so a
 * misconfigured production deployment falls through to
 * STORAGE_PROVIDER_UNAVAILABLE instead of silently using disk. Object keys
 * are resolved with a strict containment check (defense in depth — keys
 * only ever originate from this backend's own safe key generator, never
 * from client input) to prevent path traversal.
 */
export class LocalObjectStorageProvider implements ObjectStorageProvider {
  readonly name = 'local' as const;
  private readonly rootDir: string;
  private readonly signingSecret: string;
  private readonly publicBaseUrl: string;

  constructor(config: LocalProviderConfig) {
    this.rootDir = path.resolve(config.rootDir);
    this.signingSecret = config.signingSecret;
    this.publicBaseUrl = config.publicBaseUrl.replace(/\/$/, '');
  }

  async uploadObject(params: UploadObjectParams): Promise<void> {
    const absolutePath = this.resolvePath(params.objectKey);
    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.promises.writeFile(absolutePath, params.body);
  }

  async deleteObject(objectKey: string): Promise<void> {
    const absolutePath = this.resolvePath(objectKey);
    try {
      await fs.promises.unlink(absolutePath);
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /** Returns a signed URL to this process's own dev-storage read route (see routes/devStorage.routes.ts) — never a real cloud presigned URL, since there is no real bucket in local mode. */
  async getSignedReadUrl(objectKey: string, expiresInSeconds: number): Promise<string> {
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    const signature = this.sign(objectKey, expiresAt);
    const params = new URLSearchParams({ key: objectKey, exp: String(expiresAt), sig: signature });
    return `${this.publicBaseUrl}/dev-storage/read?${params.toString()}`;
  }

  async headObject(objectKey: string): Promise<HeadObjectResult> {
    const absolutePath = this.resolvePath(objectKey);
    try {
      const stat = await fs.promises.stat(absolutePath);
      return { exists: true, sizeBytes: stat.size };
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        return { exists: false };
      }
      throw error;
    }
  }

  /** Used by the dev-storage read route to verify a signed link before streaming bytes. */
  verifySignedAccess(objectKey: string, expiresAtMs: number, signature: string): boolean {
    if (Number.isNaN(expiresAtMs) || expiresAtMs < Date.now()) {
      return false;
    }
    const expected = this.sign(objectKey, expiresAtMs);
    const expectedBuf = Buffer.from(expected, 'hex');
    const providedBuf = Buffer.from(signature, 'hex');
    if (expectedBuf.length !== providedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  }

  /** Exposed so the dev-storage route can stream the same resolved, containment-checked path. */
  resolveAbsolutePath(objectKey: string): string {
    return this.resolvePath(objectKey);
  }

  private sign(objectKey: string, expiresAtMs: number): string {
    return crypto.createHmac('sha256', this.signingSecret).update(`${objectKey}:${expiresAtMs}`).digest('hex');
  }

  private resolvePath(objectKey: string): string {
    const absolutePath = path.join(this.rootDir, objectKey);
    const normalizedRoot = this.rootDir + path.sep;
    if (absolutePath !== this.rootDir && !absolutePath.startsWith(normalizedRoot)) {
      throw new Error('Resolved object key escapes the local storage root');
    }
    return absolutePath;
  }
}
