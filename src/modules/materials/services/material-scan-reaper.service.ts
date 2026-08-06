import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MaterialAuditAction, MaterialScanStatus } from '@prisma/client';

import { DatabaseService } from '../../../shared/database/database.service';
import { MaterialScanQueue } from '../jobs/material-scan.queue';

/**
 * Recorded on a version whose scan was retried to the limit without ever
 * producing a verdict. The status stays `quarantined`, which is the honest
 * reading: it was never cleared, so it is never downloadable. Marking it
 * `rejected` would be easier to sweep for, and would tell the owner their file
 * is malware when what actually happened is that we failed to check it.
 */
export const MATERIAL_SCAN_ABANDONED_ERROR_CODE = 'MATERIAL_SCAN_ABANDONED';

const REAP_BATCH_SIZE = 100;

type Candidate = { material_id: string; version: number };

/**
 * Releases Material Versions stranded before a scan verdict.
 *
 * Without this the queue makes things worse rather than better. A job lost to a
 * crash, a redeploy, or a Redis eviction leaves a version either stuck
 * `scanning` or sitting `quarantined` with nothing queued against it, and both
 * are undownloadable forever. The owner uploaded a file successfully and simply
 * cannot open it, with nothing anywhere to explain why.
 */
@Injectable()
export class MaterialScanReaperService {
  private readonly logger = new Logger(MaterialScanReaperService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly queue: MaterialScanQueue,
  ) {}

  private staleAfterMs(): number {
    return this.config.get<number>('MATERIAL_SCAN_STALE_AFTER_MS', 600_000);
  }

  private maxAttempts(): number {
    return this.config.get<number>('MATERIAL_SCAN_MAX_ATTEMPTS', 3);
  }

  async reapStale(
    now: Date,
  ): Promise<{ requeued: number; abandoned: number; skipped: number }> {
    const cutoff = new Date(now.getTime() - this.staleAfterMs());
    const totals = { requeued: 0, abandoned: 0, skipped: 0 };

    for (const candidate of await this.candidates(cutoff)) {
      try {
        const result = await this.reapOne(candidate);
        totals[result] += 1;
      } catch (error) {
        // One candidate losing a race must not abort the batch.
        this.logger.error(
          `Failed to reap Material ${candidate.material_id} version ${candidate.version}`,
          error instanceof Error ? error.stack : String(error),
        );
        totals.skipped += 1;
      }
    }

    if (totals.requeued > 0 || totals.abandoned > 0) {
      this.logger.warn(
        `Material scan sweep: ${totals.requeued} re-queued, ${totals.abandoned} abandoned`,
      );
    }
    return totals;
  }

  /**
   * Both stranded shapes in one query, because they need identical handling:
   * `scanning` past the window means a worker died holding the claim, and
   * `quarantined` past the window means nothing is queued against it. Versions
   * already abandoned carry an error code and are excluded, or the sweep would
   * pick them up forever.
   */
  private async candidates(cutoff: Date): Promise<Candidate[]> {
    return this.database.materialVersion.findMany({
      where: {
        updated_at: { lte: cutoff },
        purged_at: null,
        material: { deleted_at: null },
        OR: [
          { scan_status: MaterialScanStatus.scanning },
          {
            scan_status: MaterialScanStatus.quarantined,
            scan_error_code: null,
          },
        ],
      },
      orderBy: [{ updated_at: 'asc' }, { material_id: 'asc' }],
      take: REAP_BATCH_SIZE,
      select: { material_id: true, version: true },
    });
  }

  private async reapOne(
    candidate: Candidate,
  ): Promise<'requeued' | 'abandoned' | 'skipped'> {
    // Attempts are counted from the audit trail rather than a counter column,
    // because scan_started is written in the same transaction as the claim that
    // starts an attempt -- so the count cannot drift from what actually ran.
    const attempts = await this.database.materialAudit.count({
      where: {
        material_id: candidate.material_id,
        material_version: candidate.version,
        action: MaterialAuditAction.scan_started,
      },
    });

    if (attempts >= this.maxAttempts()) {
      return (await this.abandon(candidate, attempts)) ? 'abandoned' : 'skipped';
    }
    return (await this.requeue(candidate, attempts)) ? 'requeued' : 'skipped';
  }

  private async abandon(
    candidate: Candidate,
    attempts: number,
  ): Promise<boolean> {
    return this.database.$transaction(async (transaction) => {
      const claimed = await transaction.materialVersion.updateMany({
        where: {
          material_id: candidate.material_id,
          version: candidate.version,
          scan_status: {
            in: [MaterialScanStatus.quarantined, MaterialScanStatus.scanning],
          },
        },
        data: {
          scan_status: MaterialScanStatus.quarantined,
          scan_error_code: MATERIAL_SCAN_ABANDONED_ERROR_CODE,
        },
      });
      // A processor may have committed a verdict between the sweep query and
      // this claim, and a verdict beats an abandonment every time.
      if (claimed.count !== 1) return false;

      await transaction.materialAudit.create({
        data: {
          material_id: candidate.material_id,
          material_version: candidate.version,
          actor_id: null,
          action: MaterialAuditAction.scan_abandoned,
          to_status: MaterialScanStatus.quarantined,
          metadata: {
            payloadVersion: 1,
            attempts,
            errorCode: MATERIAL_SCAN_ABANDONED_ERROR_CODE,
            trigger: 'stale_material_scan_sweep',
          },
        },
      });
      return true;
    });
  }

  private async requeue(
    candidate: Candidate,
    attempts: number,
  ): Promise<boolean> {
    // Claim before enqueueing. Setting scan_status unconditionally would let
    // the sweep drag a version back out of `ready` after a verdict landed.
    const claimed = await this.database.materialVersion.updateMany({
      where: {
        material_id: candidate.material_id,
        version: candidate.version,
        scan_status: {
          in: [MaterialScanStatus.quarantined, MaterialScanStatus.scanning],
        },
      },
      // The write is what moves updated_at, which is what keeps the next sweep
      // from picking this row up again before the stale window has passed.
      data: {
        scan_status: MaterialScanStatus.quarantined,
        scan_error_code: null,
      },
    });
    if (claimed.count !== 1) return false;

    await this.queue.enqueueScan({
      materialId: candidate.material_id,
      version: candidate.version,
      attemptNumber: attempts + 1,
    });
    return true;
  }
}
