import { AssignmentCallRealtimeService } from './assignment-call-realtime.service';

const EVENT_ID = '77777777-7777-4777-8777-777777777777';
const CALL_ID = '55555555-5555-4555-8555-555555555555';
const CALLER_ID = '11111111-1111-4111-8111-111111111111';
const CALLEE_ID = '22222222-2222-4222-8222-222222222222';

function eventRecord(overrides: Partial<{ event_type: string; aggregate_version: number }> = {}) {
  return {
    id: EVENT_ID,
    call_id: CALL_ID,
    event_type: 'ringing',
    aggregate_version: 1,
    occurred_at: new Date('2026-08-22T12:00:00.000Z'),
    call: {
      id: CALL_ID,
      conversation_id: '44444444-4444-4444-8444-444444444444',
      caller_id: CALLER_ID,
      callee_id: CALLEE_ID,
      outcome: 'ringing',
      started_at: new Date('2026-08-22T12:00:00.000Z'),
      answered_at: null,
      ended_at: null,
      duration_seconds: null,
      end_reason: null,
      caller: { first_name: 'Cal', last_name: 'Ler' },
      callee: { first_name: 'Cal', last_name: 'Lee' },
    },
    ...overrides,
  };
}

function harness(input: { enabled?: boolean; event?: unknown; deliveries?: boolean[] } = {}) {
  const { enabled = true, event = eventRecord(), deliveries = [true, true] } = input;
  const database = {
    assignmentCallEvent: {
      findUnique: jest.fn().mockResolvedValue(event),
      update: jest.fn().mockResolvedValue(undefined),
    },
  };
  const config = { get: jest.fn((_key: string, fallback: unknown) => fallback) };
  const publisher = {
    isEnabled: jest.fn().mockReturnValue(enabled),
    publishToUser: jest.fn().mockImplementation(() => deliveries.shift() ?? false),
  };
  return {
    service: new AssignmentCallRealtimeService(database as never, config as never, publisher as never),
    database,
    publisher,
  };
}

describe('AssignmentCallRealtimeService', () => {
  it('publishes the envelope to both the caller and the callee', async () => {
    const { service, publisher } = harness();

    await expect(service.publishRinging(EVENT_ID)).resolves.toBe(true);

    expect(publisher.publishToUser).toHaveBeenNthCalledWith(
      1,
      CALLER_ID,
      expect.objectContaining({ eventId: EVENT_ID, type: 'assignment_call.ringing' }),
    );
    expect(publisher.publishToUser).toHaveBeenNthCalledWith(
      2,
      CALLEE_ID,
      expect.objectContaining({ eventId: EVENT_ID }),
    );
  });

  it.each([
    ['ringing', 'assignment_call.ringing'],
    ['answered', 'assignment_call.answered'],
    ['declined', 'assignment_call.declined'],
    ['ended', 'assignment_call.ended'],
  ])('maps event_type %s to realtime type %s', async (eventType, expectedType) => {
    const { service, publisher } = harness({ event: eventRecord({ event_type: eventType }) });

    await service.publishRinging(EVENT_ID);

    expect(publisher.publishToUser).toHaveBeenCalledWith(
      CALLER_ID,
      expect.objectContaining({ type: expectedType }),
    );
  });

  it('records published_at and clears the error code once both deliveries succeed', async () => {
    const { service, database } = harness();

    await service.publishAnswered(EVENT_ID);

    expect(database.assignmentCallEvent.update).toHaveBeenCalledWith({
      where: { id: EVENT_ID },
      data: {
        published_at: expect.any(Date) as Date,
        publish_attempts: { increment: 1 },
        last_publish_error_code: null,
      },
    });
  });

  it('keeps the outbox pending and records REALTIME_UNAVAILABLE when either participant handoff fails', async () => {
    const { service, database } = harness({ deliveries: [true, false] });

    await expect(service.publishDeclined(EVENT_ID)).resolves.toBe(false);

    expect(database.assignmentCallEvent.update).toHaveBeenCalledWith({
      where: { id: EVENT_ID },
      data: { publish_attempts: { increment: 1 }, last_publish_error_code: 'REALTIME_UNAVAILABLE' },
    });
  });

  it('never carries a TURN credential, SDP, or ICE candidate through the durable channel', async () => {
    const { service, publisher } = harness();

    await service.publishEnded(EVENT_ID);

    const [, envelope] = publisher.publishToUser.mock.calls[0] as [string, { payload: unknown }];
    const serialized = JSON.stringify(envelope);
    expect(serialized).not.toMatch(/sdp|candidate|credential|iceServers/i);
  });

  it('does nothing when realtime is disabled, and never touches the database', async () => {
    const { service, database, publisher } = harness({ enabled: false });

    await expect(service.publishRinging(EVENT_ID)).resolves.toBe(false);

    expect(database.assignmentCallEvent.findUnique).not.toHaveBeenCalled();
    expect(publisher.publishToUser).not.toHaveBeenCalled();
  });

  it('does nothing when the outbox event no longer exists', async () => {
    const { service, publisher } = harness({ event: null });

    await expect(service.publishRinging(EVENT_ID)).resolves.toBe(false);

    expect(publisher.publishToUser).not.toHaveBeenCalled();
  });
});
