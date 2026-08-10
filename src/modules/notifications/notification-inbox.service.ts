import { Injectable, Optional } from '@nestjs/common';
import { Notification, NotificationEvent, Prisma, UserRole } from '@prisma/client';

import { DatabaseService } from '../../shared/database/database.service';
import {
  BadRequestApplicationError,
  NotFoundApplicationError,
} from '../../shared/errors/application.error';
import {
  NotificationPresentationDto,
  NotificationAudience,
  NotificationPresenterService,
} from './notification-presenter.service';
import {
  NotificationListResponseDto,
  NotificationUnreadCountResponseDto,
} from './dto/notification-response.dto';
import { NotificationEventsService } from './notification-events.service';
import { decodeNotificationCursor, encodeNotificationCursor } from './notification-cursor';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { MarkAllNotificationsReadResponse } from './dto/notification-preferences.dto';
import { NotificationRealtimeService } from './notification-realtime.service';

const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_PAGE_SIZE = 20;
const DAY_IN_MS = 24 * 60 * 60 * 1_000;

type NotificationLanguage = 'ar' | 'en';

class ConcurrentNotificationMutation extends Error {}

@Injectable()
export class NotificationClock {
  now(): Date {
    return new Date();
  }
}

@Injectable()
export class NotificationInboxService {
  constructor(
    private readonly database: DatabaseService,
    private readonly presenter: NotificationPresenterService,
    private readonly events: NotificationEventsService = new NotificationEventsService(),
    private readonly clock: NotificationClock = new NotificationClock(),
    @Optional()
    private readonly notificationRealtime?: NotificationRealtimeService,
  ) {}

