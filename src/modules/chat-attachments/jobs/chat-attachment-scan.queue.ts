import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

import { getRedisConnection } from '../../../shared/queue/redis-connection';
import { isChatAttachmentScanQueueEnabled } from './chat-attachment-scan.config';

export const CHAT_ATTACHMENT_SCAN_QUEUE = 'chat-attachment-scan';
export const CHAT_ATTACHMENT_SCAN_JOB = 'scan';
export const CHAT_ATTACHMENT_SCAN_REAP_JOB = 'reap';

export type ChatAttachmentScanJobData = {
  attachmentId: string;
  attemptNumber: number;
};

/**
 * Unique per attempt, not per attachment -- BullMQ ignores `add` for a job id
 * that still exists, so keying on the attachment alone would make a reaper
 * re-queue silently never run.
 *
 * The separator is `--`, not `:`: BullMQ reserves `:` for its own key
 * namespacing and rejects a custom id containing one. See the identical
 * comment on `materialScanJobId` for the incident this avoids repeating.
 */
export function chatAttachmentScanJobId(data: ChatAttachmentScanJobData): string {
  return `${data.attachmentId}--attempt-${data.attemptNumber}`;
}

@Injectable()
export class ChatAttachmentScanQueue implements OnModuleDestroy {
  private readonly queue: Queue | null;
  private readonly reapIntervalMs: number;

  constructor(private readonly config: ConfigService) {
    this.reapIntervalMs = config.get<number>(
      'CHAT_ATTACHMENT_SCAN_REAP_INTERVAL_MS',
      60_000,
    );
    this.queue = isChatAttachmentScanQueueEnabled(config)
      ? new Queue(CHAT_ATTACHMENT_SCAN_QUEUE, {
          connection: getRedisConnection(config),
        })
      : null;
  }

  /**
   * Throws when disabled rather than silently dropping the job -- an
   * attachment whose scan was never queued sits quarantined forever, which
   * means undownloadable, so the upload command must fail loudly rather than
   * hand the sender a file they can never send.
   */
  async enqueueScan(data: ChatAttachmentScanJobData): Promise<void> {
    if (!this.queue) {
      throw new Error('Chat attachment scan queue is disabled');
    }
    await this.queue.add(CHAT_ATTACHMENT_SCAN_JOB, data, {
      jobId: chatAttachmentScanJobId(data),
      ...this.jobOptions(),
    });
  }

  async scheduleReaper(): Promise<void> {
    if (!this.queue) return;
    await this.queue.add(
      CHAT_ATTACHMENT_SCAN_REAP_JOB,
      {},
      {
        jobId: 'chat-attachment-scan-reaper',
        repeat: { every: this.reapIntervalMs },
        ...this.jobOptions(),
      },
    );
  }

  /** Covers attachments stranded while no worker was running. */
  async enqueueReapCatchUp(now: Date): Promise<void> {
    if (!this.queue) return;
    await this.queue.add(
      CHAT_ATTACHMENT_SCAN_REAP_JOB,
      {},
      {
        jobId: `chat-attachment-scan-reap-catch-up-${Math.floor(now.getTime() / this.reapIntervalMs)}`,
        ...this.jobOptions(),
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
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
