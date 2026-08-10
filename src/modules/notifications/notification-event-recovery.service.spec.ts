import { NotificationEventType } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

import { NotificationEventRecoveryService } from './notification-event-recovery.service';

describe('NotificationEventRecoveryService', () => {
  const now = new Date('2026-08-09T12:00:00.000Z');
  const pendingCreatedEvent = {
    id: 'event-created-1',
    notification_id: 'notification-1',
    user_id: 'user-1',
    event_type: NotificationEventType.created,
    aggregate_version: 1,
    occurred_at: new Date('2026-08-09T11:00:00.000Z'),
    published_at: null,
    publish_attempts: 0,
    last_publish_error_code: null,
  };
  const pendingReadEvent = {
    ...pendingCreatedEvent,
    id: 'event-read-1',
    event_type: NotificationEventType.read_state_changed,
    aggregate_version: 2,
    publish_attempts: 4,
  };

  function createService(events = [pendingCreatedEvent, pendingReadEvent]) {
    const database = {
      notificationEvent: {
        findMany: jest.fn().mockResolvedValue(events),
      },
    };
    const realtime = {
      publishEvent: jest
        .fn()
        .mockResolvedValueOnce('published')
        .mockResolvedValueOnce('retry_exhausted'),
      recordFailedAttempt: jest.fn().mockResolvedValue('unavailable'),
    };
    const service = new NotificationEventRecoveryService(
      database as never,
      realtime as never,
      new ConfigService({
        NOTIFICATION_EVENT_RECOVERY_BATCH_SIZE: 2,
        NOTIFICATION_EVENT_MAX_PUBLISH_ATTEMPTS: 5,
      }),
    );
    return { service, database, realtime };
  }

  it('selects bounded pending events and hands off their stable records unchanged', async () => {
    const { service, database, realtime } = createService();

    await expect(service.recoverPending(now)).resolves.toEqual({
      selected: 2,
      attempted: 2,
      published: 1,
      unavailable: 0,
      exhausted: 1,
      skipped: 0,
    });

    expect(database.notificationEvent.findMany).toHaveBeenCalledWith({
      where: {
        published_at: null,
        occurred_at: { lte: now },
        publish_attempts: { lt: 5 },
      },
      orderBy: [{ occurred_at: 'asc' }, { id: 'asc' }],
      take: 2,
    });
    expect(realtime.publishEvent).toHaveBeenNthCalledWith(1, pendingCreatedEvent);
    expect(realtime.publishEvent).toHaveBeenNthCalledWith(2, pendingReadEvent);
  });

  it('does not invent retries for a deliberately disabled realtime transport', async () => {
    const { service, realtime } = createService([pendingCreatedEvent]);
    realtime.publishEvent.mockReset();
    realtime.publishEvent.mockResolvedValue('disabled');

    await expect(service.recoverPending(now)).resolves.toEqual({
      selected: 1,
      attempted: 0,
      published: 0,
      unavailable: 0,
      exhausted: 0,
      skipped: 1,
    });

    expect(realtime.recordFailedAttempt).not.toHaveBeenCalled();
  });

  it('re-hands off the same stable event ID when reconciliation sees a duplicate', async () => {
    const { service, realtime } = createService([pendingCreatedEvent]);
    realtime.publishEvent.mockReset();
    realtime.publishEvent.mockResolvedValue('published');

    await service.recoverPending(now);
    await service.recoverPending(now);

    expect(realtime.publishEvent).toHaveBeenNthCalledWith(
      1,
      pendingCreatedEvent,
    );
    expect(realtime.publishEvent).toHaveBeenNthCalledWith(
      2,
      pendingCreatedEvent,
    );
  });

  it('records a bounded operational failure when one event handoff throws', async () => {
    const { service, realtime } = createService([pendingCreatedEvent]);
    realtime.publishEvent.mockReset();
    realtime.publishEvent.mockRejectedValue(new Error('database temporarily unavailable'));

    await expect(service.recoverPending(now)).resolves.toEqual({
      selected: 1,
      attempted: 1,
      published: 0,
      unavailable: 1,
      exhausted: 0,
      skipped: 0,
    });

    expect(realtime.recordFailedAttempt).toHaveBeenCalledWith(
      pendingCreatedEvent,
      'REALTIME_RECOVERY_ERROR',
    );
  });
});
