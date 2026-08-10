import { Injectable, Optional } from '@nestjs/common';
import {
  Notification,
  Prisma,
  UserRole,
  UserStatus,
} from '@prisma/client';

import { DatabaseService } from '../../shared/database/database.service';
import { RealtimeNotificationDto } from './dto/realtime-notification.dto';
import { NotificationEventsService } from './notification-events.service';
import { NotificationPresenterService } from './notification-presenter.service';
import { NotificationRealtimeService } from './notification-realtime.service';
import {
  buildApplicationNotificationDeepLink,
  buildConversationActivityNotificationDeepLink,
  buildProposalNotificationDeepLink,
  buildSkillReviewNotificationDeepLink,
  getNotificationTemplatePolicy,
  validateNotificationTemplateParameters,
} from './templates/notification-template.catalog';
import { NotificationTemplateKey } from './templates/notification-template.types';

export interface SkillReviewNotificationInput {
  userId: string;
  skillProfileId: string;
  skillName: string;
  approved: boolean;
  activated: boolean;
}

export type SkillProfileGenerationNotificationStatus =
  | 'ready_for_review'
  | 'needs_more_evidence'
  | 'failed';

export interface SkillProfileGenerationNotificationInput {
  userId: string;
  generationId: string;
  status: SkillProfileGenerationNotificationStatus;
  skillCount?: number;
  selectedRepositoryCount?: number;
}

export interface NotificationCreateResultDto {
  notificationId: string;
  created: boolean;
  updated?: boolean;
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

export type ProposalNotificationAction =
  | 'revision_requested'
  | 'accepted'
  | 'declined';

export interface ProposalNotificationInput {
  userId: string;
  proposalId: string;
  projectId: string;
  action: ProposalNotificationAction;
  revisionRequestSequence?: number;
  resultingContributionRequestId?: string;
}

export interface ConversationActivityNotificationInput {
  userId: string;
  conversationId: string;
  messageId: string;
  senderName: string;
  messagePreview: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly notificationPresenter: NotificationPresenterService =
      new NotificationPresenterService(),
    private readonly notificationEvents: NotificationEventsService =
      new NotificationEventsService(),
    @Optional()
    private readonly notificationRealtime?: NotificationRealtimeService,
  ) {}

  async createSkillReviewNotification(
    input: SkillReviewNotificationInput,
  ): Promise<NotificationCreateResultDto> {
    const templateKey = this.getSkillReviewTemplateKey(input);
    const parameters = {
      skillProfileId: input.skillProfileId,
      skillName: input.skillName,
    };
    validateNotificationTemplateParameters(templateKey, parameters);
    const policy = getNotificationTemplatePolicy(templateKey);
    const notification = await this.database.$transaction(
      async (transaction) => {
        const created = await transaction.notification.create({
          data: {
            user_id: input.userId,
            type: policy.category,
            template_key: templateKey,
            template_version: 1,
            parameters,
            deep_link: buildSkillReviewNotificationDeepLink(),
            priority: policy.priority,
          },
        });
        await this.notificationEvents.appendCreated(transaction, created);
        return created;
      },
    );
    const realtimeNotification = this.presentRealtimeNotification(notification);
    const deliveredRealtime = await this.publishCreated(notification.id);

    return {
      notificationId: notification.id,
      created: true,
      deliveredRealtime,
      notification: realtimeNotification,
    };
  }

  async createSkillProfileGenerationNotification(
    input: SkillProfileGenerationNotificationInput,
  ): Promise<NotificationCreateResultDto> {
    const deduplicationKey =
      `skill-profile-generation:${input.generationId}:${input.status}`;
    const persisted = await this.persistSkillProfileGenerationNotification(
      input,
      input.userId,
      deduplicationKey,
      'contributor',
    );
    const { notification, created } = persisted;

    const realtimeNotification = this.presentRealtimeNotification(notification);
    const deliveredRealtime = created
      ? await this.publishCreated(notification.id)
      : false;

    // A completed analysis is an actionable admin queue item. Persist one
    // inbox row per active admin so the bell works after a fresh login as well
    // as for already-connected admin sessions.
    if (input.status === 'ready_for_review') {
      const admins = await this.database.user.findMany({
        where: { role: UserRole.admin, status: UserStatus.active },
        select: { id: true },
      });

      for (const admin of admins) {
        if (admin.id === input.userId) continue;

        const adminPersisted =
          await this.persistSkillProfileGenerationNotification(
            input,
            admin.id,
            `${deduplicationKey}:admin:${admin.id}`,
            'admin',
        );
        if (adminPersisted.created) {
          await this.publishCreated(adminPersisted.notification.id);
        }
      }
    }

    return {
      notificationId: notification.id,
      created,
      deliveredRealtime,
      notification: realtimeNotification,
    };
  }

