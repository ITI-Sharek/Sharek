import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import { DatabaseService } from '../../shared/database/database.service';

const DEFAULT_RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1_000;

interface ExpiredNotificationCandidate {
  id: string;
  user_id: string;
  created_at: Date;
}

@Injectable()
export class NotificationRetentionService {
  private readonly logger = new Logger(NotificationRetentionService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async purgeExpired(
    now = new Date(),
  ): Promise<{ purged: number; skipped: number }> {
    const candidates = await this.database.$queryRaw<
      ExpiredNotificationCandidate[]
    >(Prisma.sql`
      SELECT n."id", n."user_id", n."created_at"
      FROM "Notification" n
      LEFT JOIN "NotificationPreference" p
        ON p."user_id" = n."user_id"
      WHERE n."created_at" < ${now}
        - (COALESCE(p."retention_days", ${DEFAULT_RETENTION_DAYS}) * INTERVAL '1 day')
      ORDER BY n."created_at" ASC, n."id" ASC
      LIMIT ${this.batchSize()}
    `);

    let purged = 0;
    let skipped = 0;
    for (const candidate of candidates) {
      try {
        if (await this.purgeOne(candidate.id, now)) purged += 1;
        else skipped += 1;
      } catch (error) {
        this.logger.error(
          `Failed to purge Notification ${candidate.id}`,
          error instanceof Error ? error.stack : String(error),
        );
        skipped += 1;
      }
    }

    if (purged > 0) {
      this.logger.log(`Purged ${purged} expired Notification(s)`);
    }
    return { purged, skipped };
  }

  private async purgeOne(notificationId: string, now: Date): Promise<boolean> {
    return this.database.$transaction(async (transaction) => {
      const notification = await transaction.notification.findUnique({
        where: { id: notificationId },
        select: { id: true, user_id: true, created_at: true },
      });
      if (!notification) return false;

      const preference =
        await transaction.notificationPreference.findUnique({
          where: { user_id: notification.user_id },
          select: { retention_days: true },
        });
      const retentionDays =
        preference?.retention_days ?? DEFAULT_RETENTION_DAYS;
      const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
      if (notification.created_at >= cutoff) return false;

      const deleted = await transaction.notification.deleteMany({
        where: {
          id: notification.id,
          created_at: { lt: cutoff },
        },
      });
      return deleted.count === 1;
    });
  }

  private batchSize(): number {
    return Math.max(
      1,
      this.config.get<number>('NOTIFICATION_RETENTION_BATCH_SIZE', 100),
    );
  }
}
