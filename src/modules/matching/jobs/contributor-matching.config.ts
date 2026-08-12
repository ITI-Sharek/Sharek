import { ConfigService } from '@nestjs/config';

export function isContributorMatchingQueueEnabled(
  config: ConfigService,
): boolean {
  return config.get<boolean>(
    'CONTRIBUTOR_MATCHING_QUEUE_ENABLED',
    config.get<string>('NODE_ENV', 'development') !== 'test',
  );
}
