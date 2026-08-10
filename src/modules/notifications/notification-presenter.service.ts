import { Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';

import { findNotificationTemplate } from './templates/notification-template.catalog';
import { NotificationPresentationResponseDto } from './dto/notification-response.dto';
import {
  NotificationLanguage,
  NotificationPriorityValue,
} from './templates/notification-template.types';

export interface SemanticNotificationRecord {
  id: string;
  type: NotificationType;
  template_key: string;
  template_version: number;
  parameters: unknown;
  deep_link: string | null;
  priority: NotificationPriorityValue;
  is_read: boolean;
  read_at: Date | null;
  created_at: Date;
  aggregate_version: number;
}

export type NotificationPresentationDto = NotificationPresentationResponseDto;
export type NotificationAudience = 'owner' | 'contributor' | 'admin';

@Injectable()
export class NotificationPresenterService {
  present(
    notification: SemanticNotificationRecord,
    language: NotificationLanguage,
    options: { audience?: NotificationAudience } = {},
  ): NotificationPresentationDto {
    const template = findNotificationTemplate(
      notification.template_key,
      notification.template_version,
    );

    let copy: { title: string; body: string };
    if (!template) {
      copy = this.genericCopy(language);
    } else {
      try {
        copy = template.render[language](
          this.requireParameterObject(notification.parameters),
        );
      } catch {
        copy = this.genericCopy(language);
      }
    }

    return {
      notificationId: notification.id,
      type: notification.type,
      templateKey: notification.template_key,
      templateVersion: notification.template_version,
      title: copy.title,
      body: copy.body,
      deepLink: this.deepLinkForAudience(notification, options.audience),
      priority: notification.priority,
      isRead: notification.is_read,
      readAt: notification.read_at,
      createdAt: notification.created_at,
      aggregateVersion: notification.aggregate_version,
    };
  }

  private deepLinkForAudience(
    notification: SemanticNotificationRecord,
    audience: NotificationAudience | undefined,
  ): string | null {
    if (
      audience === 'owner' &&
      notification.type === 'application_status' &&
      ['application.submitted', 'application.withdrawn', 'application.owner_review_reminder'].includes(
        notification.template_key,
      )
    ) {
      const parameters = this.requireParameterObject(notification.parameters);
      const contributionRequestId = parameters.contributionRequestId;
      if (typeof contributionRequestId === 'string' && contributionRequestId.length > 0) {
        return `/contribution-requests/${encodeURIComponent(contributionRequestId)}`;
      }
    }

    return notification.deep_link;
  }

  private requireParameterObject(value: unknown): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('NOTIFICATION_PARAMETERS_INVALID');
    }

    return value as Record<string, unknown>;
  }

  private genericCopy(language: NotificationLanguage): {
    title: string;
    body: string;
  } {
    if (language === 'ar') {
      return {
        title: 'إشعار جديد',
        body: 'لديك تحديث جديد في شارك.',
      };
    }

    return {
      title: 'New notification',
      body: 'You have a new update in Share-k.',
    };
  }
}
