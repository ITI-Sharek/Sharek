import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';

import { getRedisConnection } from '../../../shared/queue/redis-connection';
import { AssignmentCallCapacityService } from '../services/assignment-call-capacity.service';
import { AssignmentCallTimersService } from '../services/assignment-call-timers.service';
import { isAssignmentCallQueueEnabled } from './assignment-call.config';
import {
  ASSIGNMENT_CALL_CAPACITY_POLL_JOB,
  ASSIGNMENT_CALL_DURATION_WARNING_JOB,
  ASSIGNMENT_CALL_MAX_DURATION_JOB,
  ASSIGNMENT_CALL_QUEUE,
  ASSIGNMENT_CALL_RECONNECT_GRACE_JOB,
  ASSIGNMENT_CALL_RING_TIMEOUT_JOB,
  ASSIGNMENT_CALL_SWEEP_JOB,
  AssignmentCallDurationWarningJobData,
  AssignmentCallMaxDurationJobData,
  AssignmentCallQueue,
  AssignmentCallReconnectGraceJobData,
  AssignmentCallRingTimeoutJobData,
} from './assignment-call.queue';

@Injectable()
export class AssignmentCallWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AssignmentCallWorker.name);
  private worker: Worker | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly queue: AssignmentCallQueue,
    private readonly timers: AssignmentCallTimersService,
    private readonly capacity: AssignmentCallCapacityService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!isAssignmentCallQueueEnabled(this.config)) return;

    this.worker = new Worker(ASSIGNMENT_CALL_QUEUE, (job) => this.handle(job), {
      connection: getRedisConnection(this.config),
      concurrency: 4,
    });
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Assignment Call job ${job?.name ?? 'unknown'} ${job?.id ?? ''} failed`,
        error.stack,
      );
    });
    this.worker.on('error', (error) => {
      this.logger.error('Assignment Call worker error', error.stack);
    });

    await this.queue.scheduleSweep();
    await this.queue.scheduleCapacityPoll();
    await this.queue.enqueueSweepCatchUp(new Date());
  }

  private async handle(job: Job): Promise<void> {
    switch (job.name) {
      case ASSIGNMENT_CALL_RING_TIMEOUT_JOB: {
        const { callId } = job.data as AssignmentCallRingTimeoutJobData;
        await this.timers.handleRingTimeout(callId);
        return;
      }
      case ASSIGNMENT_CALL_RECONNECT_GRACE_JOB: {
        const { callId, userId } = job.data as AssignmentCallReconnectGraceJobData;
        await this.timers.handleReconnectGraceExpired(callId, userId);
        return;
      }
      case ASSIGNMENT_CALL_DURATION_WARNING_JOB: {
        const { callId, warningIndex } = job.data as AssignmentCallDurationWarningJobData;
        await this.timers.handleDurationWarning(callId, warningIndex);
        return;
      }
      case ASSIGNMENT_CALL_MAX_DURATION_JOB: {
        const { callId } = job.data as AssignmentCallMaxDurationJobData;
        await this.timers.handleMaxDurationReached(callId);
        return;
      }
      case ASSIGNMENT_CALL_SWEEP_JOB: {
        await this.timers.sweep(new Date());
        return;
      }
      case ASSIGNMENT_CALL_CAPACITY_POLL_JOB: {
        await this.capacity.pollAndRecordUsage();
        return;
      }
      default:
        this.logger.warn(`Ignoring unknown Assignment Call job name ${job.name}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
