import { ConfigService } from '@nestjs/config';

import { isAdvisoryFitQueueEnabled } from './advisory-fit-assessment.config';

describe('isAdvisoryFitQueueEnabled', () => {
  const config = (values: Record<string, unknown>) =>
    ({
      get: (key: string, fallback: unknown) =>
        key in values ? values[key] : fallback,
    }) as unknown as ConfigService;

  it.each([
    ['test', false],
    ['development', true],
    ['production', true],
  ])('defaults to %s => %s', (nodeEnv, expected) => {
    expect(isAdvisoryFitQueueEnabled(config({ NODE_ENV: nodeEnv }))).toBe(expected);
  });

  it('lets an explicit switch override the environment default', () => {
    expect(
      isAdvisoryFitQueueEnabled(
        config({ NODE_ENV: 'test', ADVISORY_FIT_QUEUE_ENABLED: true }),
      ),
    ).toBe(true);
  });
});
