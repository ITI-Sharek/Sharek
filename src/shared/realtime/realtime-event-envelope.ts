export const REALTIME_EVENT_VERSION = 1 as const;

export interface RealtimeEventEnvelope<TPayload> {
  eventId: string;
  type: string;
  version: typeof REALTIME_EVENT_VERSION;
  occurredAt: string;
  aggregateId: string;
  aggregateVersion: number;
  payload: TPayload;
}

export interface CreateRealtimeEventEnvelopeInput<TPayload> {
  eventId: string;
  type: string;
  occurredAt?: Date | string;
  aggregateId: string;
  aggregateVersion: number;
  payload: TPayload;
}

export function createRealtimeEventEnvelope<TPayload>({
  eventId,
  type,
  occurredAt,
  aggregateId,
  aggregateVersion,
  payload,
}: CreateRealtimeEventEnvelopeInput<TPayload>): RealtimeEventEnvelope<TPayload> {
  return {
    eventId,
    type,
    version: REALTIME_EVENT_VERSION,
    occurredAt:
      occurredAt instanceof Date
        ? occurredAt.toISOString()
        : occurredAt ?? new Date().toISOString(),
    aggregateId,
    aggregateVersion,
    payload,
  };
}
