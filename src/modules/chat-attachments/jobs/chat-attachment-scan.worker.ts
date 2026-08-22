import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';

import { getRedisConnection } from '../../../shared/queue/redis-connection';
import { ChatAttachmentEventRecoveryService } from '../services/chat-attachment-event-recovery.service';
import { ChatAttachmentPurgeService } from '../services/chat-attachment-purge.service';
import { ChatAttachmentScanProcessorService } from '../services/chat-attachment-scan-processor.service';
import { ChatAttachmentScanReaperService } from '../services/chat-attachment-scan-reaper.service';
import { isChatAttachmentScanQueueEnabled } from './chat-attachment-scan.config';
import {
  CHAT_ATTACHMENT_SCAN_JOB,
  CHAT_ATTACHMENT_SCAN_QUEUE,
  CHAT_ATTACHMENT_SCAN_REAP_JOB,
  ChatAttachmentScanJobData,
  ChatAttachmentScanQueue,
} from './chat-attachment-scan.queue';

@Injectable()
export class ChatAttachmentScanWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ChatAttachmentScanWorker.name);
  private worker: Worker | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly queue: ChatAttachmentScanQueue,
    private readonly processor: ChatAttachmentScanProcessorService,
    private readonly reaper: ChatAttachmentScanReaperService,
    private readonly purge: ChatAttachmentPurgeService,
    private readonly eventRecovery: ChatAttachmentEventRecoveryService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!isChatAttachmentScanQueueEnabled(this.config)) return;

    this.worker = new Worker(
      CHAT_ATTACHMENT_SCAN_QUEUE,
      (job) => this.handle(job),
      { connection: getRedisConnection(this.config), concurrency: 2 },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Chat attachment scan job ${job?.name ?? 'unknown'} ${job?.id ?? ''} failed`,
        error.stack,
      );
    });
    this.worker.on('error', (error) => {
      this.logger.error('Chat attachment scan worker error', error.stack);
    });

    await this.queue.scheduleReaper();
    await this.queue.enqueueReapCatchUp(new Date());
  }

  /**
   * Only infrastructure failures may throw from here, and for this queue
   * they are the ones worth retrying: an unreachable scanner or unreadable
   * storage is transient, while every verdict the scanner does produce is
   * already persisted by the processor and resolves the job.
   */
  private async handle(job: Job): Promise<void> {
    if (job.name === CHAT_ATTACHMENT_SCAN_REAP_JOB) {
      // Three sweeps on one tick: the scan reaper, the purge sweep, and the
      // event-recovery sweep. All three are maintenance nobody is waiting on
      // interactively, so giving each its own repeating job would only
      // multiply Redis chatter for no gain.
      const now = new Date();
      await this.reaper.reapStale(now);
      await this.purge.purgePending(now);
      await this.eventRecovery.recoverPending(now);
      return;
    }
    if (job.name === CHAT_ATTACHMENT_SCAN_JOB) {
      const { attachmentId, attemptNumber } = job.data as ChatAttachmentScanJobData;
      await this.processor.process(attachmentId, attemptNumber);
      return;
    }
    this.logger.warn(`Ignoring unknown chat attachment scan job name ${job.name}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
