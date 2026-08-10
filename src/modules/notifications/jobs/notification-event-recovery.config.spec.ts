import { ConfigService } from '@nestjs/config';

import { isNotificationEventRecoveryQueueEnabled } from './notification-event-recovery.config';

describe('isNotificationEventRecoveryQueueEnabled', () => {
  const originalQueueEnabled = process.env.NOTIFICATION_EVENT_RECOVERY_QUEUE_ENABLED;

  beforeEach(() => {
    delete process.env.NOTIFICATION_EVENT_RECOVERY_QUEUE_ENABLED;
  });

  afterAll(() => {
    if (originalQueueEnabled === undefined) {
      delete process.env.NOTIFICATION_EVENT_RECOVERY_QUEUE_ENABLED;
    } else {
      process.env.NOTIFICATION_EVENT_RECOVERY_QUEUE_ENABLED = originalQueueEnabled;
    }
  });

  it.each([
    ['test', false],
    ['development', true],
    ['production', true],
  ])('defaults to %s => %s', (nodeEnv, expected) => {
    expect(
      isNotificationEventRecoveryQueueEnabled(
        new ConfigService({ NODE_ENV: nodeEnv }),
      ),
    ).toBe(expected);
  });

  it('allows an explicit enablement override', () => {
    expect(
      isNotificationEventRecoveryQueueEnabled(
        new ConfigService({
          NODE_ENV: 'test',
          NOTIFICATION_EVENT_RECOVERY_QUEUE_ENABLED: true,
        }),
      ),
    ).toBe(true);
  });
});
