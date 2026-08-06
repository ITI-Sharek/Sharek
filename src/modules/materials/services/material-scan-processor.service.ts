import { Injectable, Logger } from '@nestjs/common';
import {
  MaterialAuditAction,
  MaterialScanStatus,
  Prisma,
} from '@prisma/client';

import { DatabaseService } from '../../../shared/database/database.service';
import { MalwareScanVerdict, MalwareScanner } from '../scanning/malware-scanner';
import { MaterialStorage } from '../storage/material-storage';

/** Recorded on a version the scanner reported as malware. */
export const MATERIAL_SCAN_INFECTED_ERROR_CODE = 'MATERIAL_SCAN_INFECTED';

export type MaterialScanOutcome =
  | { outcome: 'ready' | 'rejected' }
  | { outcome: 'superseded'; reason: string };

/**
 * Raised when a conditional claim finds the version is no longer in the status
 * the claim required, meaning the reaper or a duplicate delivery got there
 * first. Rolls the enclosing transaction back and is swallowed by `process`; it
 * is never an infrastructure failure and must not reach the worker.
 */
class MaterialVersionSuperseded extends Error {
  constructor(
    readonly materialId: string,
    readonly version: number,
  ) {
    super(`Material ${materialId} version ${version} is no longer claimable`);
  }
}

/**
 * Runs one malware scan on a worker and writes exactly one outcome.
 *
 * The state machine is `quarantined -> scanning -> ready | rejected`, and every
 * transition is a conditional claim rather than a write: a duplicate delivery
 * and the reaper can both be acting on the same version at the same moment, and
 * the claim is the only thing that makes one of them lose.
 */
@Injectable()
export class MaterialScanProcessorService {
  private readonly logger = new Logger(MaterialScanProcessorService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly storage: MaterialStorage,
    private readonly scanner: MalwareScanner,
  ) {}

