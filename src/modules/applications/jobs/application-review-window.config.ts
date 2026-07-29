import { ConfigService } from '@nestjs/config';

export function isApplicationReviewQueueEnabled(
  config: ConfigService,
): boolean {
  return config.get<boolean>(
    'APPLICATION_REVIEW_QUEUE_ENABLED',
    config.get<string>('NODE_ENV', 'development') !== 'test',
  );
}
