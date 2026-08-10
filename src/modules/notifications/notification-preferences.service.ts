import { Injectable } from '@nestjs/common';
import { NotificationCategoryPreference, NotificationType } from '@prisma/client';

import { DatabaseService } from '../../shared/database/database.service';
import {
  BadRequestApplicationError,
  ConflictApplicationError,
} from '../../shared/errors/application.error';
import {
  NotificationCategoryPreferenceResponse,
  NotificationPreferencesResponse,
  QuietHoursDto,
  UpdateNotificationPreferencesDto,
} from './dto/notification-preferences.dto';

export const REQUIRED_NOTIFICATION_TYPES = new Set<NotificationType>([
  NotificationType.account_security,
  NotificationType.moderation,
  NotificationType.application_status,
  NotificationType.assignment_status,
  NotificationType.delivery_update,
  NotificationType.proposal_status,
  NotificationType.assignment_call,
]);

const ALLOWED_RETENTION_DAYS = new Set([30, 90, 180, 365]);
const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_REVISION = 1;

interface QuietHoursValues {
  enabled: boolean;
  startLocal: Date | null;
  endLocal: Date | null;
  timeZone: string | null;
}

type PreferenceWithCategories = {
  user_id: string;
  retention_days: number;
  quiet_hours_enabled: boolean;
  quiet_start_local: Date | null;
  quiet_end_local: Date | null;
  quiet_timezone: string | null;
  revision: number;
  categories: NotificationCategoryPreference[];
};

