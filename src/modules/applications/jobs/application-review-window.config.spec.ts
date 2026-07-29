import { ConfigService } from '@nestjs/config';

import { isApplicationReviewQueueEnabled } from './application-review-window.config';

describe('Application review-window queue configuration', () => {
  const originalQueueEnabled = process.env.APPLICATION_REVIEW_QUEUE_ENABLED;

  beforeEach(() => {
    delete process.env.APPLICATION_REVIEW_QUEUE_ENABLED;
  });

  afterAll(() => {
    if (originalQueueEnabled === undefined) {
      delete process.env.APPLICATION_REVIEW_QUEUE_ENABLED;
    } else {
      process.env.APPLICATION_REVIEW_QUEUE_ENABLED = originalQueueEnabled;
    }
  });

  it.each([
    { environment: 'test', expected: false },
    { environment: 'development', expected: true },
    { environment: 'production', expected: true },
  ])(
    'defaults to $expected in $environment when no explicit switch exists',
    ({ environment, expected }) => {
      expect(
        isApplicationReviewQueueEnabled(
          new ConfigService({ NODE_ENV: environment }),
        ),
      ).toBe(expected);
    },
  );

  it('honors the explicit queue switch over the environment default', () => {
    expect(
      isApplicationReviewQueueEnabled(
        new ConfigService({
          NODE_ENV: 'test',
          APPLICATION_REVIEW_QUEUE_ENABLED: true,
        }),
      ),
    ).toBe(true);
    expect(
      isApplicationReviewQueueEnabled(
        new ConfigService({
          NODE_ENV: 'production',
          APPLICATION_REVIEW_QUEUE_ENABLED: false,
        }),
      ),
    ).toBe(false);
  });
});
