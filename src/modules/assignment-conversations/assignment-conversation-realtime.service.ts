import { Injectable } from '@nestjs/common';
import { MessageEventType } from '@prisma/client';

import { DatabaseService } from '../../shared/database/database.service';
import { createRealtimeEventEnvelope } from '../../shared/realtime/realtime-event-envelope';
import { RealtimePublisherService } from '../../shared/realtime/realtime-publisher.service';

@Injectable()
export class AssignmentConversationRealtimeService {
  constructor(
    private readonly database: DatabaseService,
    private readonly publisher: RealtimePublisherService,
  ) {}

  async publishCreated(eventId: string): Promise<boolean> {
    if (!this.publisher.isEnabled()) return false;

    const event = await this.database.messageEvent.findUnique({
      where: { id: eventId },
      include: {
        message: {
          include: {
            sender: { select: { first_name: true, last_name: true } },
          },
        },
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
    if (!event || event.event_type !== MessageEventType.created) return false;

    const message = event.message;
    const envelope = createRealtimeEventEnvelope({
      eventId: event.id,
      type: 'conversation.message.created',
      occurredAt: event.occurred_at,
      aggregateId: event.conversation_id,
      aggregateVersion: event.aggregate_version,
      payload: {
        message: {
          messageId: message.id,
          conversationId: message.conversation_id,
          sequence: message.sequence,
          senderId: message.sender_id,
          senderName: this.displayName(message.sender, message.sender_id),
          body: message.body,
          replyToMessageId: message.reply_to_message_id,
          createdAt: message.created_at,
          editedAt: message.edited_at,
          retractedAt: message.retracted_at,
        },
      },
    });
    const assignment = event.conversation.assignment;
    const ownerDelivered = this.publisher.publishToUser(
      assignment.contributionRequest.owner_id,
      envelope,
    );
    const contributorDelivered = this.publisher.publishToUser(
      assignment.contributor_id,
      envelope,
    );
    const delivered = ownerDelivered && contributorDelivered;

    try {
      await this.database.messageEvent.update({
        where: { id: event.id },
        data: delivered
          ? {
              published_at: new Date(),
              publish_attempts: { increment: 1 },
              last_publish_error_code: null,
            }
          : {
              publish_attempts: { increment: 1 },
              last_publish_error_code: 'REALTIME_UNAVAILABLE',
            },
      });
    } catch {
      // Duplicate handoff is safe because the persisted event ID is stable.
    }

    return delivered;
  }

  private displayName(
    user: { first_name: string; last_name: string } | undefined,
    fallback: string,
  ): string {
    const name = user ? `${user.first_name} ${user.last_name}`.trim() : '';
    return name || fallback;
  }
}
