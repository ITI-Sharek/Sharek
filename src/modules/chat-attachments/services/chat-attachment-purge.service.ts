import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DatabaseService } from '../../../shared/database/database.service';
import { ObjectStorage } from '../../../shared/storage/object-storage';

const PURGE_BATCH_SIZE = 100;

type PurgeCandidate = { id: string; storage_key: string };

/**
 * Removes chat attachment bytes, mirroring `MaterialPurgeService`'s
 * bytes-first-then-row ordering: a crash between the two can only strand a
 * purged-looking row that still points at deleted bytes (harmless, retried
 * as a no-op delete) rather than an orphan object nothing ever revisits.
 *
 * Two sweep classes are live:
 *
 * 1. Expired unbound intents -- `message_id IS NULL AND expires_at <= now`.
 *    Always active; this is what reclaims an abandoned upload.
 * 2. 12-month terminal retention -- `conversation.read_only_at <= now -
 *    CHAT_ATTACHMENT_RETENTION_MONTHS`.
 *
 * Sweep 2 is dead code on arrival: nothing in the repository currently
 * writes `AssignmentConversationStatus.read_only`, so no conversation ever
 * has a `read_only_at`. It ships anyway so retention takes effect the moment
 * that transition lands elsewhere, rather than needing this sweep written
 * later under time pressure. See the module README for the full gap,
 * including the not-yet-built 30-day warning notification.
 */
@Injectable()
export class ChatAttachmentPurgeService {
  private readonly logger = new Logger(ChatAttachmentPurgeService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly storage: ObjectStorage,
    private readonly config: ConfigService,
  ) {}

  async purgePending(now: Date): Promise<{ purged: number; skipped: number }> {
    const expiredIntents = await this.sweep(
      () =>
        this.database.chatAttachment.findMany({
          where: { message_id: null, expires_at: { lte: now }, purged_at: null },
          orderBy: [{ conversation_id: 'asc' }, { created_at: 'asc' }],
          take: PURGE_BATCH_SIZE,
          select: { id: true, storage_key: true },
        }),
      now,
    );

    const retentionCutoff = this.retentionCutoff(now);
    const terminalRetention = await this.sweep(
      () =>
        this.database.chatAttachment.findMany({
          where: {
            purged_at: null,
            conversation: { read_only_at: { lte: retentionCutoff } },
          },
          orderBy: [{ conversation_id: 'asc' }, { created_at: 'asc' }],
          take: PURGE_BATCH_SIZE,
          select: { id: true, storage_key: true },
        }),
      now,
    );

    const purged = expiredIntents.purged + terminalRetention.purged;
    const skipped = expiredIntents.skipped + terminalRetention.skipped;
    if (purged > 0) {
      this.logger.log(`Purged content for ${purged} chat attachment(s)`);
    }
    return { purged, skipped };
  }

  private retentionCutoff(now: Date): Date {
    const months = this.config.get<number>('CHAT_ATTACHMENT_RETENTION_MONTHS', 12);
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - months);
    return cutoff;
  }

  private async sweep(
    load: () => Promise<PurgeCandidate[]>,
    now: Date,
  ): Promise<{ purged: number; skipped: number }> {
    const candidates = await load();
    let purged = 0;
    let skipped = 0;
    for (const candidate of candidates) {
      try {
        if (await this.purgeOne(candidate, now)) purged += 1;
        else skipped += 1;
      } catch (error) {
        // One unreadable object must not stop the rest of the batch. The row
        // keeps purged_at NULL, so the next sweep tries it again.
        this.logger.error(
          `Failed to purge chat attachment ${candidate.id}`,
          error instanceof Error ? error.stack : String(error),
        );
        skipped += 1;
      }
    }
    return { purged, skipped };
  }

  /** Bytes first, row second -- see the class doc for why. */
  private async purgeOne(candidate: PurgeCandidate, now: Date): Promise<boolean> {
    await this.storage.delete(candidate.storage_key);

    const claimed = await this.database.chatAttachment.updateMany({
      where: { id: candidate.id, purged_at: null },
      data: { purged_at: now },
    });
    // Already purged by a concurrent sweep -- not an error; repeating a purge
    // must be a no-op, or a retry after a partial failure is unsafe.
    return claimed.count === 1;
  }
}
