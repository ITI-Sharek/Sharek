import { NotificationType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

import { stableValidationMessage } from '../../../shared/validation/application-validation.pipe';

export class QuietHoursDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startLocal?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endLocal?: string;

  @IsOptional()
  @IsString()
  timeZone?: string;
}

export class NotificationCategoryPreferenceDto {
  @IsIn(Object.values(NotificationType), {
    message: stableValidationMessage(
      'NOTIFICATION_TYPE_INVALID',
      'Notification type is invalid',
    ),
  })
  type!: NotificationType;

  @IsBoolean()
  inAppEnabled!: boolean;

  @IsOptional()
  @IsBoolean()
  browserEnabled?: boolean;
}

export class UpdateNotificationPreferencesDto {
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @IsOptional()
  @IsIn([30, 90, 180, 365], {
    message: stableValidationMessage(
      'NOTIFICATION_RETENTION_INVALID',
      'Notification retention is invalid',
    ),
  })
  retentionDays?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => QuietHoursDto)
  quietHours?: QuietHoursDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(Object.values(NotificationType).length)
  @ValidateNested({ each: true })
  @Type(() => NotificationCategoryPreferenceDto)
  categories?: NotificationCategoryPreferenceDto[];
}

export interface NotificationCategoryPreferenceResponse {
  type: NotificationType;
  requiredInApp: boolean;
  inAppEnabled: boolean;
  browserEnabled: boolean;
}

export interface NotificationPreferencesResponse {
  retentionDays: number;
  quietHours: {
    enabled: boolean;
    startLocal: string | null;
    endLocal: string | null;
    timeZone: string | null;
  };
  revision: number;
  categories: NotificationCategoryPreferenceResponse[];
}

export interface MarkAllNotificationsReadResponse {
  updatedCount: number;
  snapshotAt: string;
}
