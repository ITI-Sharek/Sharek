export interface RealtimeNotificationDto {
  notificationId: string;
  userId: string;
  type:
    | 'application_status'
    | 'proposal_status'
    | 'skill_review'
    | 'delivery_update'
    | 'match_found'
    | 'task_recommendation'
    | 'plan_limit'
    | 'system';
  title: string;
  message: string;
  metadata: unknown;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
}