  private async persistSkillProfileGenerationNotification(
    input: SkillProfileGenerationNotificationInput,
    recipientUserId: string,
    deduplicationKey: string,
    audience: 'contributor' | 'admin',
  ): Promise<{ notification: Notification; created: boolean }> {
    const templateKey =
      `skill_profile_generation.${input.status}` as NotificationTemplateKey;
    const parameters = {
      generationId: input.generationId,
      status: input.status,
      audience,
      ...(input.skillCount === undefined
        ? {}
        : { skillCount: input.skillCount }),
      ...(input.selectedRepositoryCount === undefined
        ? {}
        : { selectedRepositoryCount: input.selectedRepositoryCount }),
    };
    validateNotificationTemplateParameters(templateKey, parameters);
    const policy = getNotificationTemplatePolicy(templateKey);

    try {
      return await this.database.$transaction(async (transaction) => {
        const existing = await transaction.notification.findUnique({
          where: { deduplication_key: deduplicationKey },
        });
        if (existing) return { notification: existing, created: false };

        const notification = await transaction.notification.create({
          data: {
            user_id: recipientUserId,
            type: policy.category,
            template_key: templateKey,
            template_version: 1,
            parameters,
            deep_link: null,
            priority: policy.priority,
            deduplication_key: deduplicationKey,
          },
        });
        await this.notificationEvents.appendCreated(transaction, notification);
        return { notification, created: true };
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;
      const notification = await this.database.notification.findUniqueOrThrow({
        where: { deduplication_key: deduplicationKey },
      });
      return { notification, created: false };
    }
  }

  async createApplicationNotification(
    input: ApplicationNotificationInput,
    options?: {
      transaction?: Prisma.TransactionClient;
      emitRealtime?: boolean;
    },
  ): Promise<NotificationCreateResultDto> {
    const templateKey = `application.${input.action}` as NotificationTemplateKey;
    const parameters = {
      applicationId: input.applicationId,
      contributionRequestId: input.contributionRequestId,
    };
    validateNotificationTemplateParameters(templateKey, parameters);
    const deepLink = buildApplicationNotificationDeepLink(input.action, parameters);
    const policy = getNotificationTemplatePolicy(templateKey);
    const deduplicationKey = `application:${input.applicationId}:${input.action}`;
    if (!options?.transaction) {
      let persisted: NotificationCreateResultDto;
      try {
        persisted = await this.database.$transaction((transaction) =>
          this.createApplicationNotification(input, {
            transaction,
            emitRealtime: false,
          }),
        );
      } catch (error) {
        if (!this.isUniqueConstraintError(error)) throw error;
        const notification = await this.database.notification.findUniqueOrThrow({
          where: { deduplication_key: deduplicationKey },
        });
        const realtimeNotification =
          this.presentRealtimeNotification(notification);
        return {
          notificationId: notification.id,
          created: false,
          deliveredRealtime: false,
          notification: realtimeNotification,
        };
      }
      const deliveredRealtime =
        (persisted.created || persisted.updated === true) &&
        options?.emitRealtime !== false
          ? await this.publishCreated(persisted.notificationId)
          : false;

      return { ...persisted, deliveredRealtime };
    }

    const notifications = options.transaction.notification;
    const existing = await notifications.findUnique({
      where: { deduplication_key: deduplicationKey },
    });
    let notification = existing;
    let created = false;
    if (!notification) {
      notification = await notifications.create({
        data: {
          user_id: input.userId,
          type: policy.category,
          template_key: templateKey,
          template_version: 1,
          parameters,
          deep_link: deepLink,
          priority: policy.priority,
          deduplication_key: deduplicationKey,
        },
      });
      created = true;
      await this.notificationEvents.appendCreated(
        options.transaction,
        notification,
      );
    }
    const realtimeNotification = this.presentRealtimeNotification(notification);
    const deliveredRealtime =
      created && options?.emitRealtime !== false
        ? await this.publishCreated(notification.id)
        : false;

    return {
      notificationId: notification.id,
      created,
      deliveredRealtime,
      notification: realtimeNotification,
    };
  }

  async createProposalNotification(
    input: ProposalNotificationInput,
    options?: {
      transaction?: Prisma.TransactionClient;
      emitRealtime?: boolean;
    },
  ): Promise<NotificationCreateResultDto> {
    const templateKey = `proposal.${input.action}` as NotificationTemplateKey;
    const parameters = {
      proposalId: input.proposalId,
      projectId: input.projectId,
      ...(input.revisionRequestSequence === undefined
        ? {}
        : { revisionRequestSequence: input.revisionRequestSequence }),
      ...(input.resultingContributionRequestId === undefined
        ? {}
        : { resultingContributionRequestId: input.resultingContributionRequestId }),
    };
    validateNotificationTemplateParameters(templateKey, parameters);
    const deepLink = buildProposalNotificationDeepLink(parameters);
    const policy = getNotificationTemplatePolicy(templateKey);
    const sequence =
      input.action === 'revision_requested'
        ? `:${input.revisionRequestSequence ?? 0}`
        : '';
    const deduplicationKey =
      `proposal:${input.proposalId}:${input.action}${sequence}`;
    if (!options?.transaction) {
      let persisted: NotificationCreateResultDto;
      try {
        persisted = await this.database.$transaction((transaction) =>
          this.createProposalNotification(input, {
            transaction,
            emitRealtime: false,
          }),
        );
      } catch (error) {
        if (!this.isUniqueConstraintError(error)) throw error;
        const notification = await this.database.notification.findUniqueOrThrow({
          where: { deduplication_key: deduplicationKey },
        });
        const realtimeNotification =
          this.presentRealtimeNotification(notification);
        return {
          notificationId: notification.id,
          created: false,
          deliveredRealtime: false,
          notification: realtimeNotification,
        };
      }
      const deliveredRealtime =
        persisted.created && options?.emitRealtime !== false
          ? await this.publishCreated(persisted.notificationId)
          : false;

      return { ...persisted, deliveredRealtime };
    }

    const notifications = options.transaction.notification;
    const existing = await notifications.findUnique({
      where: { deduplication_key: deduplicationKey },
    });
    let notification = existing;
    let created = false;
    if (!notification) {
      notification = await notifications.create({
        data: {
          user_id: input.userId,
          type: policy.category,
          template_key: templateKey,
          template_version: 1,
          parameters,
          deep_link: deepLink,
          priority: policy.priority,
          deduplication_key: deduplicationKey,
        },
      });
      created = true;
      await this.notificationEvents.appendCreated(
        options.transaction,
        notification,
      );
    }
    const realtimeNotification = this.presentRealtimeNotification(notification);
    const deliveredRealtime =
      created && options?.emitRealtime !== false
        ? await this.publishCreated(notification.id)
        : false;

    return {
      notificationId: notification.id,
      created,
      deliveredRealtime,
      notification: realtimeNotification,
    };
  }

  async createConversationActivityNotification(
    input: ConversationActivityNotificationInput,
    options?: {
      transaction?: Prisma.TransactionClient;
      emitRealtime?: boolean;
    },
  ): Promise<NotificationCreateResultDto> {
    const templateKey: NotificationTemplateKey = 'conversation.activity';
    const parameters = {
      conversationId: input.conversationId,
      messageId: input.messageId,
      senderName: input.senderName,
      messagePreview: input.messagePreview,
      messageCount: 1,
    };
    validateNotificationTemplateParameters(templateKey, parameters);
    const policy = getNotificationTemplatePolicy(templateKey);
    const deepLink = buildConversationActivityNotificationDeepLink(parameters);
    const deduplicationKey =
      `conversation:${input.conversationId}:${input.messageId}`;

    if (!options?.transaction) {
      let persisted: NotificationCreateResultDto;
      try {
        persisted = await this.database.$transaction((transaction) =>
          this.createConversationActivityNotification(input, {
            transaction,
            emitRealtime: false,
          }),
        );
      } catch (error) {
        if (!this.isUniqueConstraintError(error)) throw error;
        const notification = await this.database.notification.findUniqueOrThrow({
          where: { deduplication_key: deduplicationKey },
        });
        return {
          notificationId: notification.id,
          created: false,
          deliveredRealtime: false,
          notification: this.presentRealtimeNotification(notification),
        };
      }

      const deliveredRealtime =
        (persisted.created || persisted.updated === true) &&
        options?.emitRealtime !== false
          ? await this.publishCreated(persisted.notificationId)
          : false;
      return { ...persisted, deliveredRealtime };
    }

    const notifications = options.transaction.notification;
    const existing = await notifications.findFirst({
      where: {
        user_id: input.userId,
        type: policy.category,
        template_key: templateKey,
        is_read: false,
        parameters: {
          path: ['conversationId'],
          equals: input.conversationId,
        },
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    });
    if (existing) {
      const currentParameters =
        validateNotificationTemplateParameters(
          templateKey,
          existing.parameters,
        );
      if (currentParameters.messageId === input.messageId) {
        return {
          notificationId: existing.id,
          created: false,
          deliveredRealtime: false,
          notification: this.presentRealtimeNotification(existing),
        };
      }

      const updated = await notifications.update({
        where: { id: existing.id },
        data: {
          parameters: {
            ...currentParameters,
            messageId: input.messageId,
            senderName: input.senderName,
            messagePreview: input.messagePreview,
            messageCount: currentParameters.messageCount + 1,
          },
          aggregate_version: { increment: 1 },
        },
      });
      await this.notificationEvents.appendCreated(options.transaction, updated);
      return {
        notificationId: updated.id,
        created: false,
        updated: true,
        deliveredRealtime: false,
        notification: this.presentRealtimeNotification(updated),
      };
    }

    const notification = await notifications.create({
      data: {
        user_id: input.userId,
        type: policy.category,
        template_key: templateKey,
        template_version: 1,
        parameters,
        deep_link: deepLink,
        priority: policy.priority,
        deduplication_key: deduplicationKey,
      },
    });
    await this.notificationEvents.appendCreated(options.transaction, notification);

    return {
      notificationId: notification.id,
      created: true,
      deliveredRealtime: false,
      notification: this.presentRealtimeNotification(notification),
    };
  }

  async emitNotificationCreated(notificationId: string): Promise<boolean> {
    return this.publishCreated(notificationId);
  }

  emitApplicationNotifications(
    notifications: RealtimeNotificationDto[],
  ): void {
    for (const notification of notifications) {
      void this.publishCreated(notification.notificationId);
    }
  }

  emitProposalNotifications(
    notifications: RealtimeNotificationDto[],
  ): void {
    for (const notification of notifications) {
      void this.publishCreated(notification.notificationId);
    }
  }

  private async publishCreated(notificationId: string): Promise<boolean> {
    return (await this.notificationRealtime?.publishCreated(notificationId)) ?? false;
  }

  private presentRealtimeNotification(
    notification: Notification,
  ): RealtimeNotificationDto {
    if (notification.template_key) {
      const presentation = this.notificationPresenter.present(
        notification,
        'en',
      );

      return {
        notificationId: notification.id,
        userId: notification.user_id,
        type: notification.type,
        title: presentation.title,
        message: presentation.body,
        metadata: notification.parameters as Prisma.JsonValue,
        isRead: notification.is_read,
        readAt: notification.read_at,
        createdAt: notification.created_at,
      };
    }

    return {
      notificationId: notification.id,
      userId: notification.user_id,
      type: notification.type,
      title: notification.title ?? 'New notification',
      message: notification.message ?? 'You have a new update in Share-k.',
      metadata: notification.metadata as Prisma.JsonValue,
      isRead: notification.is_read,
      readAt: notification.read_at,
      createdAt: notification.created_at,
    };
  }

  private getSkillReviewTemplateKey(
    input: SkillReviewNotificationInput,
  ): 'skill_review.activated' | 'skill_review.approved' | 'skill_review.not_approved' {
    if (input.approved) {
      return input.activated
        ? 'skill_review.activated'
        : 'skill_review.approved';
    }

    return 'skill_review.not_approved';
  }

  private isUniqueConstraintError(
    error: unknown,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

}
