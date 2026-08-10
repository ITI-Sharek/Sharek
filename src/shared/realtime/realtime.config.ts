import { ConfigService } from '@nestjs/config';

export const REALTIME_NAMESPACE = 'realtime';

export function realtimeUserRoom(userId: string): string {
  return `user:${userId}`;
}

export function isRealtimeNotificationsEnabled(
  config: ConfigService,
): boolean {
  const value = config.get<unknown>('REALTIME_NOTIFICATIONS_ENABLED', false);
  return value === true || value === 'true';
}
