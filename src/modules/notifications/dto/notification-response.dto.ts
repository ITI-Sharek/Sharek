import { NotificationPriority, NotificationType } from '@prisma/client';

export interface NotificationPresentationResponseDto {
  notificationId: string;
  type: NotificationType;
  templateKey: string;
  templateVersion: number;
  title: string;
  body: string;
  deepLink: string | null;
  priority: NotificationPriority;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
  aggregateVersion: number;
}

export interface NotificationListResponseDto {
  items: NotificationPresentationResponseDto[];
  nextCursor: string | null;
}

export interface NotificationUnreadCountResponseDto {
  unreadCount: number;
}
