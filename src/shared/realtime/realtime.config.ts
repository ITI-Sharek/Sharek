import { ConfigService } from '@nestjs/config';

export const REALTIME_NAMESPACE = 'realtime';

export function realtimeUserRoom(userId: string): string {
  return `user:${userId}`;
}

export function isRealtimeNotificationsEnabled(
  config: ConfigService,
): boolean {
  // The client and backend cutovers are complete, so realtime is on by
  // default. Deployments can still opt out explicitly while keeping durable
  // HTTP notification delivery available.
  const value = config.get<unknown>('REALTIME_NOTIFICATIONS_ENABLED', true);
  return value === true || value === 'true';
}

/** Shared by every gateway bound to the `/realtime` namespace, so their CORS policy cannot drift apart. */
export function parseRealtimeCorsOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}
