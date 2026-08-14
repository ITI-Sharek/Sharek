import { ConfigService } from '@nestjs/config';

import { isEligibilityGuidanceQueueEnabled } from './eligibility-guidance.config';
import { EligibilityGuidanceQueue } from './eligibility-guidance.queue';

describe('eligibility guidance queue configuration', () => {
  // A bare `new ConfigService({...})` still falls through to process.env, which
  // test/setup-env.ts pins to 'false' — so the default would never be observed.
  const config = (values: Record<string, unknown>) =>
    ({
      get: (key: string, fallback: unknown) =>
        key in values ? values[key] : fallback,
    }) as unknown as ConfigService;

  it.each([
    ['development', undefined, true],
    ['production', undefined, true],
    ['test', undefined, false],
    ['production', false, false],
    ['test', true, true],
  ])('in %s with the flag %p is %p', (nodeEnv, flag, expected) => {
    expect(
      isEligibilityGuidanceQueueEnabled(
        config({
          NODE_ENV: nodeEnv,
          ...(flag === undefined
            ? {}
            : { ELIGIBILITY_GUIDANCE_QUEUE_ENABLED: flag }),
        }),
      ),
    ).toBe(expected);
  });

  it('drops the job rather than failing the request when disabled', async () => {
    // The row is already written by then, so the contributor still sees their
    // blocking skills and can retry. Failing here would take away the reason
    // along with the narrative.
    const queue = new EligibilityGuidanceQueue(
      new ConfigService({ ELIGIBILITY_GUIDANCE_QUEUE_ENABLED: false }),
    );

    await expect(
      queue.enqueueGeneration({
        guidanceId: 'dd111111-1111-4111-8111-111111111111',
      }),
    ).resolves.toBeUndefined();
  });
});
