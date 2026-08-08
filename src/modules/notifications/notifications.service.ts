import { Injectable } from '@nestjs/common';
import {
  Notification,
  NotificationType,
  Prisma,
  UserRole,
  UserStatus,
} from '@prisma/client';

import { DatabaseService } from '../../shared/database/database.service';
import { NotificationsInboxDto } from './dto/notifications-inbox.dto';
import { RealtimeNotificationDto } from './dto/realtime-notification.dto';
import { NotificationsGateway } from './notifications.gateway';

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

const PROPOSAL_NOTIFICATION_COPY: Record<
  ProposalNotificationAction,
  { title: string; message: string }
> = {
  revision_requested: {
    title: 'Proposal revision requested',
    message:
      'The Project owner requested a revision to your Contribution Proposal.',
  },
  accepted: {
    title: 'Proposal accepted',
    message:
      'The Project owner accepted your Contribution Proposal and created an attributed draft Contribution Request.',
  },
  declined: {
    title: 'Proposal declined',
    message:
      'The Project owner declined your Contribution Proposal. Review the proposal for the owner’s reason.',
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
      ? this.notificationsGateway.emitNotification(realtimeNotification)
      : false;

    // A completed analysis is an actionable admin queue item. Persist one
    // inbox row per active admin so the bell works after a fresh login as well
    // as for already-connected admin sessions.
    if (input.status === 'ready_for_review' && this.database.user) {
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
          this.notificationsGateway.emitNotification(
            this.presentRealtimeNotification(adminPersisted.notification),
          );
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
    const existing = await this.database.notification.findUnique({
      where: { deduplication_key: deduplicationKey },
    });
    let notification = existing;
    let created = false;

    if (!notification) {
      try {
        notification = await this.database.notification.create({
          data: {
            user_id: recipientUserId,
            type: NotificationType.skill_profile_generation,
            title:
              audience === 'admin'
                ? this.getAdminSkillProfileGenerationTitle(input.status)
                : this.getSkillProfileGenerationTitle(input.status),
            message:
              audience === 'admin'
                ? this.getAdminSkillProfileGenerationMessage(input)
                : this.getSkillProfileGenerationMessage(input),
            metadata: {
              generationId: input.generationId,
              status: input.status,
              ...(input.skillCount === undefined
                ? {}
                : { skillCount: input.skillCount }),
              ...(input.selectedRepositoryCount === undefined
                ? {}
                : { selectedRepositoryCount: input.selectedRepositoryCount }),
              ...(audience === 'admin' ? { audience: 'admin' } : {}),
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

    return { notification, created };
  }

  async listForUser(userId: string, limit = 50): Promise<NotificationsInboxDto> {
    const requestedLimit = Number.isFinite(limit) ? Math.trunc(limit) : 50;
    const boundedLimit = Math.min(Math.max(requestedLimit, 1), 100);
    const [notifications, unreadCount] = await Promise.all([
      this.database.notification.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        take: boundedLimit,
      }),
      this.database.notification.count({
        where: { user_id: userId, is_read: false },
      }),
    ]);

    return {
      items: notifications.map((notification) =>
        this.presentRealtimeNotification(notification),
      ),
      unreadCount,
    };
  }

  async markRead(userId: string, notificationId: string) {
    const result = await this.database.notification.updateMany({
      where: {
        id: notificationId,
        user_id: userId,
        is_read: false,
      },
      data: {
        is_read: true,
        read_at: new Date(),
      },
    });

    return { success: true, updatedCount: result.count };
  }

  async markAllRead(userId: string) {
    const result = await this.database.notification.updateMany({
      where: { user_id: userId, is_read: false },
      data: {
        is_read: true,
        read_at: new Date(),
      },
    });

    return { success: true, updatedCount: result.count };
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

  async createProposalNotification(
    input: ProposalNotificationInput,
    options?: {
      transaction?: Prisma.TransactionClient;
      emitRealtime?: boolean;
    },
  ): Promise<NotificationCreateResultDto> {
    const notifications =
      options?.transaction?.notification ?? this.database.notification;
    const sequence =
      input.action === 'revision_requested'
        ? `:${input.revisionRequestSequence ?? 0}`
        : '';
    const deduplicationKey =
      `proposal:${input.proposalId}:${input.action}${sequence}`;
    const copy = PROPOSAL_NOTIFICATION_COPY[input.action];
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
            type: NotificationType.proposal_status,
            title: copy.title,
            message: copy.message,
            metadata: {
              proposalId: input.proposalId,
              projectId: input.projectId,
              action: input.action,
              ...(input.revisionRequestSequence === undefined
                ? {}
                : {
                    revisionRequestSequence:
                      input.revisionRequestSequence,
                  }),
              ...(input.resultingContributionRequestId === undefined
                ? {}
                : {
                    resultingContributionRequestId:
                      input.resultingContributionRequestId,
                  }),
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
    const deliveredRealtime =
      created && options?.emitRealtime !== false
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

  emitProposalNotifications(
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

  private getSkillProfileGenerationTitle(
    status: SkillProfileGenerationNotificationStatus,
  ): string {
    if (status === 'ready_for_review') return 'Skill analysis ready for review';
    if (status === 'needs_more_evidence') return 'More evidence is needed';
    return 'Skill analysis failed';
  }

  private getSkillProfileGenerationMessage(
    input: SkillProfileGenerationNotificationInput,
  ): string {
    if (input.status === 'ready_for_review') {
      const skillCount = input.skillCount ?? 0;
      return `Your skill analysis is complete. ${skillCount} skill${skillCount === 1 ? '' : 's'} are waiting for admin review.`;
    }
    if (input.status === 'needs_more_evidence') {
      return 'Your skill analysis finished, but there was not enough evidence. Select more repositories or try again.';
    }
    return 'Your skill analysis could not be completed. Please try again.';
  }

  private getAdminSkillProfileGenerationTitle(
    status: SkillProfileGenerationNotificationStatus,
  ): string {
    if (status === 'ready_for_review') {
      return 'Skill analysis awaiting admin review';
    }
    return this.getSkillProfileGenerationTitle(status);
  }

  private getAdminSkillProfileGenerationMessage(
    input: SkillProfileGenerationNotificationInput,
  ): string {
    if (input.status === 'ready_for_review') {
      const skillCount = input.skillCount ?? 0;
      return `A contributor has a completed skill analysis with ${skillCount} skill${skillCount === 1 ? '' : 's'} waiting for your review.`;
    }
    return this.getSkillProfileGenerationMessage(input);
  }
}
