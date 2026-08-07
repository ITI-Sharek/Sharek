import { Injectable, Logger } from '@nestjs/common';
import { MaterialAuditAction } from '@prisma/client';

import { DatabaseService } from '../../../shared/database/database.service';
import { MaterialStorage } from '../storage/material-storage';

const PURGE_BATCH_SIZE = 100;

/**
 * Removes the content of deleted Materials, and nothing else.
 *
 * Deletion is two-phase on purpose. Revoking access is instant and must never
 * wait on storage; destroying bytes is slow, can fail halfway, and has to be
 * safe to repeat. Splitting them means a storage outage delays the purge
 * without ever delaying the revocation.
 *
 * Audit rows survive the purge. Deletion removes content, not the record that
 * content existed -- otherwise deleting a Material would also delete the
 * evidence of who uploaded it, who could read it, and when that ended.
 */
@Injectable()
export class MaterialPurgeService {
  private readonly logger = new Logger(MaterialPurgeService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly storage: MaterialStorage,
  ) {}

  /** Sweeps every version whose Material is deleted but whose bytes remain. */
  async purgePending(
    now: Date,
  ): Promise<{ purged: number; skipped: number }> {
    const pending = await this.database.materialVersion.findMany({
      where: { purged_at: null, material: { deleted_at: { not: null } } },
      orderBy: [{ material_id: 'asc' }, { version: 'asc' }],
      take: PURGE_BATCH_SIZE,
      select: { material_id: true, version: true, storage_key: true },
    });

    let purged = 0;
    let skipped = 0;
    for (const version of pending) {
      try {
        if (await this.purgeOne(version, now)) purged += 1;
        else skipped += 1;
      } catch (error) {
        // One unreadable object must not stop the rest of the batch. The row
        // keeps purged_at NULL, so the next sweep tries it again.
        this.logger.error(
          `Failed to purge Material ${version.material_id} version ${version.version}`,
          error instanceof Error ? error.stack : String(error),
        );
        skipped += 1;
      }
    }
    if (purged > 0) {
      this.logger.log(`Purged content for ${purged} Material version(s)`);
    }
    return { purged, skipped };
  }

  /** Purges one Material's versions, for the path that just deleted it. */
  async purgeMaterial(materialId: string, now: Date): Promise<number> {
    const versions = await this.database.materialVersion.findMany({
      where: { material_id: materialId, purged_at: null },
      orderBy: { version: 'asc' },
      select: { material_id: true, version: true, storage_key: true },
    });

    let purged = 0;
    for (const version of versions) {
      try {
        if (await this.purgeOne(version, now)) purged += 1;
      } catch (error) {
        // Deliberately not rethrown: the deletion has already taken effect and
        // must not be reported as failed because cleanup lagged. The sweep
        // retries what is left behind.
        this.logger.error(
          `Failed to purge Material ${materialId} version ${version.version}; leaving it to the sweep`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
    return purged;
  }

  /**
   * Bytes first, row second.
   *
   * The reverse order can strand content: a crash between stamping purged_at
   * and deleting the object would leave a version marked purged whose bytes
   * are still on disk, and nothing would ever look at it again. This order can
   * only produce the harmless failure -- object gone, row retried, delete a
   * no-op the second time.
   */
  private async purgeOne(
    version: { material_id: string; version: number; storage_key: string },
    now: Date,
  ): Promise<boolean> {
    await this.storage.delete(version.storage_key);

    return this.database.$transaction(async (transaction) => {
      const claimed = await transaction.materialVersion.updateMany({
        where: {
          material_id: version.material_id,
          version: version.version,
          purged_at: null,
        },
        data: { purged_at: now },
      });
      // Already purged by a concurrent sweep. Not an error: repeating a purge
      // has to be a no-op, or a retry after a partial failure is unsafe.
      if (claimed.count !== 1) return false;

      await transaction.materialAudit.create({
        data: {
          material_id: version.material_id,
          material_version: version.version,
          actor_id: null,
          action: MaterialAuditAction.purged,
          metadata: { payloadVersion: 1, trigger: 'material_purge_sweep' },
        },
      });
      return true;
    });
  }
}
