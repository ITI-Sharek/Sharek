import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DatabaseService } from '../../../shared/database/database.service';
import {
  ChatAttachmentPublicationOutcome,
  ChatAttachmentRealtimeService,
} from './chat-attachment-realtime.service';

const EVENT_RECOVERY_BATCH_SIZE = 100;

export interface ChatAttachmentEventRecoverySummary {
  selected: number;
  attempted: number;
  published: number;
  unavailable: number;
  exhausted: number;
  skipped: number;
}

/**
 * Sweeps unpublished `ChatAttachmentEvent` rows, modelled on
 * `NotificationEventRecoveryService`. Unlike notifications' recovery worker,
 * this runs as one of the three sweeps on the shared scan-reap tick rather
 * than its own queue -- chat attachments do not yet justify a fourth BullMQ
 * repeating job.
 *
 * This is also the first recovery sweep for anything in
 * `assignment-conversations`: `MessageEvent` has no equivalent, so
 * `conversation.message.created` is at-least-once with no retry today.
 * Generalizing this sweep to cover `MessageEvent` is a small follow-up once
 * it exists here.
 */
@Injectable()
export class ChatAttachmentEventRecoveryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly realtime: ChatAttachmentRealtimeService,
    private readonly config: ConfigService,
  ) {}

  async recoverPending(now = new Date()): Promise<ChatAttachmentEventRecoverySummary> {
    const events = await this.database.chatAttachmentEvent.findMany({
      where: {
        published_at: null,
        occurred_at: { lte: now },
        publish_attempts: { lt: this.maxPublishAttempts() },
      },
      orderBy: [{ occurred_at: 'asc' }, { id: 'asc' }],
      take: EVENT_RECOVERY_BATCH_SIZE,
    });

    const summary: ChatAttachmentEventRecoverySummary = {
      selected: events.length,
      attempted: 0,
      published: 0,
      unavailable: 0,
      exhausted: 0,
      skipped: 0,
    };

    for (const event of events) {
      let outcome: ChatAttachmentPublicationOutcome;
      try {
        outcome = await this.realtime.publishEvent(event);
      } catch {
        summary.attempted += 1;
        outcome = await this.realtime.recordFailedAttempt(event, 'REALTIME_RECOVERY_ERROR');
        this.recordOutcome(summary, outcome);
        continue;
      }

      if (outcome === 'disabled' || outcome === 'not_found' || outcome === 'unbound') {
        summary.skipped += 1;
        continue;
      }

      summary.attempted += 1;
      this.recordOutcome(summary, outcome);
    }

    return summary;
  }

  private recordOutcome(
    summary: ChatAttachmentEventRecoverySummary,
    outcome: ChatAttachmentPublicationOutcome,
  ): void {
    if (outcome === 'published') summary.published += 1;
    if (outcome === 'unavailable') summary.unavailable += 1;
    if (outcome === 'retry_exhausted') summary.exhausted += 1;
  }

  private maxPublishAttempts(): number {
    return Math.max(
      1,
      this.config.get<number>('CHAT_ATTACHMENT_EVENT_MAX_PUBLISH_ATTEMPTS', 5),
    );
  }
}
