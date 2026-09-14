import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ObjectStorageProvider, UploadObjectParams, HeadObjectResult } from './ObjectStorageProvider';

export interface S3ProviderConfig {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  forcePathStyle?: boolean;
}

/**
 * Real S3-compatible integration (PR-STORAGE-2) via AWS SDK v3. Works
 * against real AWS S3 (leave `endpoint` unset) or any S3-compatible
 * provider (Cloudflare R2, MinIO, etc — set `endpoint` +
 * `forcePathStyle`). Credentials are private fields, never exposed on the
 * object in a way a caller could serialize.
 */
export class S3ObjectStorageProvider implements ObjectStorageProvider {
  readonly name = 's3' as const;
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor(config: S3ProviderConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      endpoint: config.endpoint || undefined,
      forcePathStyle: config.forcePathStyle,
    });
  }

  async uploadObject(params: UploadObjectParams): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: params.objectKey,
        Body: params.body,
        ContentType: params.contentType,
        ContentLength: params.contentLength,
        Metadata: params.metadata,
      })
    );
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }));
  }

  async getSignedReadUrl(objectKey: string, expiresInSeconds: number): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: objectKey });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async headObject(objectKey: string): Promise<HeadObjectResult> {
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }));
      return { exists: true, sizeBytes: result.ContentLength, contentType: result.ContentType };
    } catch (error: any) {
      if (error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404) {
        return { exists: false };
      }
      throw error;
    }
  }
}
