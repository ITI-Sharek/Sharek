import { NotificationType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { stableValidationMessage } from '../../../shared/validation/application-validation.pipe';

export class NotificationQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({
    message: stableValidationMessage(
      'NOTIFICATION_LIMIT_INVALID',
      'Notification page size is invalid',
    ),
  })
  @Min(1, {
    message: stableValidationMessage(
      'NOTIFICATION_LIMIT_INVALID',
      'Notification page size is invalid',
    ),
  })
  @Max(100, {
    message: stableValidationMessage(
      'NOTIFICATION_LIMIT_INVALID',
      'Notification page size is invalid',
    ),
  })
  limit?: number;

  @IsOptional()
  @IsIn(['read', 'unread'], {
    message: stableValidationMessage(
      'NOTIFICATION_READ_STATE_INVALID',
      'Notification read state is invalid',
    ),
  })
  readState?: 'read' | 'unread';

  @IsOptional()
  @IsEnum(NotificationType, {
    message: stableValidationMessage(
      'NOTIFICATION_TYPE_INVALID',
      'Notification type is invalid',
    ),
  })
  type?: NotificationType;
}
