import { NotificationType } from '@prisma/client';

export interface RealtimeNotificationDto {
  notificationId: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata: unknown;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
}
