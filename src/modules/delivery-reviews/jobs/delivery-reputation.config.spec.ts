import { ConfigService } from '@nestjs/config';

import { isDeliveryReputationQueueEnabled } from './delivery-reputation.config';

describe('Delivery reputation queue configuration', () => {
  const originalQueueEnabled = process.env.DELIVERY_REPUTATION_QUEUE_ENABLED;

  beforeEach(() => {
    delete process.env.DELIVERY_REPUTATION_QUEUE_ENABLED;
  });

  afterAll(() => {
    if (originalQueueEnabled === undefined) {
      delete process.env.DELIVERY_REPUTATION_QUEUE_ENABLED;
    } else {
      process.env.DELIVERY_REPUTATION_QUEUE_ENABLED = originalQueueEnabled;
    }
  });

  it.each([
    { environment: 'test', expected: false },
    { environment: 'development', expected: true },
    { environment: 'production', expected: true },
  ])(
    'defaults to $expected in $environment',
    ({ environment, expected }) => {
      expect(
        isDeliveryReputationQueueEnabled(
          new ConfigService({ NODE_ENV: environment }),
        ),
      ).toBe(expected);
    },
  );

  it('honors an explicit switch over the environment default', () => {
    expect(
      isDeliveryReputationQueueEnabled(
        new ConfigService({
          NODE_ENV: 'test',
          DELIVERY_REPUTATION_QUEUE_ENABLED: true,
        }),
      ),
    ).toBe(true);
    expect(
      isDeliveryReputationQueueEnabled(
        new ConfigService({
          NODE_ENV: 'production',
          DELIVERY_REPUTATION_QUEUE_ENABLED: false,
        }),
      ),
    ).toBe(false);
  });
});
