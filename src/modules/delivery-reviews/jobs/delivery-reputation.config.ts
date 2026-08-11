import { ConfigService } from '@nestjs/config';

export function isDeliveryReputationQueueEnabled(
  config: ConfigService,
): boolean {
  return config.get<boolean>(
    'DELIVERY_REPUTATION_QUEUE_ENABLED',
    config.get<string>('NODE_ENV', 'development') !== 'test',
  );
}
