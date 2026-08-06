import { ConfigService } from '@nestjs/config';

/**
 * Defaults on outside tests, matching the other queues. Tests additionally
 * force it false in test/setup-env.ts so no spec opens a Redis socket.
 */
export function isMaterialScanQueueEnabled(config: ConfigService): boolean {
  return config.get<boolean>(
    'MATERIAL_SCAN_QUEUE_ENABLED',
    config.get<string>('NODE_ENV', 'development') !== 'test',
  );
}