  /**
   * Infrastructure failures -- unreadable storage, an unreachable scanner --
   * are rethrown so BullMQ retries them, after releasing the version back to
   * `quarantined` so the retry has something to claim. A scanner that cannot
   * answer must never leave a version looking scanned.
   */
  async process(
    materialId: string,
    version: number,
    attemptNumber: number,
  ): Promise<MaterialScanOutcome> {
    const row = await this.database.materialVersion.findUnique({
      where: { material_id_version: { material_id: materialId, version } },
      select: {
        storage_key: true,
        content_hash: true,
        mime_type: true,
        scan_status: true,
        purged_at: true,
        material: { select: { deleted_at: true } },
      },
    });

    if (!row) {
      this.logger.warn(
        `Material ${materialId} version ${version} no longer exists; nothing to scan`,
      );
      return { outcome: 'superseded', reason: 'missing' };
    }
    if (row.material.deleted_at) {
      return { outcome: 'superseded', reason: 'deleted' };
    }
    if (row.purged_at) {
      return { outcome: 'superseded', reason: 'purged' };
    }
    if (row.scan_status !== MaterialScanStatus.quarantined) {
      return { outcome: 'superseded', reason: `status_${row.scan_status}` };
    }

    try {
      await this.claim({
        materialId,
        version,
        from: MaterialScanStatus.quarantined,
        to: MaterialScanStatus.scanning,
        action: MaterialAuditAction.scan_started,
        attemptNumber,
      });
    } catch (error) {
      if (error instanceof MaterialVersionSuperseded) {
        return { outcome: 'superseded', reason: 'claim_lost' };
      }
      throw error;
    }

    let verdict: MalwareScanVerdict;
    try {
      verdict = await this.scanner.scan({
        materialId,
        version,
        content: await this.readContent(row.storage_key),
        mimeType: row.mime_type,
        contentHash: row.content_hash,
      });
    } catch (error) {
      // Release before rethrowing, or the retry finds `scanning` and treats
      // itself as superseded -- which would strand the version until the reaper
      // notices, for a fault the retry could have fixed seconds later.
      await this.release(materialId, version);
      this.logger.error(
        `Malware scan failed for Material ${materialId} version ${version}; released for retry`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }

    try {
      if (verdict.verdict === 'infected') {
        await this.claim({
          materialId,
          version,
          from: MaterialScanStatus.scanning,
          to: MaterialScanStatus.rejected,
          action: MaterialAuditAction.scan_rejected,
          attemptNumber,
          scanErrorCode: MATERIAL_SCAN_INFECTED_ERROR_CODE,
          metadata: { signature: verdict.signature },
        });
        this.logger.warn(
          `Material ${materialId} version ${version} rejected: ${verdict.signature}`,
        );
        return { outcome: 'rejected' };
      }

      await this.claim({
        materialId,
        version,
        from: MaterialScanStatus.scanning,
        to: MaterialScanStatus.ready,
        action: MaterialAuditAction.scan_cleared,
        attemptNumber,
      });
      return { outcome: 'ready' };
    } catch (error) {
      if (error instanceof MaterialVersionSuperseded) {
        this.logger.warn(
          `Material ${materialId} version ${version} was resolved by another actor mid-scan; discarding this verdict`,
        );
        return { outcome: 'superseded', reason: 'claim_lost' };
      }
      throw error;
    }
  }

  /**
   * Conditional status transition plus its audit row, in one transaction.
   *
   * The `from` status in the predicate is what makes this safe: two workers
   * holding the same job, or a worker racing the reaper, both issue this update
   * and exactly one sees a row count of 1.
   */
  private async claim(input: {
    materialId: string;
    version: number;
    from: MaterialScanStatus;
    to: MaterialScanStatus;
    action: MaterialAuditAction;
    attemptNumber: number;
    scanErrorCode?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const now = new Date();
    await this.database.$transaction(async (transaction) => {
      const claimed = await transaction.materialVersion.updateMany({
        where: {
          material_id: input.materialId,
          version: input.version,
          scan_status: input.from,
        },
        data: {
          scan_status: input.to,
          scan_error_code: input.scanErrorCode ?? null,
          scanned_at:
            input.to === MaterialScanStatus.ready ||
            input.to === MaterialScanStatus.rejected
              ? now
              : null,
        },
      });
      if (claimed.count !== 1) {
        throw new MaterialVersionSuperseded(input.materialId, input.version);
      }
      await this.writeAudit(transaction, {
        materialId: input.materialId,
        version: input.version,
        action: input.action,
        from: input.from,
        to: input.to,
        metadata: { attemptNumber: input.attemptNumber, ...input.metadata },
      });
    });
  }

  /**
   * Returns a version to `quarantined` after a scan that could not produce a
   * verdict. Conditional on `scanning` so it cannot undo a verdict another
   * worker just wrote.
   */
  private async release(materialId: string, version: number): Promise<void> {
    try {
      await this.database.materialVersion.updateMany({
        where: {
          material_id: materialId,
          version,
          scan_status: MaterialScanStatus.scanning,
        },
        data: { scan_status: MaterialScanStatus.quarantined },
      });
    } catch (error) {
      // The scan failure is the one worth surfacing; losing the release only
      // means the reaper handles it later, which is what the reaper is for.
      this.logger.error(
        `Failed to release Material ${materialId} version ${version} after a failed scan`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async readContent(storageKey: string): Promise<Buffer> {
    const stream = await this.storage.getStream(storageKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  private async writeAudit(
    transaction: Prisma.TransactionClient,
    input: {
      materialId: string;
      version: number;
      action: MaterialAuditAction;
      from: MaterialScanStatus;
      to: MaterialScanStatus;
      metadata: Record<string, unknown>;
    },
  ): Promise<void> {
    await transaction.materialAudit.create({
      data: {
        material_id: input.materialId,
        material_version: input.version,
        // No actor: the scanner is the system, and attributing a machine
        // verdict to the uploader would make the audit trail lie about who
        // decided what.
        actor_id: null,
        action: input.action,
        from_status: input.from,
        to_status: input.to,
        metadata: { payloadVersion: 1, ...input.metadata },
      },
    });
  }
}
