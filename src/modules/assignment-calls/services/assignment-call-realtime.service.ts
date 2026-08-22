import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssignmentCallEventType } from '@prisma/client';

import { DatabaseService } from '../../../shared/database/database.service';
import { createRealtimeEventEnvelope } from '../../../shared/realtime/realtime-event-envelope';
import { RealtimePublisherService } from '../../../shared/realtime/realtime-publisher.service';
import { toAssignmentCallResponseDto } from '../assignment-call-presentation';

const EVENT_TYPE_NAME: Record<AssignmentCallEventType, string> = {
  ringing: 'assignment_call.ringing',
  answered: 'assignment_call.answered',
  declined: 'assignment_call.declined',
  ended: 'assignment_call.ended',
  availability_changed: 'assignment_call.availability_changed',
};

/**
 * Durable Assignment Call lifecycle events. Structurally identical to
 * `assignment-conversation-realtime.service.ts::publishCreated`: load the
 * outbox row, build the envelope, deliver to both participants, and record
 * `published_at`/`publish_attempts`/`REALTIME_UNAVAILABLE` on the same row
 * either way. Never carries a TURN credential, SDP, or ICE candidate --
 * those travel only as transient `assignment_call.signal` socket commands,
 * never through this durable channel.
 */
@Injectable()
export class AssignmentCallRealtimeService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly publisher: RealtimePublisherService,
  ) {}

  async publishRinging(eventId: string): Promise<boolean> {
    return this.publish(eventId);
  }

  async publishAnswered(eventId: string): Promise<boolean> {
    return this.publish(eventId);
  }

  async publishDeclined(eventId: string): Promise<boolean> {
    return this.publish(eventId);
  }

  async publishEnded(eventId: string): Promise<boolean> {
    return this.publish(eventId);
  }

  private async publish(eventId: string): Promise<boolean> {
    if (!this.publisher.isEnabled()) return false;

    const event = await this.database.assignmentCallEvent.findUnique({
      where: { id: eventId },
      include: {
        call: {
          include: {
            caller: { select: { first_name: true, last_name: true } },
            callee: { select: { first_name: true, last_name: true } },
          },
        },
      },
    });
    if (!event) return false;

    const maxDurationSeconds =
      this.config.get<number>('ASSIGNMENT_CALL_MAX_DURATION_MS', 3_600_000) / 1000;
    const envelope = createRealtimeEventEnvelope({
      eventId: event.id,
      type: EVENT_TYPE_NAME[event.event_type],
      occurredAt: event.occurred_at,
      aggregateId: event.call_id,
      aggregateVersion: event.aggregate_version,
      payload: {
        call: toAssignmentCallResponseDto(event.call, maxDurationSeconds),
      },
    });

    const callerDelivered = this.publisher.publishToUser(event.call.caller_id, envelope);
    const calleeDelivered = this.publisher.publishToUser(event.call.callee_id, envelope);
    const delivered = callerDelivered && calleeDelivered;

    try {
      await this.database.assignmentCallEvent.update({
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
}
