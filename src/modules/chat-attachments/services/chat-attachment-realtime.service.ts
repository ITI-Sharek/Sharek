import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatAttachmentEvent } from '@prisma/client';

import { DatabaseService } from '../../../shared/database/database.service';
import { createRealtimeEventEnvelope } from '../../../shared/realtime/realtime-event-envelope';
import { RealtimePublisherService } from '../../../shared/realtime/realtime-publisher.service';
import { toAttachmentScanState } from '../chat-attachment-presentation';

export type ChatAttachmentPublicationOutcome =
  | 'published'
  | 'unavailable'
  | 'retry_exhausted'
  | 'disabled'
  | 'not_found'
  | 'unbound';

/**
 * Publishes `attachment.scan_state_changed`, structurally identical to
 * `AssignmentConversationRealtimeService.publishCreated` -- same
 * `published_at` / `publish_attempts` / `REALTIME_UNAVAILABLE` bookkeeping,
 * delivered to both conversation participants.
 */
@Injectable()
export class ChatAttachmentRealtimeService {
  constructor(
    private readonly database: DatabaseService,
    private readonly publisher: RealtimePublisherService,
    private readonly config: ConfigService,
  ) {}

  async publishScanStateChanged(eventId: string): Promise<boolean> {
    if (!this.publisher.isEnabled()) return false;

    const event = await this.database.chatAttachmentEvent.findUnique({
      where: { id: eventId },
    });
    if (!event) return false;
    return (await this.publishEvent(event)) === 'published';
  }

  async publishEvent(
    event: ChatAttachmentEvent,
  ): Promise<ChatAttachmentPublicationOutcome> {
    if (!this.publisher.isEnabled()) return 'disabled';

    const attachment = await this.database.chatAttachment.findUnique({
      where: { id: event.attachment_id },
      select: {
        message_id: true,
        original_filename: true,
        byte_size: true,
        mime_type: true,
        caption: true,
        scan_status: true,
        scan_error_code: true,
        conversation: {
          select: {
            assignment: {
              select: {
                contributor_id: true,
                contributionRequest: { select: { owner_id: true } },
              },
            },
          },
        },
      },
    });
    if (!attachment) return 'not_found';
    // Only emit for bound attachments. A recipient must never be told about
    // an attachment on a message that doesn't exist.
    if (!attachment.message_id) return 'unbound';

    const envelope = createRealtimeEventEnvelope({
      eventId: event.id,
      type: 'attachment.scan_state_changed',
      occurredAt: event.occurred_at,
      aggregateId: event.attachment_id,
      aggregateVersion: event.aggregate_version,
      payload: {
        attachmentId: event.attachment_id,
        messageId: attachment.message_id,
        filename: attachment.original_filename,
        byteSize: attachment.byte_size,
        mimeType: attachment.mime_type,
        caption: attachment.caption,
        scanState: toAttachmentScanState(attachment.scan_status, attachment.scan_error_code),
      },
    });

    const assignment = attachment.conversation.assignment;
    const ownerDelivered = this.publisher.publishToUser(
      assignment.contributionRequest.owner_id,
      envelope,
    );
    const contributorDelivered = this.publisher.publishToUser(
      assignment.contributor_id,
      envelope,
    );
    const delivered = ownerDelivered && contributorDelivered;

    return this.recordAttempt(event, delivered);
  }

  async recordFailedAttempt(
    event: ChatAttachmentEvent,
    errorCode: 'REALTIME_RECOVERY_ERROR' = 'REALTIME_RECOVERY_ERROR',
  ): Promise<ChatAttachmentPublicationOutcome> {
    if (!this.publisher.isEnabled()) return 'disabled';
    return this.recordAttempt(event, false, errorCode);
  }

  private async recordAttempt(
    event: ChatAttachmentEvent,
    delivered: boolean,
    errorCode: 'REALTIME_UNAVAILABLE' | 'REALTIME_RECOVERY_ERROR' = 'REALTIME_UNAVAILABLE',
  ): Promise<ChatAttachmentPublicationOutcome> {
    const nextAttempts = event.publish_attempts + 1;
    const exhausted = !delivered && nextAttempts >= this.maxPublishAttempts();
    try {
      await this.database.chatAttachmentEvent.update({
        where: { id: event.id },
        data: delivered
          ? {
              published_at: new Date(),
              publish_attempts: { increment: 1 },
              last_publish_error_code: null,
            }
          : {
              publish_attempts: { increment: 1 },
              last_publish_error_code: exhausted
                ? 'REALTIME_RETRY_EXHAUSTED'
                : errorCode,
            },
      });
    } catch {
      // Duplicate handoff is safe because the persisted event ID is stable.
    }

    if (delivered) return 'published';
    return exhausted ? 'retry_exhausted' : 'unavailable';
  }

  private maxPublishAttempts(): number {
    return Math.max(
      1,
      this.config.get<number>('CHAT_ATTACHMENT_EVENT_MAX_PUBLISH_ATTEMPTS', 5),
    );
  }
}
