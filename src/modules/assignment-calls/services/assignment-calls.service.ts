import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssignmentCallOutcome, Prisma } from '@prisma/client';

import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { DatabaseService } from '../../../shared/database/database.service';
import {
  ApplicationError,
  ConflictApplicationError,
  ForbiddenApplicationError,
  NotFoundApplicationError,
} from '../../../shared/errors/application.error';
import { AssignmentConversationsService } from '../../assignment-conversations/assignment-conversations.service';
import { toAssignmentCallResponseDto } from '../assignment-call-presentation';
import {
  AssignmentCallResponseDto,
  JoinCredentialsDto,
  StartOrAnswerCallResponseDto,
} from '../dto/assignment-call-response.dto';
import { AssignmentCallQueue } from '../jobs/assignment-call.queue';
import { AssignmentCallAuthorizationService } from './assignment-call-authorization.service';
import { AssignmentCallCapacityService } from './assignment-call-capacity.service';
import { AssignmentCallIceService } from './assignment-call-ice.service';
import { AssignmentCallRealtimeService } from './assignment-call-realtime.service';
import { CALL_SELECT, CallRecord } from './assignment-call.select';

/**
 * Assignment Call commands: start/answer/decline/end/reconnect.
 *
 * Follows `sendMessage`'s house style -- idempotent HTTP command, a Postgres
 * transaction with a conditional (never unconditional) state transition,
 * an outbox row, and realtime publication strictly after commit. The one
 * durable invariant no application code enforces directly is "one active
 * call per user, platform-wide": that is a raw partial unique index on
 * `AssignmentCallParticipation` (see the `assignment_calls` migration), and
 * every method here that inserts an `active` participation row simply lets
 * Postgres reject the second one.
 */
