import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MaterialStorage, StoredObject } from './material-storage';

/**
 * Local-filesystem adapter for {@link MaterialStorage}.
 *
 * The root lives outside the repository and is never served statically: every
 * read goes through the module's authorization path, so the only way to reach
 * bytes is an authorized, non-quarantined download. Replacing this with S3 or
 * MinIO later is a new adapter and a provider swap, nothing more.
 */
@Injectable()
export class LocalMaterialStorage extends MaterialStorage {
  private readonly logger = new Logger(LocalMaterialStorage.name);
  private readonly root: string;

  constructor(config: ConfigService) {
    super();
    this.root = resolve(
      config.get<string>('MATERIAL_STORAGE_ROOT', './.material-storage'),
    );
  }

  /**
   * Keys are generated, never derived from user input. A filename-derived key
   * would let `../` escape the root, and a content-derived key would leak the
   * fact that two Projects hold the same file.
   */
  static buildStorageKey(materialId: string, version: number): string {
    return join(materialId, `${version}-${randomUUID()}`);
  }

  async put(storageKey: string, content: Buffer): Promise<StoredObject> {
    const target = this.resolveWithinRoot(storageKey);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, { flag: 'wx' });
    return {
      storageKey,
      byteSize: content.byteLength,
      contentHash: createHash('sha256').update(content).digest('hex'),
    };
  }

  async getStream(storageKey: string): Promise<Readable> {
    return createReadStream(this.resolveWithinRoot(storageKey));
  }

  async delete(storageKey: string): Promise<void> {
    // force: true so purging an object that is already gone is a no-op, which
    // is what makes repeated purge attempts safe.
    await rm(this.resolveWithinRoot(storageKey), { force: true });
  }

  async exists(storageKey: string): Promise<boolean> {
    // Resolved outside the try on purpose: the catch below is for "no such
    // file", and swallowing a containment violation here would report a key
    // escaping the root as a plain absence.
    const target = this.resolveWithinRoot(storageKey);
    try {
      await stat(target);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Defence in depth. Keys are generated rather than user-supplied, but a
   * traversal here would read or delete arbitrary files, so the containment is
   * asserted rather than assumed.
   */
  private resolveWithinRoot(storageKey: string): string {
    const target = resolve(this.root, storageKey);
    if (target !== this.root && !target.startsWith(this.root + sep)) {
      this.logger.error(
        `Rejected Material storage key escaping the storage root: ${JSON.stringify(storageKey)}`,
      );
      throw new Error('Material storage key escapes the storage root');
    }
    return target;
  }
}
