import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';

import { DatabaseService } from '../../../shared/database/database.service';
import {
  REALTIME_SOCKET_DISCONNECTED_EVENT,
  RealtimeSocketDisconnectedEvent,
} from '../../../shared/events/realtime-socket-disconnected.event';
import { RealtimePublisherService } from '../../../shared/realtime/realtime-publisher.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { CALL_SELECT, CallRecord } from './assignment-call.select';
import { AssignmentCallAuthorizationService } from './assignment-call-authorization.service';
import { AssignmentCallQueue } from '../jobs/assignment-call.queue';
import { AssignmentCallRealtimeService } from './assignment-call-realtime.service';

/**
 * Every server-authoritative timer transition from §4.6: the ring-timeout
 * sweep, the reconnect-grace expiry, and the max-duration cap. All three end
 * a call the same conditional way `AssignmentCallsService` does -- claim,
 * release participations, write the outbox row, publish after commit -- the
 * difference is these are system-triggered, so their outbox row carries no
 * `command_idempotency_key`.
 */
@Injectable()
export class AssignmentCallTimersService {
  private readonly logger = new Logger(AssignmentCallTimersService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly queue: AssignmentCallQueue,
    private readonly realtime: AssignmentCallRealtimeService,
    private readonly publisher: RealtimePublisherService,
    private readonly authorization: AssignmentCallAuthorizationService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  /**
   * A socket disconnecting is not itself a call event -- most disconnects
   * are unrelated to any call. This only matters when the user holds an
   * `active` participation on a currently `answered` call, in which case the
   * grace clock starts. A prompt reconnect (any tab, any socket) cancels it
   * before it fires, which is what makes "arm unconditionally on every
   * disconnect" safe rather than needing to first check whether the user has
   * some other still-connected socket.
   */
  @OnEvent(REALTIME_SOCKET_DISCONNECTED_EVENT)
  async handleSocketDisconnected(event: RealtimeSocketDisconnectedEvent): Promise<void> {
    const participation = await this.database.assignmentCallParticipation.findFirst({
      where: {
        user_id: event.userId,
        active: true,
        call: { outcome: 'answered', ended_at: null },
      },
      select: { call_id: true },
    });
    if (!participation) return;

    await this.database.assignmentCallParticipation.updateMany({
      where: { call_id: participation.call_id, user_id: event.userId, active: true },
      data: { disconnected_at: new Date() },
    });
    await this.queue.armReconnectGrace(participation.call_id, event.userId);
  }

  async handleRingTimeout(callId: string): Promise<void> {
    const call = await this.claimTerminal({
      callId,
      fromOutcomes: ['ringing'],
      terminalOutcome: 'missed',
      endReason: 'ring_timeout',
    });
    if (!call) return;

    await this.queue.cancelRingTimeout(callId);
    this.authorization.invalidate(callId);
    await this.realtime.publishEnded(call.eventId).catch(() => {});
    await this.notifyMissed(call.call);
  }

  async handleReconnectGraceExpired(callId: string, userId: string): Promise<void> {
    const participation = await this.database.assignmentCallParticipation.findUnique({
      where: { call_id_user_id: { call_id: callId, user_id: userId } },
      select: { disconnected_at: true },
    });
    // Already reconnected: `reconnect()` clears `disconnected_at` and
    // cancels this job, but a job already dequeued by the worker races it,
    // so this is the belt to that suspenders.
    if (!participation?.disconnected_at) return;

    const call = await this.claimTerminal({
      callId,
      fromOutcomes: ['answered'],
      terminalOutcome: 'ended',
      endReason: 'reconnect_timeout',
    });
    if (!call) return;

    await Promise.all([
      this.queue.cancelDurationTimers(callId),
      this.queue.cancelReconnectGrace(callId, call.call.caller_id),
      this.queue.cancelReconnectGrace(callId, call.call.callee_id),
    ]);
    this.authorization.invalidate(callId);
    await this.realtime.publishEnded(call.eventId).catch(() => {});
  }

  async handleMaxDurationReached(callId: string): Promise<void> {
    const call = await this.claimTerminal({
      callId,
      fromOutcomes: ['answered'],
      terminalOutcome: 'ended',
      endReason: 'max_duration',
    });
    if (!call) return;

    await Promise.all([
      this.queue.cancelReconnectGrace(callId, call.call.caller_id),
      this.queue.cancelReconnectGrace(callId, call.call.callee_id),
    ]);
    this.authorization.invalidate(callId);
    await this.realtime.publishEnded(call.eventId).catch(() => {});
  }

  /** Transient -- a dropped warning costs nothing, the client counts down from `answeredAt` regardless. */
  async handleDurationWarning(callId: string, warningIndex: number): Promise<void> {
    const call = await this.database.assignmentCall.findUnique({
      where: { id: callId },
      select: { outcome: true, caller_id: true, callee_id: true },
    });
    if (!call || call.outcome !== 'answered') return;

    const payload = { callId, warningIndex };
    this.publisher.publishTransientToUser(call.caller_id, 'assignment_call.duration_warning', payload);
    this.publisher.publishTransientToUser(call.callee_id, 'assignment_call.duration_warning', payload);
  }

  /** Ends calls stuck `ringing` well past their timeout, and clears orphan `active` participations on terminal calls. */
  async sweep(now: Date): Promise<void> {
    const ringTimeoutMs = this.config.get<number>('ASSIGNMENT_CALL_RING_TIMEOUT_MS', 30_000);
    const stuckRinging = await this.database.assignmentCall.findMany({
      where: {
        outcome: 'ringing',
        started_at: { lte: new Date(now.getTime() - ringTimeoutMs * 2) },
      },
      select: { id: true },
      take: 100,
    });
    for (const stuck of stuckRinging) {
      try {
        await this.handleRingTimeout(stuck.id);
      } catch (error) {
        this.logger.error(
          `Failed to sweep stuck-ringing Assignment Call ${stuck.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    // A user permanently "busy" from one lost terminal write is the one
    // failure mode this whole design cannot tolerate silently.
    const orphaned = await this.database.assignmentCallParticipation.updateMany({
      where: { active: true, call: { ended_at: { not: null } } },
      data: { active: false, left_at: now },
    });
    if (orphaned.count > 0) {
      this.logger.warn(`Cleared ${orphaned.count} orphaned active participation(s)`);
    }
  }

  private async claimTerminal(input: {
    callId: string;
    fromOutcomes: Prisma.EnumAssignmentCallOutcomeFilter['in'];
    terminalOutcome: 'missed' | 'ended';
    endReason: string;
  }): Promise<{ call: CallRecord; eventId: string } | null> {
    return this.database.$transaction(async (transaction) => {
      const before = await transaction.assignmentCall.findUnique({
        where: { id: input.callId },
        select: CALL_SELECT,
      });
      if (!before) return null;

      const now = new Date();
      const claimed = await transaction.assignmentCall.updateMany({
        where: { id: input.callId, outcome: { in: input.fromOutcomes } },
        data: {
          outcome: input.terminalOutcome,
          ended_at: now,
          end_reason: input.endReason,
          aggregate_version: { increment: 1 },
          ...(before.answered_at
            ? {
                duration_seconds: Math.max(
                  0,
                  Math.floor((now.getTime() - before.answered_at.getTime()) / 1000),
                ),
              }
            : {}),
        },
      });
      if (claimed.count !== 1) return null;

      await transaction.assignmentCallParticipation.updateMany({
        where: { call_id: input.callId, active: true },
        data: { active: false, left_at: now },
      });
      const event = await transaction.assignmentCallEvent.create({
        data: {
          call_id: input.callId,
          event_type: 'ended',
          aggregate_version: before.aggregate_version + 1,
          command_idempotency_key: null,
        },
      });
      const call = await transaction.assignmentCall.findUniqueOrThrow({
        where: { id: input.callId },
        select: CALL_SELECT,
      });
      return { call, eventId: event.id };
    });
  }

  private async notifyMissed(call: CallRecord): Promise<void> {
    if (!this.notifications) return;
    try {
      await this.notifications.createMissedCallNotification({
        userId: call.callee_id,
        callId: call.id,
        conversationId: call.conversation_id,
        callerName: `${call.caller.first_name} ${call.caller.last_name}`.trim(),
      });
    } catch (error) {
      this.logger.error(
        `Failed to create missed-call notification for Assignment Call ${call.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
