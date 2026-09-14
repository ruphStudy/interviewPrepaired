import { env } from '../config/environment';
import { ObjectStorageProvider } from './ObjectStorageProvider';
import { S3ObjectStorageProvider } from './S3ObjectStorageProvider';
import { LocalObjectStorageProvider } from './LocalObjectStorageProvider';

export * from './ObjectStorageProvider';

let cachedProvider: ObjectStorageProvider | null | undefined;

/**
 * Single factory for the active object storage provider (PR-STORAGE-2).
 * Returns `null` — never throws, never a silent local-disk fallback — when
 * no real provider is configured, so callers uniformly surface
 * STORAGE_PROVIDER_UNAVAILABLE. `local` is REFUSED outright in production
 * regardless of `STORAGE_PROVIDER`'s value — a misconfigured production
 * deployment falls through to `null` rather than durably writing user data
 * to ephemeral local disk.
 */
export function getObjectStorageProvider(): ObjectStorageProvider | null {
  if (cachedProvider !== undefined) {
    return cachedProvider;
  }

  if (env.storageProvider === 's3' && env.storageBucket && env.awsRegion && env.awsAccessKeyId && env.awsSecretAccessKey) {
    cachedProvider = new S3ObjectStorageProvider({
      bucket: env.storageBucket,
      region: env.awsRegion,
      accessKeyId: env.awsAccessKeyId,
      secretAccessKey: env.awsSecretAccessKey,
      endpoint: env.storageEndpoint || undefined,
      forcePathStyle: env.storageForcePathStyle,
    });
    return cachedProvider;
  }

  if (env.storageProvider === 'local' && env.nodeEnv !== 'production') {
    cachedProvider = new LocalObjectStorageProvider({
      rootDir: env.localStoragePath,
      signingSecret: env.jwtSecret,
      publicBaseUrl: `${env.appBaseUrl || `http://localhost:${env.port}`}/api/v1`,
    });
    return cachedProvider;
  }

  cachedProvider = null;
  return cachedProvider;
}

/** Only meaningful for the local provider's dev-storage read route — safe to call unconditionally. */
export function getLocalObjectStorageProvider(): LocalObjectStorageProvider | null {
  const provider = getObjectStorageProvider();
  return provider instanceof LocalObjectStorageProvider ? provider : null;
}
