import { ConfigService } from '@nestjs/config';

import { createRealtimeEventEnvelope } from './realtime-event-envelope';
import { RealtimePublisherService } from './realtime-publisher.service';

describe('RealtimePublisherService', () => {
  const event = createRealtimeEventEnvelope({
    eventId: 'event-1',
    type: 'notification.created',
    aggregateId: 'notification-1',
    aggregateVersion: 1,
    payload: { notificationId: 'notification-1' },
  });

  it('publishes the complete envelope to only the authenticated user room', () => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    const publisher = new RealtimePublisherService(
      new ConfigService({ REALTIME_NOTIFICATIONS_ENABLED: true }),
    );
    publisher.bindServer({ to });

    expect(publisher.publishToUser('user-1', event)).toBe(true);
    expect(to).toHaveBeenCalledWith('user:user-1');
    expect(emit).toHaveBeenCalledWith('notification.created', event);
  });

  it('does not publish while the feature flag is disabled or no server is bound', () => {
    const disabled = new RealtimePublisherService(
      new ConfigService({ REALTIME_NOTIFICATIONS_ENABLED: false }),
    );
    const to = jest.fn();
    disabled.bindServer({ to });

    expect(disabled.publishToUser('user-1', event)).toBe(false);
    expect(to).not.toHaveBeenCalled();

    const unbound = new RealtimePublisherService(
      new ConfigService({ REALTIME_NOTIFICATIONS_ENABLED: true }),
    );
    expect(unbound.publishToUser('user-1', event)).toBe(false);
  });

  it('converts a transport error into an undelivered result', () => {
    const publisher = new RealtimePublisherService(
      new ConfigService({ REALTIME_NOTIFICATIONS_ENABLED: true }),
    );
    publisher.bindServer({
      to: jest.fn().mockImplementation(() => {
        throw new Error('transport unavailable');
      }),
    });

    expect(publisher.publishToUser('user-1', event)).toBe(false);
  });
});
