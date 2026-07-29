import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApplicationAuditAction,
  ApplicationStatus,
} from '@prisma/client';

import { DatabaseService } from '../../../shared/database/database.service';
import { ContributionTasksService } from '../../contribution-tasks/services/contribution-tasks.service';
import { NotificationsService } from '../../notifications/notifications.service';

export interface ApplicationReviewSweepResult {
  reminded: number;
  expired: number;
}

@Injectable()
export class ApplicationReviewWindowService {
  private readonly batchSize: number;

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly contributionTasks: ContributionTasksService,
    private readonly notifications: NotificationsService,
  ) {
    this.batchSize = this.config.get<number>(
      'APPLICATION_REVIEW_SWEEP_BATCH_SIZE',
      100,
    );
  }

  async processDue(now = new Date()): Promise<ApplicationReviewSweepResult> {
    if (Number.isNaN(now.getTime())) {
      throw new Error('Application review sweep requires a valid clock value');
    }

    const expired = await this.expireDueApplications(now);
    const reminded = await this.remindDueOwners(now);
    return { reminded, expired };
  }

  private async expireDueApplications(now: Date): Promise<number> {
    const candidates = await this.database.application.findMany({
      where: {
        status: ApplicationStatus.pending_owner_review,
        expires_at: { lte: now },
      },
      orderBy: [{ expires_at: 'asc' }, { id: 'asc' }],
      take: this.batchSize,
      select: {
        id: true,
        contribution_request_id: true,
        contributor_id: true,
        expires_at: true,
      },
    });

    let expired = 0;
    for (const candidate of candidates) {
      const result = await this.database.$transaction(
        async (transaction) => {
          const updated = await transaction.application.updateMany({
            where: {
              id: candidate.id,
              status: ApplicationStatus.pending_owner_review,
              expires_at: { lte: now },
            },
            data: {
              status: ApplicationStatus.expired,
              expired_at: now,
            },
          });
          if (updated.count !== 1) {
            return { transitioned: false, notification: null };
          }

          const idempotencyKey = `application-review-expiry:${candidate.id}`;
          await transaction.applicationAudit.create({
            data: {
              application_id: candidate.id,
              actor_id: null,
              action: ApplicationAuditAction.expired,
              from_status: ApplicationStatus.pending_owner_review,
              to_status: ApplicationStatus.expired,
              idempotency_key: idempotencyKey,
              command_fingerprint: this.fingerprint({
                action: ApplicationAuditAction.expired,
                applicationId: candidate.id,
                expiresAt: candidate.expires_at?.toISOString() ?? null,
              }),
              metadata: {
                payloadVersion: 1,
                trigger: 'owner_review_window',
                expiredAt: now.toISOString(),
              },
            },
          });
          const created = await this.notifications.createApplicationNotification(
            {
              userId: candidate.contributor_id,
              applicationId: candidate.id,
              contributionRequestId: candidate.contribution_request_id,
              action: 'expired',
            },
            { transaction, emitRealtime: false },
          );
          return {
            transitioned: true,
            notification: created.created ? created.notification : null,
          };
        },
      );
      if (!result.transitioned) continue;
      expired += 1;
      if (result.notification) {
        this.notifications.emitApplicationNotifications([result.notification]);
      }
    }
    return expired;
  }

  private async remindDueOwners(now: Date): Promise<number> {
    const candidates = await this.database.application.findMany({
      where: {
        status: ApplicationStatus.pending_owner_review,
        review_due_at: { lte: now },
        review_reminder_sent_at: null,
        expires_at: { gt: now },
      },
      orderBy: [{ review_due_at: 'asc' }, { id: 'asc' }],
      take: this.batchSize,
      select: {
        id: true,
        contribution_request_id: true,
      },
    });

    let reminded = 0;
    for (const candidate of candidates) {
      const result = await this.database.$transaction(
        async (transaction) => {
          const { ownerId } =
            await this.contributionTasks.lockApplicationReviewOwner({
              requestId: candidate.contribution_request_id,
              transaction,
            });
          const updated = await transaction.application.updateMany({
            where: {
              id: candidate.id,
              status: ApplicationStatus.pending_owner_review,
              review_due_at: { lte: now },
              review_reminder_sent_at: null,
              expires_at: { gt: now },
            },
            data: { review_reminder_sent_at: now },
          });
          if (updated.count !== 1) {
            return { transitioned: false, notification: null };
          }

          const created = await this.notifications.createApplicationNotification(
            {
              userId: ownerId,
              applicationId: candidate.id,
              contributionRequestId: candidate.contribution_request_id,
              action: 'owner_review_reminder',
            },
            { transaction, emitRealtime: false },
          );
          return {
            transitioned: true,
            notification: created.created ? created.notification : null,
          };
        },
      );
      if (!result.transitioned) continue;
      reminded += 1;
      if (result.notification) {
        this.notifications.emitApplicationNotifications([result.notification]);
      }
    }
    return reminded;
  }

  private fingerprint(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
}
