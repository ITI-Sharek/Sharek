import { Injectable, Logger, Optional } from '@nestjs/common';
import { ChatAttachmentEventType, ChatAttachmentScanStatus, Prisma } from '@prisma/client';

import { DatabaseService } from '../../../shared/database/database.service';
import { MalwareScanVerdict, MalwareScanner } from '../../../shared/scanning/malware-scanner';
import { ObjectStorage } from '../../../shared/storage/object-storage';
import {
  CHAT_ATTACHMENT_INFECTED_ERROR_CODE,
} from '../chat-attachment.constants';
import { NotificationsService } from '../../notifications/notifications.service';

export type ChatAttachmentScanOutcome =
  | { outcome: 'ready' | 'rejected' }
  | { outcome: 'superseded'; reason: string };

/**
 * Raised when a conditional claim finds the attachment is no longer in the
 * status the claim required -- the reaper or a duplicate delivery got there
 * first. Swallowed by `process`; never an infrastructure failure.
 */
class ChatAttachmentSuperseded extends Error {
  constructor(readonly attachmentId: string) {
    super(`Chat attachment ${attachmentId} is no longer claimable`);
  }
}

type TerminalClaimRow = {
  message_id: string | null;
  conversation_id: string;
  uploaded_by: string;
  original_filename: string;
  event_version: number;
};

/**
 * Runs one malware scan on a worker and writes exactly one outcome, in the
 * same conditional-claim structure as `MaterialScanProcessorService`:
 * `quarantined -> scanning -> ready | rejected`.
 *
 * One divergence: there is no `ChatAttachmentAudit` table, so `scan_attempts`
 * is written as part of the claim itself rather than counted from an audit
 * trail. The terminal claim (`scanning -> ready|rejected`) is a single raw
 * `UPDATE ... RETURNING` rather than a Prisma `updateMany` + separate read,
 * because whether to write the outbox event depends on `message_id` as of
 * the *same instant* the status transition commits -- a read taken before or
 * after that instant could race a concurrent `sendMessage` bind and silently
 * skip the event.
 */
