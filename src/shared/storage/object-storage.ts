import { Readable } from 'node:stream';

export type StoredObject = {
  storageKey: string;
  byteSize: number;
  contentHash: string;
};

export type PresignedGetUrl = {
  url: string;
  expiresAt: Date;
};

export type CreatePresignedGetUrlOptions = {
  expiresInSeconds: number;
  responseContentDisposition: string;
  responseContentType: string;
};

/**
 * Private object storage for bytes that must never live on local disk --
 * chat attachments, deliberately kept off {@link MaterialStorage}
 * (`modules/materials/storage/material-storage.ts`), whose binding to
 * `LocalMaterialStorage` this port does not touch.
 *
 * A port rather than a concrete client, matching `MaterialStorage`: every
 * domain rule above this line is expressed against the contract, not against
 * an S3 SDK, so swapping the adapter is a one-line change in the consuming
 * module.
 */
export abstract class ObjectStorage {
  /** Writes bytes under a caller-supplied key and reports the stored digest. */
  abstract put(storageKey: string, content: Buffer): Promise<StoredObject>;

  /** Opens a read stream. Callers must have already authorized the read. */
  abstract getStream(storageKey: string): Promise<Readable>;

  /** Idempotent: removing an object that is already gone is not an error. */
  abstract delete(storageKey: string): Promise<void>;

  abstract exists(storageKey: string): Promise<boolean>;

  /**
   * Mints a short-lived, single-object presigned GET. The caller must have
   * already re-authorized the read at mint time -- the URL itself carries no
   * further authorization check for the rest of its TTL.
   */
  abstract createPresignedGetUrl(
    storageKey: string,
    options: CreatePresignedGetUrlOptions,
  ): Promise<PresignedGetUrl>;
}
