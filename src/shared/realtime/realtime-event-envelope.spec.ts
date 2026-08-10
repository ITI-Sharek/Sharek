import { createRealtimeEventEnvelope } from './realtime-event-envelope';

describe('createRealtimeEventEnvelope', () => {
  it('creates a stable version-one event envelope without business coupling', () => {
    expect(
      createRealtimeEventEnvelope({
        eventId: 'event-1',
        type: 'notification.created',
        occurredAt: new Date('2026-08-09T10:00:00.000Z'),
        aggregateId: 'notification-1',
        aggregateVersion: 1,
        payload: { value: 'opaque-to-shared-transport' },
      }),
    ).toEqual({
      eventId: 'event-1',
      type: 'notification.created',
      version: 1,
      occurredAt: '2026-08-09T10:00:00.000Z',
      aggregateId: 'notification-1',
      aggregateVersion: 1,
      payload: { value: 'opaque-to-shared-transport' },
    });
  });

  it('uses an ISO timestamp when the event does not provide one', () => {
    expect(
      createRealtimeEventEnvelope({
        eventId: 'event-2',
        type: 'test.event',
        aggregateId: 'aggregate-1',
        aggregateVersion: 4,
        payload: null,
      }).occurredAt,
    ).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/));
  });
});