@Injectable()
export class ChatAttachmentScanProcessorService {
  private readonly logger = new Logger(ChatAttachmentScanProcessorService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly storage: ObjectStorage,
    private readonly scanner: MalwareScanner,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  async process(
    attachmentId: string,
    attemptNumber: number,
  ): Promise<ChatAttachmentScanOutcome> {
    const row = await this.database.chatAttachment.findUnique({
      where: { id: attachmentId },
      select: {
        storage_key: true,
        content_hash: true,
        mime_type: true,
        scan_status: true,
        purged_at: true,
      },
    });

    if (!row) {
      this.logger.warn(`Chat attachment ${attachmentId} no longer exists; nothing to scan`);
      return { outcome: 'superseded', reason: 'missing' };
    }
    if (row.purged_at) {
      return { outcome: 'superseded', reason: 'purged' };
    }
    if (row.scan_status !== ChatAttachmentScanStatus.quarantined) {
      return { outcome: 'superseded', reason: `status_${row.scan_status}` };
    }

    try {
      await this.claimScanning(attachmentId, attemptNumber);
    } catch (error) {
      if (error instanceof ChatAttachmentSuperseded) {
        return { outcome: 'superseded', reason: 'claim_lost' };
      }
      throw error;
    }

    let verdict: MalwareScanVerdict;
    try {
      verdict = await this.scanner.scan({
        subject: { kind: 'chat_attachment', id: attachmentId },
        content: await this.readContent(row.storage_key),
        mimeType: row.mime_type,
        contentHash: row.content_hash,
      });
    } catch (error) {
      // Release before rethrowing, or a retry finds `scanning` and treats
      // itself as superseded -- stranding the attachment until the reaper
      // notices, for a fault the retry could have fixed seconds later.
      await this.release(attachmentId);
      this.logger.error(
        `Malware scan failed for chat attachment ${attachmentId}; released for retry`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }

    try {
      if (verdict.verdict === 'infected') {
        const claim = await this.claimTerminal({
          attachmentId,
          to: ChatAttachmentScanStatus.rejected,
          scanErrorCode: CHAT_ATTACHMENT_INFECTED_ERROR_CODE,
        });
        this.logger.warn(
          `Chat attachment ${attachmentId} rejected: ${verdict.signature}`,
        );
        await this.notifyBlocked(attachmentId, claim);
        return { outcome: 'rejected' };
      }

      await this.claimTerminal({ attachmentId, to: ChatAttachmentScanStatus.ready });
      return { outcome: 'ready' };
    } catch (error) {
      if (error instanceof ChatAttachmentSuperseded) {
        this.logger.warn(
          `Chat attachment ${attachmentId} was resolved by another actor mid-scan; discarding this verdict`,
        );
        return { outcome: 'superseded', reason: 'claim_lost' };
      }
      throw error;
    }
  }

  private async claimScanning(
    attachmentId: string,
    attemptNumber: number,
  ): Promise<void> {
    const claimed = await this.database.chatAttachment.updateMany({
      where: { id: attachmentId, scan_status: ChatAttachmentScanStatus.quarantined },
      data: {
        scan_status: ChatAttachmentScanStatus.scanning,
        scan_attempts: attemptNumber,
      },
    });
    if (claimed.count !== 1) throw new ChatAttachmentSuperseded(attachmentId);
  }

  private async release(attachmentId: string): Promise<void> {
    try {
      await this.database.chatAttachment.updateMany({
        where: { id: attachmentId, scan_status: ChatAttachmentScanStatus.scanning },
        data: { scan_status: ChatAttachmentScanStatus.quarantined },
      });
    } catch (error) {
      this.logger.error(
        `Failed to release chat attachment ${attachmentId} after a failed scan`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Atomic `scanning -> to` transition that only writes the outbox event
   * (and only bumps `event_version`) when the row is already bound to a
   * Message at the instant the UPDATE commits. A scan that finishes before
   * binding -- the common case -- records state and emits nothing; the
   * `conversation.message.created` payload carries the state at send time.
   */
  private async claimTerminal(input: {
    attachmentId: string;
    to: typeof ChatAttachmentScanStatus.ready | typeof ChatAttachmentScanStatus.rejected;
    scanErrorCode?: string;
  }): Promise<TerminalClaimRow> {
    return this.database.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<TerminalClaimRow[]>(Prisma.sql`
        UPDATE "ChatAttachment"
        SET "scan_status" = ${input.to}::"ChatAttachmentScanStatus",
            "scan_error_code" = ${input.scanErrorCode ?? null},
            "scanned_at" = now(),
            "event_version" = CASE
              WHEN "message_id" IS NOT NULL THEN "event_version" + 1
              ELSE "event_version"
            END
        WHERE "id" = ${input.attachmentId}::uuid
          AND "scan_status" = ${ChatAttachmentScanStatus.scanning}::"ChatAttachmentScanStatus"
        RETURNING "message_id", "conversation_id", "uploaded_by", "original_filename", "event_version"
      `);
      if (rows.length !== 1) {
        throw new ChatAttachmentSuperseded(input.attachmentId);
      }
      const row = rows[0];

      if (row.message_id) {
        await transaction.chatAttachmentEvent.create({
          data: {
            attachment_id: input.attachmentId,
            conversation_id: row.conversation_id,
            event_type: ChatAttachmentEventType.scan_state_changed,
            scan_status: input.to,
            aggregate_version: row.event_version,
          },
        });
      }
      return row;
    });
  }

  private async notifyBlocked(
    attachmentId: string,
    row: TerminalClaimRow,
  ): Promise<void> {
    if (!this.notifications) return;
    try {
      await this.notifications.createChatAttachmentBlockedNotification({
        userId: row.uploaded_by,
        conversationId: row.conversation_id,
        attachmentId,
        filename: row.original_filename,
      });
    } catch (error) {
      // The scan verdict is already committed and is the fact that matters;
      // losing the notification only means the sender learns about the block
      // from the tombstone in the thread instead of the bell.
      this.logger.error(
        `Failed to notify uploader ${row.uploaded_by} about a blocked chat attachment`,
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
}
