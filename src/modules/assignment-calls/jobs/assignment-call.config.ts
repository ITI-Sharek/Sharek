import { ConfigService } from '@nestjs/config';

/**
 * Defaults on outside tests, matching every other queue in this repo. Tests
 * additionally force it false in test/setup-env.ts so no spec opens a Redis
 * socket.
 */
export function isAssignmentCallQueueEnabled(config: ConfigService): boolean {
  return config.get<boolean>(
    'ASSIGNMENT_CALL_QUEUE_ENABLED',
    config.get<string>('NODE_ENV', 'development') !== 'test',
  );
}
