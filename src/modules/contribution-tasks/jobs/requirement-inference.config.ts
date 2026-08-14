import { ConfigService } from '@nestjs/config';

/**
 * Defaults on outside tests, matching every other queue. Tests force it false
 * in `test/setup-env.ts` so no spec opens a Redis socket.
 *
 * Turning it off is a supported way to run the product, not a degraded mode: a
 * draft with no inferred rows is still publishable once the owner types the set
 * by hand, so CI and a local run need no provider and no Redis.
 */
export function isRequirementInferenceQueueEnabled(config: ConfigService): boolean {
  return config.get<boolean>(
    'REQUIREMENT_INFERENCE_QUEUE_ENABLED',
    config.get<string>('NODE_ENV', 'development') !== 'test',
  );
}
