import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { ApplicationError } from '../errors/application.error';
import {
  CreatePresignedGetUrlOptions,
  ObjectStorage,
  PresignedGetUrl,
  StoredObject,
} from './object-storage';

export type S3ObjectStorageScope = {
  /** The bucket this instance is bound to. Never included in a thrown error. */
  bucket: string;
  /** Every key this instance is asked to touch must start with this prefix. */
  keyPrefix: string;
};

/**
 * `@aws-sdk/client-s3` adapter for {@link ObjectStorage}.
 *
 * One instance is scoped to one bucket and one key prefix, bound by the
 * consuming module's provider factory -- this class reads only the generic
 * S3 connection settings (region, endpoint, credentials, encryption), never a
 * feature-specific bucket name, so it stays reusable beyond chat attachments.
 */
@Injectable()
export class S3ObjectStorage extends ObjectStorage {
  private readonly logger = new Logger(S3ObjectStorage.name);
  private readonly client: S3Client;
  private readonly presigningClient: S3Client;
  private readonly bucket: string;
  private readonly keyPrefix: string;
  private readonly serverSideEncryption: string;
  private readonly kmsKeyId: string;

  constructor(config: ConfigService, scope: S3ObjectStorageScope) {
    super();
    this.bucket = scope.bucket;
    this.keyPrefix = scope.keyPrefix;
    this.serverSideEncryption = config.get<string>(
      'S3_SERVER_SIDE_ENCRYPTION',
      'AES256',
    );
    this.kmsKeyId = config.get<string>('S3_KMS_KEY_ID', '');

    const accessKeyId = config.get<string>('S3_ACCESS_KEY_ID', '');
    const endpoint = config.get<string>('S3_ENDPOINT', '');
    const clientOptions = {
      region: config.get<string>('S3_REGION', 'us-east-1'),
      requestHandler: {
        requestTimeout: config.get<number>('S3_REQUEST_TIMEOUT_MS', 15_000),
      },
      // Empty in production is the correct value: it lets the SDK default
      // provider chain (env -> SSO -> IMDS/IRSA) apply instead of a static
      // secret that would otherwise sit in configuration.
      ...(accessKeyId
        ? {
            credentials: {
              accessKeyId,
              secretAccessKey: config.get<string>('S3_SECRET_ACCESS_KEY', ''),
            },
          }
        : {}),
      // Only set for MinIO in local/dev; a real AWS endpoint is resolved from
      // the region alone.
      ...(endpoint
        ? {
            endpoint,
            forcePathStyle: config.get<boolean>('S3_FORCE_PATH_STYLE', false),
          }
        : {}),
    };
    this.client = new S3Client(clientOptions);

    const publicEndpoint = config.get<string>('S3_PUBLIC_ENDPOINT', '');
    // The endpoint is part of the SigV4 canonical request. A URL signed for
    // Docker's `minio:9000` hostname cannot be rewritten to `localhost:9000`
    // after signing without invalidating the signature, so use a second client
    // when the browser-facing endpoint differs from the server-facing one.
    this.presigningClient = publicEndpoint
      ? new S3Client({
          ...clientOptions,
          endpoint: publicEndpoint,
          forcePathStyle: config.get<boolean>('S3_FORCE_PATH_STYLE', false),
        })
      : this.client;
  }

  async put(storageKey: string, content: Buffer): Promise<StoredObject> {
    const key = this.withinPrefix(storageKey);
    const contentHash = createHash('sha256').update(content).digest('hex');
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: content,
          ...(this.serverSideEncryption
            ? {
                ServerSideEncryption: this.serverSideEncryption as
                  | 'AES256'
                  | 'aws:kms',
              }
            : {}),
          ...(this.kmsKeyId ? { SSEKMSKeyId: this.kmsKeyId } : {}),
          ChecksumAlgorithm: 'SHA256',
        }),
      );
    } catch (error) {
      throw this.mapError('put', key, error);
    }
    return { storageKey, byteSize: content.byteLength, contentHash };
  }

  async getStream(storageKey: string): Promise<Readable> {
    const key = this.withinPrefix(storageKey);
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const body = response.Body;
      if (!body || !(body instanceof Readable)) {
        throw new Error('S3 object body was not a readable stream');
      }
      return body;
    } catch (error) {
      throw this.mapError('getStream', key, error);
    }
  }

  async delete(storageKey: string): Promise<void> {
    const key = this.withinPrefix(storageKey);
    try {
      // Idempotent by design: S3 DeleteObject on a missing key still
      // succeeds, which is what makes repeated purge attempts safe.
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      throw this.mapError('delete', key, error);
    }
  }

  async exists(storageKey: string): Promise<boolean> {
    const key = this.withinPrefix(storageKey);
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch (error) {
      if (this.isNotFound(error)) return false;
      throw this.mapError('exists', key, error);
    }
  }

  async createPresignedGetUrl(
    storageKey: string,
    options: CreatePresignedGetUrlOptions,
  ): Promise<PresignedGetUrl> {
    const key = this.withinPrefix(storageKey);
    try {
      const url = await getSignedUrl(
        this.presigningClient,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ResponseContentDisposition: options.responseContentDisposition,
          ResponseContentType: options.responseContentType,
        }),
        { expiresIn: options.expiresInSeconds },
      );
      return {
        url,
        expiresAt: new Date(Date.now() + options.expiresInSeconds * 1000),
      };
    } catch (error) {
      throw this.mapError('createPresignedGetUrl', key, error);
    }
  }

  /**
   * Defence in depth, mirroring `LocalMaterialStorage.resolveWithinRoot`.
   * Keys are generated by the caller, never user-supplied, but this instance
   * is bound to one bucket and one prefix and must never be asked to touch an
   * object outside it.
   */
  private withinPrefix(storageKey: string): string {
    if (!storageKey.startsWith(this.keyPrefix)) {
      this.logger.error(
        `Rejected object storage key escaping the configured prefix: ${JSON.stringify(storageKey)}`,
      );
      throw new Error('Object storage key escapes the configured prefix');
    }
    return storageKey;
  }

  private isNotFound(error: unknown): boolean {
    return (
      error instanceof S3ServiceException &&
      (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404)
    );
  }

  /**
   * Never includes the bucket name in what's thrown -- only in what's logged.
   * The bucket is infrastructure detail; leaking it in an error surfaced to a
   * client would hand out one more fact about internal topology for free.
   */
  private mapError(operation: string, key: string, error: unknown): Error {
    this.logger.error(
      `Object storage ${operation} failed for key ${key}`,
      error instanceof Error ? error.stack : String(error),
    );
    return new ApplicationError(
      'Object storage is temporarily unavailable',
      'OBJECT_STORAGE_UNAVAILABLE',
      503,
    );
  }
}
