import { Readable } from 'node:stream';

export type StoredObject = {
  storageKey: string;
  byteSize: number;
  contentHash: string;
};

/**
 * Private storage for raw Material bytes.
 *
 * A port rather than a concrete client on purpose: the spec calls for private
 * object storage, and every domain rule above this line -- quarantine,
 * visibility, short-lived access, purge -- is expressed against this contract
 * rather than against a filesystem or an S3 SDK. Swapping the adapter must not
 * require touching the module.
 *
 * Implementations must treat writes as immutable: a replacement Material is a
 * new version with a new key, never an overwrite.
 */
export abstract class MaterialStorage {
  /** Writes bytes under a caller-supplied key and reports the stored digest. */
  abstract put(storageKey: string, content: Buffer): Promise<StoredObject>;

  /** Opens a read stream. Callers must have already authorized the read. */
  abstract getStream(storageKey: string): Promise<Readable>;

  /** Idempotent: removing an object that is already gone is not an error. */
  abstract delete(storageKey: string): Promise<void>;

  abstract exists(storageKey: string): Promise<boolean>;
}
