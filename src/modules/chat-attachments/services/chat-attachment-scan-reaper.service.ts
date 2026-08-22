import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatAttachmentScanStatus } from '@prisma/client';

import { DatabaseService } from '../../../shared/database/database.service';
import { CHAT_ATTACHMENT_SCAN_ABANDONED_ERROR_CODE } from '../chat-attachment.constants';
import { ChatAttachmentScanQueue } from '../jobs/chat-attachment-scan.queue';

const REAP_BATCH_SIZE = 100;

type Candidate = { id: string; scan_attempts: number };

/**
 * Releases chat attachments stranded before a scan verdict, mirroring
 * `MaterialScanReaperService`. One divergence: `scan_attempts` is a direct
 * column here (no audit table to count from), so the reap decision reads it
 * straight off the candidate row.
 */
@Injectable()
export class ChatAttachmentScanReaperService {
  private readonly logger = new Logger(ChatAttachmentScanReaperService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly queue: ChatAttachmentScanQueue,
  ) {}

  private staleAfterMs(): number {
    return this.config.get<number>('CHAT_ATTACHMENT_SCAN_STALE_AFTER_MS', 600_000);
  }

  private maxAttempts(): number {
    return this.config.get<number>('CHAT_ATTACHMENT_SCAN_MAX_ATTEMPTS', 3);
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
        this.logger.error(
          `Failed to reap chat attachment ${candidate.id}`,
          error instanceof Error ? error.stack : String(error),
        );
        totals.skipped += 1;
      }
    }

    if (totals.requeued > 0 || totals.abandoned > 0) {
      this.logger.warn(
        `Chat attachment scan sweep: ${totals.requeued} re-queued, ${totals.abandoned} abandoned`,
      );
    }
    return totals;
  }

  /**
   * Both stranded shapes in one query: `scanning` past the window means a
   * worker died holding the claim, and `quarantined` past the window means
   * nothing is queued against it. Already-abandoned rows carry an error code
   * and are excluded, or the sweep would pick them up forever.
   */
  private async candidates(cutoff: Date): Promise<Candidate[]> {
    return this.database.chatAttachment.findMany({
      where: {
        updated_at: { lte: cutoff },
        purged_at: null,
        OR: [
          { scan_status: ChatAttachmentScanStatus.scanning },
          { scan_status: ChatAttachmentScanStatus.quarantined, scan_error_code: null },
        ],
      },
      orderBy: [{ updated_at: 'asc' }, { id: 'asc' }],
      take: REAP_BATCH_SIZE,
      select: { id: true, scan_attempts: true },
    });
  }

  private async reapOne(
    candidate: Candidate,
  ): Promise<'requeued' | 'abandoned' | 'skipped'> {
    if (candidate.scan_attempts >= this.maxAttempts()) {
      return (await this.abandon(candidate)) ? 'abandoned' : 'skipped';
    }
    return (await this.requeue(candidate)) ? 'requeued' : 'skipped';
  }

  /**
   * Stays `quarantined`, never `rejected` -- "scan unavailable" must never be
   * presented as a malware claim.
   */
  private async abandon(candidate: Candidate): Promise<boolean> {
    const claimed = await this.database.chatAttachment.updateMany({
      where: {
        id: candidate.id,
        scan_status: {
          in: [ChatAttachmentScanStatus.quarantined, ChatAttachmentScanStatus.scanning],
        },
      },
      data: {
        scan_status: ChatAttachmentScanStatus.quarantined,
        scan_error_code: CHAT_ATTACHMENT_SCAN_ABANDONED_ERROR_CODE,
      },
    });
    // A processor may have committed a verdict between the sweep query and
    // this claim, and a verdict beats an abandonment every time.
    return claimed.count === 1;
  }

  private async requeue(candidate: Candidate): Promise<boolean> {
    const claimed = await this.database.chatAttachment.updateMany({
      where: {
        id: candidate.id,
        scan_status: {
          in: [ChatAttachmentScanStatus.quarantined, ChatAttachmentScanStatus.scanning],
        },
      },
      // The write is what moves updated_at, which is what keeps the next
      // sweep from picking this row up again before the stale window passes.
      data: { scan_status: ChatAttachmentScanStatus.quarantined, scan_error_code: null },
    });
    if (claimed.count !== 1) return false;

    await this.queue.enqueueScan({
      attachmentId: candidate.id,
      attemptNumber: candidate.scan_attempts + 1,
    });
    return true;
  }
}
