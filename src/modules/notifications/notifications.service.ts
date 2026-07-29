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

export type ApplicationNotificationAction =
  | 'submitted'
  | 'withdrawn'
  | 'accepted'
  | 'declined_by_owner'
  | 'not_selected'
  | 'owner_review_reminder'
  | 'expired';

export interface ApplicationNotificationInput {
  userId: string;
  applicationId: string;
  contributionRequestId: string;
  action: ApplicationNotificationAction;
}

const APPLICATION_NOTIFICATION_COPY: Record<
  ApplicationNotificationAction,
  { title: string; message: string }
> = {
  submitted: {
    title: 'New Application received',
    message:
      'A contributor submitted an Application for your Contribution Request.',
  },
  withdrawn: {
    title: 'Application withdrawn',
    message:
      'A contributor withdrew an Application from your Contribution Request.',
  },
  accepted: {
    title: 'Application accepted',
    message: 'Your Application was accepted and an Assignment was created.',
  },
  declined_by_owner: {
    title: 'Application declined by owner',
    message:
      'The Project owner declined your Application. This decision affects only this Application.',
  },
  not_selected: {
    title: 'Another contributor was selected',
    message:
      'Another contributor was selected for this Contribution Request. This does not affect your eligibility or reputation.',
  },
  owner_review_reminder: {
    title: 'Application awaiting review',
    message:
      'An Application for your Contribution Request has been waiting for review for 3 days.',
  },
  expired: {
    title: 'Application review window expired',
    message:
      'Your Application expired because it was not reviewed within 7 days. This is not an owner rejection and does not affect your eligibility or reputation.',
  },
};

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
    options?: {
      transaction?: Prisma.TransactionClient;
      emitRealtime?: boolean;
    },
  ): Promise<NotificationCreateResultDto> {
    const notifications =
      options?.transaction?.notification ?? this.database.notification;
    const deduplicationKey = `application:${input.applicationId}:${input.action}`;
    const copy = APPLICATION_NOTIFICATION_COPY[input.action];
    const existing = await notifications.findUnique({
      where: { deduplication_key: deduplicationKey },
    });
    let notification = existing;
    let created = false;
    if (!notification) {
      try {
        notification = await notifications.create({
          data: {
            user_id: input.userId,
            type: NotificationType.application_status,
            title: copy.title,
            message: copy.message,
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
        notification = await notifications.findUniqueOrThrow({
          where: { deduplication_key: deduplicationKey },
        });
      }
    }
    const realtimeNotification = this.presentRealtimeNotification(notification);
    const deliveredRealtime = created && options?.emitRealtime !== false
      ? this.notificationsGateway.emitNotification(realtimeNotification)
      : false;

    return {
      notificationId: notification.id,
      created,
      deliveredRealtime,
      notification: realtimeNotification,
    };
  }

  emitApplicationNotifications(
    notifications: RealtimeNotificationDto[],
  ): void {
    for (const notification of notifications) {
      this.notificationsGateway.emitNotification(notification);
    }
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
