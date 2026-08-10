import { ConfigService } from '@nestjs/config';

export function isNotificationRetentionQueueEnabled(
  config: ConfigService,
): boolean {
  const explicit = config.get<boolean | string>(
    'NOTIFICATION_RETENTION_QUEUE_ENABLED',
  );
  if (typeof explicit === 'boolean') return explicit;
  if (typeof explicit === 'string') return explicit.toLowerCase() === 'true';
  return config.get<string>('NODE_ENV', 'development') !== 'test';
}
