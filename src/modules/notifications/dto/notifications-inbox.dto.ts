import { RealtimeNotificationDto } from './realtime-notification.dto';

export interface NotificationsInboxDto {
  items: RealtimeNotificationDto[];
  unreadCount: number;
}
