import { Injectable } from '@nestjs/common';
import { Notification, NotificationType, Prisma } from '@prisma/client';

import { DatabaseService } from '../../shared/database/database.service';
import { RealtimeNotificationDto } from './dto/realtime-notification.dto';
import { NotificationsGateway } from './notifications.gateway';

export interface SkillReviewNotificationInput {
  userId: string;
  skillProfileId: string;
  skillName: string;
  approved: boolean;
  activated: boolean;
}

export interface NotificationCreateResultDto {
  notificationId: string;
  created: boolean;
  deliveredRealtime: boolean;
  notification: RealtimeNotificationDto;
}

export interface ApplicationNotificationInput {
  userId: string;
  applicationId: string;
  contributionRequestId: string;
  action: 'submitted' | 'withdrawn';
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  async createSkillReviewNotification(
    input: SkillReviewNotificationInput,
  ): Promise<NotificationCreateResultDto> {
    const notification = await this.database.notification.create({
      data: {
        user_id: input.userId,
        type: NotificationType.skill_review,
        title: this.getSkillReviewTitle(input),
        message: this.getSkillReviewMessage(input),
        metadata: {
          skillProfileId: input.skillProfileId,
          skillName: input.skillName,
          approved: input.approved,
          activated: input.activated,
        },
      },
    });
    const realtimeNotification = this.presentRealtimeNotification(notification);
    const deliveredRealtime = this.notificationsGateway.emitNotification(
      realtimeNotification,
    );

    return {
      notificationId: notification.id,
      created: true,
      deliveredRealtime,
      notification: realtimeNotification,
    };
  }

  async createApplicationNotification(
    input: ApplicationNotificationInput,
  ): Promise<NotificationCreateResultDto> {
    const deduplicationKey = `application:${input.applicationId}:${input.action}`;
    const existing = await this.database.notification.findUnique({
      where: { deduplication_key: deduplicationKey },
    });
    let notification = existing;
    let created = false;
    if (!notification) {
      try {
        notification = await this.database.notification.create({
        data: {
          user_id: input.userId,
          type: NotificationType.application_status,
          title:
            input.action === 'submitted'
              ? 'New Application received'
              : 'Application withdrawn',
          message:
            input.action === 'submitted'
              ? 'A contributor submitted an Application for your Contribution Request.'
              : 'A contributor withdrew an Application from your Contribution Request.',
          metadata: {
            applicationId: input.applicationId,
            contributionRequestId: input.contributionRequestId,
            action: input.action,
          },
          deduplication_key: deduplicationKey,
          },
        });
        created = true;
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        ) {
          throw error;
        }
        notification = await this.database.notification.findUniqueOrThrow({
          where: { deduplication_key: deduplicationKey },
        });
      }
    }
    const realtimeNotification = this.presentRealtimeNotification(notification);
    const deliveredRealtime = created
      ? this.notificationsGateway.emitNotification(realtimeNotification)
      : false;

    return {
      notificationId: notification.id,
      created,
      deliveredRealtime,
      notification: realtimeNotification,
    };
  }

  private presentRealtimeNotification(
    notification: Notification,
  ): RealtimeNotificationDto {
    return {
      notificationId: notification.id,
      userId: notification.user_id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      metadata: notification.metadata as Prisma.JsonValue,
      isRead: notification.is_read,
      readAt: notification.read_at,
      createdAt: notification.created_at,
    };
  }

  private getSkillReviewTitle(input: SkillReviewNotificationInput): string {
    if (input.approved) {
      return input.activated
        ? 'Skill profile approved'
        : 'Skill approved';
    }

    return 'Skill review update';
  }

  private getSkillReviewMessage(input: SkillReviewNotificationInput): string {
    if (input.approved && input.activated) {
      return `Your ${input.skillName} skill was approved. Your contributor account is now active.`;
    }

    if (input.approved) {
      return `Your ${input.skillName} skill was approved.`;
    }

    return `Your ${input.skillName} skill was reviewed and was not approved.`;
  }
}