@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly database: DatabaseService) {}

  async get(userId: string): Promise<NotificationPreferencesResponse> {
    const preference = await this.database.notificationPreference.findUnique({
      where: { user_id: userId },
      include: { categories: true },
    });
    return this.toResponse(preference as PreferenceWithCategories | null);
  }

  async update(
    userId: string,
    input: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferencesResponse> {
    this.assertRevision(input.expectedRevision);
    if (input.retentionDays !== undefined) {
      this.assertRetention(input.retentionDays);
    }
    const quietHours =
      input.quietHours === undefined
        ? undefined
        : this.parseQuietHours(input.quietHours);
    this.assertCategories(input.categories);
    const hasChanges =
      input.retentionDays !== undefined ||
      input.quietHours !== undefined ||
      (input.categories?.length ?? 0) > 0;

    return this.database.$transaction(async (transaction) => {
      const current = (await transaction.notificationPreference.findUnique({
        where: { user_id: userId },
        include: { categories: true },
      })) as PreferenceWithCategories | null;

      if (current && current.revision !== input.expectedRevision) {
        throw this.revisionConflict();
      }

      if (!current) {
        if (input.expectedRevision !== DEFAULT_REVISION) {
          throw this.revisionConflict();
        }

        if (hasChanges) {
          await transaction.notificationPreference.create({
            data: {
              user_id: userId,
              retention_days: input.retentionDays ?? DEFAULT_RETENTION_DAYS,
              quiet_hours_enabled: quietHours?.enabled ?? false,
              quiet_start_local: quietHours?.startLocal ?? null,
              quiet_end_local: quietHours?.endLocal ?? null,
              quiet_timezone: quietHours?.timeZone ?? null,
              revision: DEFAULT_REVISION + 1,
            },
          });
        }
      } else if (
        input.retentionDays !== undefined ||
        quietHours !== undefined ||
        input.categories !== undefined
      ) {
        const result = await transaction.notificationPreference.updateMany({
          where: {
            user_id: userId,
            revision: input.expectedRevision,
          },
          data: {
            ...(input.retentionDays === undefined
              ? {}
              : { retention_days: input.retentionDays }),
            ...(quietHours === undefined
              ? {}
              : {
                  quiet_hours_enabled: quietHours.enabled,
                  quiet_start_local: quietHours.startLocal,
                  quiet_end_local: quietHours.endLocal,
                  quiet_timezone: quietHours.timeZone,
                }),
            revision: { increment: 1 },
          },
        });
        if (result.count !== 1) throw this.revisionConflict();
      }

      if (input.categories !== undefined) {
        for (const category of input.categories) {
          await transaction.notificationCategoryPreference.upsert({
            where: {
              user_id_type: {
                user_id: userId,
                type: category.type,
              },
            },
            create: {
              user_id: userId,
              type: category.type,
              in_app_enabled: category.inAppEnabled,
              browser_enabled: category.browserEnabled ?? false,
            },
            update: {
              in_app_enabled: category.inAppEnabled,
              ...(category.browserEnabled === undefined
                ? {}
                : { browser_enabled: category.browserEnabled }),
            },
          });
        }
      }

      const updated = await transaction.notificationPreference.findUnique({
        where: { user_id: userId },
        include: { categories: true },
      });
      return this.toResponse(updated as PreferenceWithCategories | null);
    });
  }

  private toResponse(
    preference: PreferenceWithCategories | null,
  ): NotificationPreferencesResponse {
    const overrides = new Map(
      (preference?.categories ?? []).map((category) => [category.type, category]),
    );
    const categories: NotificationCategoryPreferenceResponse[] = Object.values(
      NotificationType,
    ).map((type) => {
      const override = overrides.get(type);
      const requiredInApp = REQUIRED_NOTIFICATION_TYPES.has(type);
      return {
        type,
        requiredInApp,
        inAppEnabled: requiredInApp ? true : override?.in_app_enabled ?? true,
        browserEnabled: override?.browser_enabled ?? false,
      };
    });

    return {
      retentionDays: preference?.retention_days ?? DEFAULT_RETENTION_DAYS,
      quietHours: {
        enabled: preference?.quiet_hours_enabled ?? false,
        startLocal: this.formatTime(preference?.quiet_start_local ?? null),
        endLocal: this.formatTime(preference?.quiet_end_local ?? null),
        timeZone: preference?.quiet_timezone ?? null,
      },
      revision: preference?.revision ?? DEFAULT_REVISION,
      categories,
    };
  }

  private parseQuietHours(input: QuietHoursDto): QuietHoursValues {
    if (!input.enabled) {
      if (input.startLocal || input.endLocal || input.timeZone) {
        throw new BadRequestApplicationError(
          'Disabled quiet hours cannot include a time or time zone',
          'NOTIFICATION_QUIET_HOURS_INVALID',
        );
      }
      return {
        enabled: false,
        startLocal: null,
        endLocal: null,
        timeZone: null,
      };
    }

    if (!input.startLocal || !input.endLocal || !input.timeZone) {
      throw new BadRequestApplicationError(
        'Enabled quiet hours require a complete time range and time zone',
        'NOTIFICATION_QUIET_HOURS_INVALID',
      );
    }
    if (input.startLocal === input.endLocal) {
      throw new BadRequestApplicationError(
        'Quiet hours start and end must differ',
        'NOTIFICATION_QUIET_HOURS_INVALID',
      );
    }
    if (!this.isValidTimeZone(input.timeZone)) {
      throw new BadRequestApplicationError(
        'Quiet hours time zone is invalid',
        'NOTIFICATION_TIME_ZONE_INVALID',
      );
    }

    return {
      enabled: true,
      startLocal: this.parseTime(input.startLocal),
      endLocal: this.parseTime(input.endLocal),
      timeZone: input.timeZone,
    };
  }

  private assertCategories(
    categories: UpdateNotificationPreferencesDto['categories'],
  ): void {
    if (!categories) return;
    const seen = new Set<NotificationType>();
    for (const category of categories) {
      if (!Object.values(NotificationType).includes(category.type)) {
        throw new BadRequestApplicationError(
          'Notification category is invalid',
          'NOTIFICATION_TYPE_INVALID',
        );
      }
      if (seen.has(category.type)) {
        throw new BadRequestApplicationError(
          'Notification category is repeated',
          'NOTIFICATION_TYPE_INVALID',
        );
      }
      seen.add(category.type);
      if (REQUIRED_NOTIFICATION_TYPES.has(category.type) && !category.inAppEnabled) {
        throw new BadRequestApplicationError(
          'This Notification category is required in the inbox',
          'NOTIFICATION_REQUIRED_CATEGORY',
        );
      }
    }
  }

  private assertRetention(retentionDays: number): void {
    if (!ALLOWED_RETENTION_DAYS.has(retentionDays)) {
      throw new BadRequestApplicationError(
        'Notification retention is invalid',
        'NOTIFICATION_RETENTION_INVALID',
      );
    }
  }

  private assertRevision(revision: number): void {
    if (!Number.isInteger(revision) || revision < 1) {
      throw this.revisionConflict();
    }
  }

  private revisionConflict(): ConflictApplicationError {
    return new ConflictApplicationError(
      'Notification preferences have changed',
      'NOTIFICATION_PREFERENCES_REVISION_CONFLICT',
    );
  }

  private parseTime(value: string): Date {
    const [hours, minutes] = value.split(':').map(Number);
    return new Date(Date.UTC(1970, 0, 1, hours, minutes, 0, 0));
  }

  private formatTime(value: Date | null): string | null {
    return value
      ? `${String(value.getUTCHours()).padStart(2, '0')}:${String(
          value.getUTCMinutes(),
        ).padStart(2, '0')}`
      : null;
  }

  private isValidTimeZone(timeZone: string): boolean {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone }).format();
      return true;
    } catch {
      return false;
    }
  }
}
