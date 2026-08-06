import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AssessmentAuditAction,
  AssessmentAttemptStatus,
  AssessmentRequestStatus,
} from '@prisma/client';

import { DatabaseService } from '../../../shared/database/database.service';

/** Recorded on the attempt row the reaper writes, so the cause is greppable. */
export const ASSESSMENT_ABANDONED_ERROR_CODE = 'ASSESSMENT_PROCESSING_ABANDONED';

const REAP_BATCH_SIZE = 100;

/**
 * Releases Assessment Requests stranded in `requested`.
 *
 * Without this the queue makes things worse rather than better: a job lost to a
 * crash, a redeploy, or a Redis eviction leaves a row in `requested` forever,
 * and `requested` is not retryable — so that Application can never be assessed
 * again and its owner gets a permanent 409. Since the frontend polls, it also
 * polls that row every few seconds indefinitely.
 */
@Injectable()
export class AdvisoryFitAssessmentReaperService {
  private readonly logger = new Logger(
    AdvisoryFitAssessmentReaperService.name,
  );

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  private staleAfterMs(): number {
    return this.config.get<number>('ADVISORY_FIT_STALE_AFTER_MS', 600_000);
  }

  async reapStale(now: Date): Promise<{ reaped: number; skipped: number }> {
    const cutoff = new Date(now.getTime() - this.staleAfterMs());
    const candidates = await this.database.assessmentRequest.findMany({
      // updated_at, not requested_at. A retry flips status and stamps
      // updated_at but leaves requested_at at the original creation time, so a
      // requested_at predicate would reap a retry that started seconds ago.
      where: {
        status: AssessmentRequestStatus.requested,
        updated_at: { lte: cutoff },
      },
      orderBy: [{ updated_at: 'asc' }, { id: 'asc' }],
      take: REAP_BATCH_SIZE,
      select: { id: true },
    });

    let reaped = 0;
    let skipped = 0;
    for (const candidate of candidates) {
      try {
        if (await this.reapOne(candidate.id, now)) reaped += 1;
        else skipped += 1;
      } catch (error) {
        // One candidate losing a race must not abort the batch.
        this.logger.error(
          `Failed to reap stale assessment request ${candidate.id}`,
          error instanceof Error ? error.stack : String(error),
        );
        skipped += 1;
      }
    }
    if (reaped > 0) {
      this.logger.warn(
        `Reaped ${reaped} assessment request(s) abandoned in requested`,
      );
    }
    return { reaped, skipped };
  }

  private async reapOne(requestId: string, now: Date): Promise<boolean> {
    return this.database.$transaction(async (transaction) => {
      // Claim first, re-asserting the predicate: a processor may be committing
      // its own terminal write at this exact moment.
      const claimed = await transaction.assessmentRequest.updateMany({
        where: { id: requestId, status: AssessmentRequestStatus.requested },
        data: {
          status: AssessmentRequestStatus.unavailable,
          completed_at: now,
        },
      });
      if (claimed.count !== 1) return false;

      const lastAttempt = await transaction.assessmentAttempt.findFirst({
        where: { assessment_request_id: requestId },
        orderBy: { attempt_number: 'desc' },
        select: { id: true, attempt_number: true },
      });
      const attemptNumber = (lastAttempt?.attempt_number ?? 0) + 1;

      // A failed attempt row, not just a status flip. Without one the request
      // lands on `unavailable` with attempts: 0, which reads as retryAvailable
      // forever — so a persistently broken worker would loop the owner through
      // retries that keep being abandoned.
      await transaction.assessmentAttempt.create({
        data: {
          id: randomUUID(),
          assessment_request_id: requestId,
          retry_of_attempt_id: lastAttempt?.id ?? null,
          attempt_number: attemptNumber,
          status: AssessmentAttemptStatus.failed,
          error_code: ASSESSMENT_ABANDONED_ERROR_CODE,
          started_at: now,
          completed_at: now,
        },
      });
      for (const action of [
        AssessmentAuditAction.attempt_failed,
        AssessmentAuditAction.unavailable,
      ]) {
        await transaction.assessmentRequestAudit.create({
          data: {
            assessment_request_id: requestId,
            actor_id: null,
            action,
            from_status: AssessmentRequestStatus.requested,
            to_status: AssessmentRequestStatus.unavailable,
            attempt_number: attemptNumber,
            metadata: {
              payloadVersion: 1,
              errorCode: ASSESSMENT_ABANDONED_ERROR_CODE,
              trigger: 'stale_assessment_sweep',
            },
          },
        });
      }
      return true;
    });
  }
}
