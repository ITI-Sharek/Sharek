import { ConfigService } from '@nestjs/config';

import { isNotificationRetentionQueueEnabled } from './notification-retention.config';

describe('isNotificationRetentionQueueEnabled', () => {
  const originalQueueEnabled = process.env.NOTIFICATION_RETENTION_QUEUE_ENABLED;

  beforeEach(() => {
    delete process.env.NOTIFICATION_RETENTION_QUEUE_ENABLED;
  });

  afterAll(() => {
    if (originalQueueEnabled === undefined) {
      delete process.env.NOTIFICATION_RETENTION_QUEUE_ENABLED;
    } else {
      process.env.NOTIFICATION_RETENTION_QUEUE_ENABLED = originalQueueEnabled;
    }
  });

  it.each([
    ['test', false],
    ['development', true],
    ['production', true],
  ])('defaults to %s => %s', (nodeEnv, expected) => {
    expect(
      isNotificationRetentionQueueEnabled(
        new ConfigService({ NODE_ENV: nodeEnv }),
      ),
    ).toBe(expected);
  });

  it('honors an explicit disable switch', () => {
    expect(
      isNotificationRetentionQueueEnabled(
        new ConfigService({
          NODE_ENV: 'production',
          NOTIFICATION_RETENTION_QUEUE_ENABLED: false,
        }),
      ),
    ).toBe(false);
  });
});
