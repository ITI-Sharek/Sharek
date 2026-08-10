import { IsIn } from 'class-validator';

import { stableValidationMessage } from '../../../shared/validation/application-validation.pipe';

export class SetNotificationReadStateDto {
  @IsIn(['read', 'unread'], {
    message: stableValidationMessage(
      'NOTIFICATION_READ_STATE_INVALID',
      'Notification read state is invalid',
    ),
  })
  state!: 'read' | 'unread';
}