@Injectable()
export class AssignmentCallsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly conversations: AssignmentConversationsService,
    private readonly ice: AssignmentCallIceService,
    private readonly queue: AssignmentCallQueue,
    private readonly realtime: AssignmentCallRealtimeService,
    private readonly capacity: AssignmentCallCapacityService,
    private readonly authorization: AssignmentCallAuthorizationService,
  ) {}

  async start(input: {
    actor: AuthenticatedUser;
    conversationId: string;
    idempotencyKey: string;
  }): Promise<StartOrAnswerCallResponseDto> {
    this.assertEnabled();
    const participation = await this.conversations.getParticipation(
      input.actor.id,
      input.conversationId,
    );
    if (participation.status !== 'active') {
      throw new ConflictApplicationError(
        'This conversation is read-only',
        'ASSIGNMENT_CONVERSATION_READ_ONLY',
      );
    }
    if (await this.capacity.isExhausted()) {
      throw new ApplicationError(
        'Calling is temporarily unavailable',
        'ASSIGNMENT_CALL_FREE_CAPACITY_EXHAUSTED',
        503,
      );
    }
    // "Attempted calls become missed calls, and callers see only
    // Unavailable" (COMMUNICATION.md DEC-057): rejected before any row
    // exists, so the caller sees the same "unavailable" shape as a busy
    // peer -- never a hint that quiet hours specifically were the reason.
    if (await this.isCalleeInQuietHours(participation.peerId)) {
      throw new ConflictApplicationError(
        'Participant unavailable',
        'ASSIGNMENT_CALL_QUIET_HOURS',
      );
    }

    const callId = randomUUID();
    const now = new Date();
    let result: { call: CallRecord; ringingEventId: string | null };
    try {
      result = await this.database.$transaction(async (transaction) => {
        const existing = await transaction.assignmentCall.findUnique({
          where: {
            caller_id_idempotency_key: {
              caller_id: input.actor.id,
              idempotency_key: input.idempotencyKey,
            },
          },
          select: CALL_SELECT,
        });
        if (existing) {
          if (existing.conversation_id !== input.conversationId) {
            throw new ConflictApplicationError(
              'This idempotency key was already used to start a different call',
              'ASSIGNMENT_CALL_IDEMPOTENCY_CONFLICT',
            );
          }
          return { call: existing, ringingEventId: null };
        }

        await transaction.assignmentCall.create({
          data: {
            id: callId,
            conversation_id: input.conversationId,
            caller_id: input.actor.id,
            callee_id: participation.peerId,
            outcome: 'ringing',
            started_at: now,
            idempotency_key: input.idempotencyKey,
          },
        });
        // One statement, two rows: if either the caller or the callee is
        // already busy elsewhere, the partial unique index rejects this
        // statement atomically and neither row -- nor the AssignmentCall
        // row above -- survives the transaction.
        await transaction.assignmentCallParticipation.createMany({
          data: [
            {
              call_id: callId,
              user_id: input.actor.id,
              role: 'caller',
              active: true,
              joined_at: now,
            },
            {
              call_id: callId,
              user_id: participation.peerId,
              role: 'callee',
              active: true,
            },
          ],
        });
        const event = await transaction.assignmentCallEvent.create({
          data: {
            call_id: callId,
            event_type: 'ringing',
            aggregate_version: 1,
            command_idempotency_key: input.idempotencyKey,
          },
        });
        const call = await transaction.assignmentCall.findUniqueOrThrow({
          where: { id: callId },
          select: CALL_SELECT,
        });
        return { call, ringingEventId: event.id };
      });
    } catch (error) {
      throw this.mapStartError(error);
    }

    if (result.ringingEventId) {
      await Promise.all([
        this.queue.armRingTimeout(result.call.id),
        this.realtime.publishRinging(result.ringingEventId),
      ]).catch(() => {
        // The committed AssignmentCall and its outbox row remain
        // authoritative; a missed timer arm or publish is recovered by the
        // sweep and the event-recovery pass respectively.
      });
    }

    return this.presentStartOrAnswer(result.call, input.actor.id);
  }

  async answer(input: {
    actor: AuthenticatedUser;
    callId: string;
    idempotencyKey: string;
  }): Promise<StartOrAnswerCallResponseDto> {
    this.assertEnabled();
    const now = new Date();
    let result: { call: CallRecord; answeredEventId: string | null };
    try {
      result = await this.database.$transaction(async (transaction) => {
        const call = await this.loadForActor(transaction, input.callId, input.actor.id);

        const existingEvent = await transaction.assignmentCallEvent.findUnique({
          where: {
            call_id_event_type_command_idempotency_key: {
              call_id: input.callId,
              event_type: 'answered',
              command_idempotency_key: input.idempotencyKey,
            },
          },
        });
        if (existingEvent) return { call, answeredEventId: null };

        if (call.callee_id !== input.actor.id) {
          throw this.callNotFound();
        }
        if (call.outcome !== 'ringing') {
          throw new ConflictApplicationError(
            'This call can no longer be answered',
            'ASSIGNMENT_CALL_INVALID_STATE',
          );
        }

        const claimed = await transaction.assignmentCall.updateMany({
          where: { id: input.callId, outcome: 'ringing' },
          data: {
            outcome: 'answered',
            answered_at: now,
            aggregate_version: { increment: 1 },
          },
        });
        if (claimed.count !== 1) {
          throw new ConflictApplicationError(
            'This call can no longer be answered',
            'ASSIGNMENT_CALL_INVALID_STATE',
          );
        }
        await transaction.assignmentCallParticipation.updateMany({
          where: { call_id: input.callId, user_id: input.actor.id },
          data: { joined_at: now, disconnected_at: null },
        });
        const event = await transaction.assignmentCallEvent.create({
          data: {
            call_id: input.callId,
            event_type: 'answered',
            // The row this call already had, plus the increment the update
            // above just applied -- correct regardless of whether this is
            // the call's second or a later transition.
            aggregate_version: call.aggregate_version + 1,
            command_idempotency_key: input.idempotencyKey,
          },
        });
        const updated = await transaction.assignmentCall.findUniqueOrThrow({
          where: { id: input.callId },
          select: CALL_SELECT,
        });
        return { call: updated, answeredEventId: event.id };
      });
    } catch (error) {
      throw this.mapReplayConflict(error, 'ASSIGNMENT_CALL_INVALID_STATE');
    }

    if (result.answeredEventId) {
      await Promise.all([
        this.queue.cancelRingTimeout(input.callId),
        this.queue.armDurationTimers(input.callId),
        this.realtime.publishAnswered(result.answeredEventId),
      ]).catch(() => {});
      this.authorization.invalidate(input.callId);
    }

    return this.presentStartOrAnswer(result.call, input.actor.id);
  }

  async decline(input: {
    actor: AuthenticatedUser;
    callId: string;
    idempotencyKey: string;
  }): Promise<AssignmentCallResponseDto> {
    this.assertEnabled();
    const now = new Date();
    const result = await this.transitionToTerminal({
      actor: input.actor,
      callId: input.callId,
      idempotencyKey: input.idempotencyKey,
      eventType: 'declined',
      requireRole: 'callee',
      fromOutcomes: ['ringing'],
      terminalOutcome: 'declined',
      endReason: 'declined',
      now,
    });
    if (result.eventId) {
      await Promise.all([
        this.queue.cancelRingTimeout(input.callId),
        this.realtime.publishDeclined(result.eventId),
      ]).catch(() => {});
      this.authorization.invalidate(input.callId);
    }
    return toAssignmentCallResponseDto(result.call, this.maxDurationSeconds());
  }

  async end(input: {
    actor: AuthenticatedUser;
    callId: string;
    idempotencyKey: string;
  }): Promise<AssignmentCallResponseDto> {
    this.assertEnabled();
    const now = new Date();
    const result = await this.transitionToTerminal({
      actor: input.actor,
      callId: input.callId,
      idempotencyKey: input.idempotencyKey,
      eventType: 'ended',
      requireRole: 'either',
      fromOutcomes: ['ringing', 'answered'],
      terminalOutcome: 'ended',
      endReason: 'hangup',
      now,
      endedBy: input.actor.id,
    });
    if (result.eventId) {
      await Promise.all([
        this.queue.cancelRingTimeout(input.callId),
        this.queue.cancelDurationTimers(input.callId),
        this.queue.cancelReconnectGrace(input.callId, result.call.caller_id),
        this.queue.cancelReconnectGrace(input.callId, result.call.callee_id),
        this.realtime.publishEnded(result.eventId),
      ]).catch(() => {});
      this.authorization.invalidate(input.callId);
    }
    return toAssignmentCallResponseDto(result.call, this.maxDurationSeconds());
  }

  /**
   * Not idempotency-keyed through the outbox: unlike `answer`/`decline`/
   * `end`, reconnecting changes no durable outcome and mints no resource
   * that is unsafe to mint twice, so repeating it is inherently safe rather
   * than needing replay detection.
   */
  async reconnect(input: {
    actor: AuthenticatedUser;
    callId: string;
  }): Promise<StartOrAnswerCallResponseDto> {
    this.assertEnabled();
    const call = await this.loadForActor(this.database, input.callId, input.actor.id);
    if (call.outcome !== 'answered' || call.ended_at) {
      throw new ConflictApplicationError(
        'This call has already ended',
        'ASSIGNMENT_CALL_INVALID_STATE',
      );
    }
    await this.database.assignmentCallParticipation.updateMany({
      where: { call_id: input.callId, user_id: input.actor.id },
      data: { disconnected_at: null },
    });
    await this.queue.cancelReconnectGrace(input.callId, input.actor.id);
    return this.presentStartOrAnswer(call, input.actor.id);
  }

  async getJoinCredentials(
    actor: AuthenticatedUser,
    callId: string,
  ): Promise<JoinCredentialsDto> {
    this.assertEnabled();
    const call = await this.loadForActor(this.database, callId, actor.id);
    if (call.ended_at || !(call.outcome === 'ringing' || call.outcome === 'answered')) {
      throw new ConflictApplicationError(
        'This call has already ended',
        'ASSIGNMENT_CALL_INVALID_STATE',
      );
    }
    return this.ice.mintJoinCredentials(actor.id);
  }

  private async transitionToTerminal(input: {
    actor: AuthenticatedUser;
    callId: string;
    idempotencyKey: string;
    eventType: 'declined' | 'ended';
    requireRole: 'callee' | 'either';
    fromOutcomes: AssignmentCallOutcome[];
    terminalOutcome: AssignmentCallOutcome;
    endReason: string;
    now: Date;
    endedBy?: string;
  }): Promise<{ call: CallRecord; eventId: string | null }> {
    try {
      return await this.database.$transaction(async (transaction) => {
        const call = await this.loadForActor(transaction, input.callId, input.actor.id);

        const existingEvent = await transaction.assignmentCallEvent.findUnique({
          where: {
            call_id_event_type_command_idempotency_key: {
              call_id: input.callId,
              event_type: input.eventType,
              command_idempotency_key: input.idempotencyKey,
            },
          },
        });
        if (existingEvent) return { call, eventId: null };

        if (input.requireRole === 'callee' && call.callee_id !== input.actor.id) {
          throw this.callNotFound();
        }

        const claimed = await transaction.assignmentCall.updateMany({
          where: { id: input.callId, outcome: { in: input.fromOutcomes } },
          data: {
            outcome: input.terminalOutcome,
            ended_at: input.now,
            end_reason: input.endReason,
            aggregate_version: { increment: 1 },
            ...(input.endedBy ? { ended_by: input.endedBy } : {}),
            ...(call.answered_at
              ? {
                  duration_seconds: Math.max(
                    0,
                    Math.floor((input.now.getTime() - call.answered_at.getTime()) / 1000),
                  ),
                }
              : {}),
          },
        });
        if (claimed.count !== 1) {
          throw new ConflictApplicationError(
            'This call already ended',
            'ASSIGNMENT_CALL_INVALID_STATE',
          );
        }
        await transaction.assignmentCallParticipation.updateMany({
          where: { call_id: input.callId, active: true },
          data: { active: false, left_at: input.now },
        });
        const event = await transaction.assignmentCallEvent.create({
          data: {
            call_id: input.callId,
            event_type: input.eventType,
            // Declining only ever happens from `ringing` (version 1), so
            // this is always 2. Ending can happen from `ringing` (2) or
            // from `answered` (3) -- `call.aggregate_version` was read
            // fresh in this same transaction, so it reflects whichever
            // path this call actually took.
            aggregate_version: call.aggregate_version + 1,
            command_idempotency_key: input.idempotencyKey,
          },
        });
        const updated = await transaction.assignmentCall.findUniqueOrThrow({
          where: { id: input.callId },
          select: CALL_SELECT,
        });
        return { call: updated, eventId: event.id };
      });
    } catch (error) {
      throw this.mapReplayConflict(error, 'ASSIGNMENT_CALL_INVALID_STATE');
    }
  }

  private async loadForActor(
    database: Pick<Prisma.TransactionClient, 'assignmentCall'>,
    callId: string,
    actorId: string,
  ): Promise<CallRecord> {
    const call = await database.assignmentCall.findFirst({
      where: { id: callId, OR: [{ caller_id: actorId }, { callee_id: actorId }] },
      select: CALL_SELECT,
    });
    if (!call) throw this.callNotFound();
    return call;
  }

  private presentStartOrAnswer(
    call: CallRecord,
    actorId: string,
  ): StartOrAnswerCallResponseDto {
    return {
      call: toAssignmentCallResponseDto(call, this.maxDurationSeconds()),
      joinCredentials: this.ice.mintJoinCredentials(actorId),
      callSessionId: randomUUID(),
    };
  }

  private maxDurationSeconds(): number {
    return (
      this.config.get<number>('ASSIGNMENT_CALL_MAX_DURATION_MS', 3_600_000) / 1000
    );
  }

  private assertEnabled(): void {
    if (!this.config.get<boolean>('ASSIGNMENT_CALLS_ENABLED', false)) {
      throw new ForbiddenApplicationError(
        'Assignment Calls are not enabled',
        'ASSIGNMENT_CALL_DISABLED',
      );
    }
  }

  private async isCalleeInQuietHours(calleeId: string): Promise<boolean> {
    const preference = await this.database.notificationPreference.findUnique({
      where: { user_id: calleeId },
      select: {
        quiet_hours_enabled: true,
        quiet_start_local: true,
        quiet_end_local: true,
        quiet_timezone: true,
      },
    });
    if (
      !preference?.quiet_hours_enabled ||
      !preference.quiet_start_local ||
      !preference.quiet_end_local ||
      !preference.quiet_timezone
    ) {
      return false;
    }

    let nowMinutes: number;
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: preference.quiet_timezone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(new Date());
      const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
      const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
      nowMinutes = hour * 60 + minute;
    } catch {
      // An unparseable stored timezone must never block calling entirely.
      return false;
    }

    const startMinutes =
      preference.quiet_start_local.getUTCHours() * 60 +
      preference.quiet_start_local.getUTCMinutes();
    const endMinutes =
      preference.quiet_end_local.getUTCHours() * 60 +
      preference.quiet_end_local.getUTCMinutes();
    if (startMinutes === endMinutes) return false;
    return startMinutes < endMinutes
      ? nowMinutes >= startMinutes && nowMinutes < endMinutes
      : nowMinutes >= startMinutes || nowMinutes < endMinutes;
  }

  private callNotFound(): NotFoundApplicationError {
    return new NotFoundApplicationError(
      'Assignment Call was not found',
      'ASSIGNMENT_CALL_NOT_FOUND',
    );
  }

  /**
   * Matches on the *field* array, never a constraint name. Verified against a
   * real Postgres run (`scripts/test-assignment-call-concurrency.ts`): Prisma
   * reports `meta.target` as the plain column list for a P2002 -- even for
   * `AssignmentCall`'s own schema-declared `[caller_id, idempotency_key]`
   * unique -- never the constraint/index name, so a raw index declared only
   * in the migration's SQL (never in schema.prisma) is no different. The one
   * unique constraint in this whole schema whose target is the single field
   * `user_id` is the partial index this method exists to detect.
   */
  private mapStartError(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = error.meta?.target;
      const fields = Array.isArray(target)
        ? target.map(String)
        : typeof target === 'string'
          ? target.split(',').map((value) => value.trim())
          : [];
      if (fields.length === 1 && fields[0] === 'user_id') {
        return new ConflictApplicationError(
          'Participant unavailable',
          'ASSIGNMENT_CALL_PARTICIPANT_BUSY',
        );
      }
      if (fields.includes('idempotency_key')) {
        return new ConflictApplicationError(
          'This idempotency key was already used to start a different call',
          'ASSIGNMENT_CALL_IDEMPOTENCY_CONFLICT',
        );
      }
    }
    return error;
  }

  private mapReplayConflict(error: unknown, fallbackCode: string): unknown {
    if (error instanceof ApplicationError) return error;
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictApplicationError('This call changed concurrently', fallbackCode);
    }
    return error;
  }
}