  async list(
    userId: string,
    query: NotificationQueryDto = {},
  ): Promise<NotificationListResponseDto> {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    this.assertPageSize(limit);
    const now = this.clock.now();
    const cursor = query.cursor
      ? decodeNotificationCursor(query.cursor)
      : undefined;
    const retentionCutoff = await this.retentionCutoff(userId, now);
    const userContext = await this.userContextFor(userId);

    const where: Prisma.NotificationWhereInput = {
      user_id: userId,
      created_at: { gte: retentionCutoff },
      ...(query.readState === undefined
        ? {}
        : { is_read: query.readState === 'read' }),
      ...(query.type === undefined ? {} : { type: query.type }),
      ...(cursor === undefined
        ? {}
        : {
            OR: [
              { created_at: { lt: cursor.createdAt } },
              {
                created_at: cursor.createdAt,
                id: { lt: cursor.id },
              },
            ],
          }),
    };

    const records = await this.database.notification.findMany({
      where,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = records.slice(0, limit);
    const nextRecord = records.length > limit ? page[page.length - 1] : undefined;

    return {
      items: page.map((record) =>
        this.presenter.present(record, userContext.language, {
          audience: userContext.audience,
        }),
      ),
      nextCursor: nextRecord
        ? encodeNotificationCursor({
            createdAt: nextRecord.created_at,
            id: nextRecord.id,
          })
        : null,
    };
  }

  async unreadCount(
    userId: string,
    query: Pick<NotificationQueryDto, 'type'> = {},
  ): Promise<NotificationUnreadCountResponseDto> {
    const retentionCutoff = await this.retentionCutoff(userId, this.clock.now());
    const unreadCount = await this.database.notification.count({
      where: {
        user_id: userId,
        is_read: false,
        created_at: { gte: retentionCutoff },
        ...(query.type === undefined ? {} : { type: query.type }),
      },
    });

    return { unreadCount };
  }

  async setReadState(
    userId: string,
    notificationId: string,
    state: 'read' | 'unread',
  ): Promise<NotificationPresentationDto> {
    if (state !== 'read' && state !== 'unread') {
      throw new BadRequestApplicationError(
        'Notification read state is invalid',
        'NOTIFICATION_READ_STATE_INVALID',
      );
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const outcome = await this.database.$transaction(async (transaction) => {
          const current = await this.findOwnedRetained(
            transaction,
            userId,
            notificationId,
            this.clock.now(),
          );
          const shouldBeRead = state === 'read';
          if (current.is_read === shouldBeRead) {
            return {
              presentation: await this.presentForUser(userId, current),
              event: undefined,
            };
          }

          const readAt = shouldBeRead ? this.clock.now() : null;
          const result = await transaction.notification.updateMany({
            where: {
              id: notificationId,
              user_id: userId,
              is_read: current.is_read,
              aggregate_version: current.aggregate_version,
            },
            data: {
              is_read: shouldBeRead,
              read_at: readAt,
              aggregate_version: { increment: 1 },
            },
          });
          if (result.count !== 1) throw new ConcurrentNotificationMutation();

          const updated = await transaction.notification.findFirst({
            where: { id: notificationId, user_id: userId },
          });
          if (!updated) throw this.notFound();
          const event = await this.events.appendReadStateChanged(
            transaction,
            updated,
          );
          return {
            presentation: await this.presentForUser(userId, updated),
            event,
          };
        });
        if (outcome.event) {
          void this.notificationRealtime?.publishReadStateChanged(
            outcome.event,
          );
        }
        return outcome.presentation;
      } catch (error) {
        if (error instanceof ConcurrentNotificationMutation) continue;
        throw error;
      }
    }

    throw new BadRequestApplicationError(
      'Notification changed concurrently; retry the command',
      'NOTIFICATION_CONCURRENT_UPDATE',
    );
  }

  async markAllRead(userId: string): Promise<MarkAllNotificationsReadResponse> {
    const snapshotAt = this.clock.now();
    const retentionCutoff = await this.retentionCutoff(userId, snapshotAt);
    const events: NotificationEvent[] = [];

    const updatedCount = await this.database.$transaction(async (transaction) => {
      const unread = await transaction.notification.findMany({
        where: {
          user_id: userId,
          is_read: false,
          created_at: {
            gte: retentionCutoff,
            lte: snapshotAt,
          },
        },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      });
      let count = 0;

      for (const current of unread) {
        const result = await transaction.notification.updateMany({
          where: {
            id: current.id,
            user_id: userId,
            is_read: false,
            aggregate_version: current.aggregate_version,
            created_at: { lte: snapshotAt },
          },
          data: {
            is_read: true,
            read_at: snapshotAt,
            aggregate_version: { increment: 1 },
          },
        });
        if (result.count !== 1) continue;

        count += 1;
        const event = await this.events.appendReadStateChanged(transaction, {
          ...current,
          is_read: true,
          read_at: snapshotAt,
          aggregate_version: current.aggregate_version + 1,
          updated_at: snapshotAt,
        });
        events.push(event);
      }

      return count;
    });

    for (const event of events) {
      void this.notificationRealtime?.publishReadStateChanged(event);
    }

    return {
      updatedCount,
      snapshotAt: snapshotAt.toISOString(),
    };
  }

  private async retentionCutoff(userId: string, now: Date): Promise<Date> {
    const preference = await this.database.notificationPreference.findUnique({
      where: { user_id: userId },
      select: { retention_days: true },
    });
    const retentionDays = preference?.retention_days ?? DEFAULT_RETENTION_DAYS;
    return new Date(now.getTime() - retentionDays * DAY_IN_MS);
  }

  private async userContextFor(userId: string): Promise<{
    language: NotificationLanguage;
    audience?: NotificationAudience;
  }> {
    const user = await this.database.user.findUnique({
      where: { id: userId },
      select: { preferred_language: true, role: true },
    });
    return {
      language: user?.preferred_language === 'ar' ? 'ar' : 'en',
      audience: this.notificationAudience(user?.role),
    };
  }

  private notificationAudience(
    role: UserRole | undefined,
  ): NotificationAudience | undefined {
    if (role === UserRole.owner) return 'owner';
    if (role === UserRole.contributor) return 'contributor';
    if (role === UserRole.admin) return 'admin';
    return undefined;
  }

  private async findOwnedRetained(
    transaction: Prisma.TransactionClient,
    userId: string,
    notificationId: string,
    now: Date,
  ): Promise<Notification> {
    const retentionDays =
      (
        await transaction.notificationPreference.findUnique({
          where: { user_id: userId },
          select: { retention_days: true },
        })
      )?.retention_days ?? DEFAULT_RETENTION_DAYS;
    const notification = await transaction.notification.findFirst({
      where: {
        id: notificationId,
        user_id: userId,
        created_at: { gte: new Date(now.getTime() - retentionDays * DAY_IN_MS) },
      },
    });
    if (!notification) throw this.notFound();
    return notification;
  }

  private async presentForUser(
    userId: string,
    notification: Notification,
  ): Promise<NotificationPresentationDto> {
    const userContext = await this.userContextFor(userId);
    return this.presenter.present(notification, userContext.language, {
      audience: userContext.audience,
    });
  }

  private notFound(): NotFoundApplicationError {
    return new NotFoundApplicationError(
      'Notification was not found',
      'NOTIFICATION_NOT_FOUND',
    );
  }

  private assertPageSize(limit: number): void {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestApplicationError(
        'Notification page size is invalid',
        'NOTIFICATION_LIMIT_INVALID',
      );
    }
  }
}
