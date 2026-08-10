import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DatabaseService } from '../../shared/database/database.service';
import {
  NotificationPublicationOutcome,
  NotificationRealtimeService,
} from './notification-realtime.service';

export interface NotificationEventRecoverySummary {
  selected: number;
  attempted: number;
  published: number;
  unavailable: number;
  exhausted: number;
  skipped: number;
}

@Injectable()
export class NotificationEventRecoveryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly realtime: NotificationRealtimeService,
    private readonly config: ConfigService,
  ) {}

  async recoverPending(
    now = new Date(),
  ): Promise<NotificationEventRecoverySummary> {
    const events = await this.database.notificationEvent.findMany({
      where: {
        published_at: null,
        occurred_at: { lte: now },
        publish_attempts: { lt: this.maxPublishAttempts() },
      },
      orderBy: [{ occurred_at: 'asc' }, { id: 'asc' }],
      take: this.batchSize(),
    });
    const summary: NotificationEventRecoverySummary = {
      selected: events.length,
      attempted: 0,
      published: 0,
      unavailable: 0,
      exhausted: 0,
      skipped: 0,
    };

    for (const event of events) {
      let outcome: NotificationPublicationOutcome;
      try {
        outcome = await this.realtime.publishEvent(event);
      } catch {
        summary.attempted += 1;
        outcome = await this.realtime.recordFailedAttempt(
          event,
          'REALTIME_RECOVERY_ERROR',
        );
        this.recordOutcome(summary, outcome);
        continue;
      }

      if (outcome === 'disabled' || outcome === 'not_found') {
        summary.skipped += 1;
        continue;
      }

      summary.attempted += 1;
      this.recordOutcome(summary, outcome);
    }

    return summary;
  }

  private recordOutcome(
    summary: NotificationEventRecoverySummary,
    outcome: NotificationPublicationOutcome,
  ): void {
    if (outcome === 'published') summary.published += 1;
    if (outcome === 'unavailable') summary.unavailable += 1;
    if (outcome === 'retry_exhausted') summary.exhausted += 1;
  }

  private batchSize(): number {
    return Math.max(
      1,
      this.config.get<number>('NOTIFICATION_EVENT_RECOVERY_BATCH_SIZE', 100),
    );
  }

  private maxPublishAttempts(): number {
    return Math.max(
      1,
      this.config.get<number>('NOTIFICATION_EVENT_MAX_PUBLISH_ATTEMPTS', 5),
    );
  }
}
