import { ConfigService } from '@nestjs/config';

export function isNotificationEventRecoveryQueueEnabled(
  config: ConfigService,
): boolean {
  const explicit = config.get<boolean | string>(
    'NOTIFICATION_EVENT_RECOVERY_QUEUE_ENABLED',
  );
  if (typeof explicit === 'boolean') return explicit;
  if (typeof explicit === 'string') return explicit.toLowerCase() === 'true';
  return config.get<string>('NODE_ENV', 'development') !== 'test';
}
