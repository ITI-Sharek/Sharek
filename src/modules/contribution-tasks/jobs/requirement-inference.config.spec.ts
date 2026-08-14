import { ConfigService } from '@nestjs/config';

import { isRequirementInferenceQueueEnabled } from './requirement-inference.config';
import { RequirementInferenceQueue } from './requirement-inference.queue';

describe('requirement inference queue configuration', () => {
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
      isRequirementInferenceQueueEnabled(
        config({
          NODE_ENV: nodeEnv,
          ...(flag === undefined
            ? {}
            : { REQUIREMENT_INFERENCE_QUEUE_ENABLED: flag }),
        }),
      ),
    ).toBe(expected);
  });

  it('opens no Redis connection when disabled', () => {
    // Turning the queue off is a supported way to run the product, not a
    // degraded mode: a draft with no inferred rows is still publishable once
    // the owner types the set by hand, so CI needs no provider and no Redis.
    const queue = new RequirementInferenceQueue(
      new ConfigService({ REQUIREMENT_INFERENCE_QUEUE_ENABLED: false }),
    );

    expect(queue).toBeDefined();
  });

  it('drops the job silently when disabled rather than failing the draft save', async () => {
    // The opposite of the Advisory Fit queue, deliberately. An Assessment
    // Request is a durable row an owner asked for and would be stranded by a
    // dropped job; inference is an optional convenience on a draft, and failing
    // an authoring flow because Redis is down would be worse than no bar.
    const queue = new RequirementInferenceQueue(
      new ConfigService({ REQUIREMENT_INFERENCE_QUEUE_ENABLED: false }),
    );

    await expect(
      queue.enqueueInference({
        contributionRequestId: '33333333-3333-4333-8333-333333333333',
        requestedAt: '2026-08-14T12:00:00.000Z',
      }),
    ).resolves.toBeUndefined();
  });
});
