import { ConfigService } from '@nestjs/config';

/**
 * Defaults on outside tests, matching every other queue.
 *
 * With it off, a guidance request still creates its row and still returns the
 * deterministic blocking-skill list — the narrative simply never arrives and
 * the row stays `pending`. That is a supported way to run: the reason a
 * contributor was blocked never depended on the provider.
 */
export function isEligibilityGuidanceQueueEnabled(
  config: ConfigService,
): boolean {
  return config.get<boolean>(
    'ELIGIBILITY_GUIDANCE_QUEUE_ENABLED',
    config.get<string>('NODE_ENV', 'development') !== 'test',
  );
}
