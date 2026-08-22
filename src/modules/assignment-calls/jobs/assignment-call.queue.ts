import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

import { getRedisConnection } from '../../../shared/queue/redis-connection';
import { isAssignmentCallQueueEnabled } from './assignment-call.config';

export const ASSIGNMENT_CALL_QUEUE = 'assignment-call';
export const ASSIGNMENT_CALL_RING_TIMEOUT_JOB = 'ring-timeout';
export const ASSIGNMENT_CALL_RECONNECT_GRACE_JOB = 'reconnect-grace';
export const ASSIGNMENT_CALL_DURATION_WARNING_JOB = 'duration-warning';
export const ASSIGNMENT_CALL_MAX_DURATION_JOB = 'max-duration';
export const ASSIGNMENT_CALL_SWEEP_JOB = 'sweep';
export const ASSIGNMENT_CALL_CAPACITY_POLL_JOB = 'capacity-poll';
const CAPACITY_POLL_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type AssignmentCallRingTimeoutJobData = { callId: string };
export type AssignmentCallReconnectGraceJobData = { callId: string; userId: string };
export type AssignmentCallDurationWarningJobData = { callId: string; warningIndex: number };
export type AssignmentCallMaxDurationJobData = { callId: string };

// `--` rather than `:`: BullMQ reserves `:` for its own key namespacing and
// rejects a custom job id containing one.
export function ringTimeoutJobId(callId: string): string {
  return `call--${callId}--ring-timeout`;
}
export function reconnectGraceJobId(callId: string, userId: string): string {
  return `call--${callId}--reconnect-grace--${userId}`;
}
export function durationWarningJobId(callId: string, warningIndex: number): string {
  return `call--${callId}--warn-${warningIndex}`;
}
export function maxDurationJobId(callId: string): string {
  return `call--${callId}--max-duration`;
}

/**
 * BullMQ **delayed** jobs (`delay` + a stable custom `jobId`, cancelled with
 * `queue.remove(jobId)` before they fire) -- every other queue in this repo
 * uses `repeat` for periodic sweeps, so this is the first use of BullMQ as a
 * per-instance countdown timer. The principle behind every method here: the
 * server is authoritative for any timer that changes durable call state; the
 * client only mirrors it for UI. Arming and cancelling are idempotent by
 * construction -- a duplicate `arm` for a `jobId` that already exists is a
 * silent no-op (BullMQ's own behaviour), and cancelling a job that already
 * fired or was never armed is not an error.
 */
@Injectable()
export class AssignmentCallQueue implements OnModuleDestroy {
  private readonly queue: Queue | null;
  private readonly sweepIntervalMs: number;

  constructor(private readonly config: ConfigService) {
    this.sweepIntervalMs = config.get<number>('ASSIGNMENT_CALL_SWEEP_INTERVAL_MS', 60_000);
    this.queue = isAssignmentCallQueueEnabled(config)
      ? new Queue(ASSIGNMENT_CALL_QUEUE, { connection: getRedisConnection(config) })
      : null;
  }

  async armRingTimeout(callId: string): Promise<void> {
    if (!this.queue) return;
    const delay = this.config.get<number>('ASSIGNMENT_CALL_RING_TIMEOUT_MS', 30_000);
    await this.queue.add(
      ASSIGNMENT_CALL_RING_TIMEOUT_JOB,
      { callId } satisfies AssignmentCallRingTimeoutJobData,
      { jobId: ringTimeoutJobId(callId), delay, ...this.jobOptions() },
    );
  }

  async cancelRingTimeout(callId: string): Promise<void> {
    await this.remove(ringTimeoutJobId(callId));
  }

  async armReconnectGrace(callId: string, userId: string): Promise<void> {
    if (!this.queue) return;
    const delay = this.config.get<number>('ASSIGNMENT_CALL_RECONNECT_GRACE_MS', 30_000);
    await this.queue.add(
      ASSIGNMENT_CALL_RECONNECT_GRACE_JOB,
      { callId, userId } satisfies AssignmentCallReconnectGraceJobData,
      { jobId: reconnectGraceJobId(callId, userId), delay, ...this.jobOptions() },
    );
  }

  async cancelReconnectGrace(callId: string, userId: string): Promise<void> {
    await this.remove(reconnectGraceJobId(callId, userId));
  }

  /** Armed at `answer`, not `start` -- the clock is call duration, not ring time. */
  async armDurationTimers(callId: string): Promise<void> {
    if (!this.queue) return;
    const warnings = this.parseWarningOffsets();
    const maxDurationMs = this.config.get<number>('ASSIGNMENT_CALL_MAX_DURATION_MS', 3_600_000);
    await Promise.all([
      ...warnings.map((delay, index) =>
        this.queue!.add(
          ASSIGNMENT_CALL_DURATION_WARNING_JOB,
          { callId, warningIndex: index } satisfies AssignmentCallDurationWarningJobData,
          { jobId: durationWarningJobId(callId, index), delay, ...this.jobOptions() },
        ),
      ),
      this.queue.add(
        ASSIGNMENT_CALL_MAX_DURATION_JOB,
        { callId } satisfies AssignmentCallMaxDurationJobData,
        { jobId: maxDurationJobId(callId), delay: maxDurationMs, ...this.jobOptions() },
      ),
    ]);
  }

  async cancelDurationTimers(callId: string): Promise<void> {
    const warnings = this.parseWarningOffsets();
    await Promise.all([
      ...warnings.map((_, index) => this.remove(durationWarningJobId(callId, index))),
      this.remove(maxDurationJobId(callId)),
    ]);
  }

  async scheduleSweep(): Promise<void> {
    if (!this.queue) return;
    await this.queue.add(
      ASSIGNMENT_CALL_SWEEP_JOB,
      {},
      {
        jobId: 'assignment-call-sweeper',
        repeat: { every: this.sweepIntervalMs },
        ...this.jobOptions(),
      },
    );
  }

  /** Covers calls stranded while no worker was running. */
  async enqueueSweepCatchUp(now: Date): Promise<void> {
    if (!this.queue) return;
    await this.queue.add(
      ASSIGNMENT_CALL_SWEEP_JOB,
      {},
      {
        jobId: `assignment-call-sweep-catch-up-${Math.floor(now.getTime() / this.sweepIntervalMs)}`,
        ...this.jobOptions(),
      },
    );
  }

  async scheduleCapacityPoll(): Promise<void> {
    if (!this.queue) return;
    await this.queue.add(
      ASSIGNMENT_CALL_CAPACITY_POLL_JOB,
      {},
      {
        jobId: 'assignment-call-capacity-poller',
        repeat: { every: CAPACITY_POLL_INTERVAL_MS },
        ...this.jobOptions(),
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }

  private parseWarningOffsets(): number[] {
    return this.config
      .get<string>('ASSIGNMENT_CALL_WARNING_MS', '3000000,3480000')
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value > 0);
  }

  private async remove(jobId: string): Promise<void> {
    // BullMQ's own `remove` is a safe no-op when the job does not exist
    // (already fired, or never armed) -- exactly what makes cancellation
    // idempotent from every call site.
    await this.queue?.remove(jobId);
  }

  private jobOptions() {
    return {
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 2_000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    };
  }
}
