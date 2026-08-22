import { ConfigService } from '@nestjs/config';

import { AssignmentCallAuthorizationService } from './assignment-call-authorization.service';

const CALLER_ID = '11111111-1111-4111-8111-111111111111';
const CALLEE_ID = '22222222-2222-4222-8222-222222222222';
const OUTSIDER_ID = '33333333-3333-4333-8333-333333333333';
const CALL_ID = '44444444-4444-4444-8444-444444444444';
const CALL_SESSION_ID = '55555555-5555-4555-8555-555555555555';
const SOCKET_ID = 'socket-1';

const configDefaults: Record<string, unknown> = {
  ASSIGNMENT_CALL_SIGNAL_MAX_SDP_BYTES: 65_536,
  ASSIGNMENT_CALL_SIGNALS_PER_10S: 60,
};

function config(overrides: Record<string, unknown> = {}) {
  const values = { ...configDefaults, ...overrides };
  return {
    get: jest.fn((key: string, fallback: unknown) => (key in values ? values[key] : fallback)),
  } as unknown as ConfigService;
}

function callRow(overrides: Partial<{
  outcome: string;
  answered_at: Date | null;
  ended_at: Date | null;
  callerStatus: string;
  calleeStatus: string;
  includeCallee: boolean;
  includeCaller: boolean;
}> = {}) {
  const {
    outcome = 'answered',
    answered_at = new Date('2026-08-22T12:00:00.000Z'),
    ended_at = null,
    callerStatus = 'active',
    calleeStatus = 'active',
    includeCallee = true,
    includeCaller = true,
  } = overrides;

  const participations = [
    ...(includeCaller ? [{ user_id: CALLER_ID, active: true }] : []),
    ...(includeCallee ? [{ user_id: CALLEE_ID, active: true }] : []),
  ];

  return {
    outcome,
    answered_at,
    ended_at,
    caller_id: CALLER_ID,
    callee_id: CALLEE_ID,
    caller: { status: callerStatus },
    callee: { status: calleeStatus },
    participations,
  };
}

function offerPayload(overrides: Record<string, unknown> = {}) {
  return {
    callId: CALL_ID,
    callSessionId: CALL_SESSION_ID,
    kind: 'offer',
    sdp: 'v=0 fake-sdp',
    signalSeq: 0,
    ...overrides,
  };
}

function service(findUniqueResult: unknown = callRow(), configOverrides: Record<string, unknown> = {}) {
  const database = {
    assignmentCall: { findUnique: jest.fn().mockResolvedValue(findUniqueResult) },
  };
  return {
    authorization: new AssignmentCallAuthorizationService(
      database as never,
      config(configOverrides),
    ),
    database,
  };
}

describe('AssignmentCallAuthorizationService', () => {
  describe('shape validation (before any database call)', () => {
    it.each([
      ['non-UUID callId', { callId: 'not-a-uuid' }],
      ['non-UUID callSessionId', { callSessionId: 'not-a-uuid' }],
      ['unknown kind', { kind: 'bogus_kind' }],
      ['negative signalSeq', { signalSeq: -1 }],
      ['non-integer signalSeq', { signalSeq: 1.5 }],
      ['missing callId', { callId: undefined }],
      ['non-object payload', undefined as unknown as Record<string, unknown>],
    ])('rejects %s as ASSIGNMENT_CALL_SIGNAL_REJECTED without touching the database', async (_description, overrides) => {
      const { authorization, database } = service();

      const payload =
        overrides === undefined
          ? null
          : offerPayload(overrides as Record<string, unknown>);

      const result = await authorization.authorize({
        socketId: SOCKET_ID,
        actorId: CALLER_ID,
        payload,
      });

      expect(result).toMatchObject({ ok: false, code: 'ASSIGNMENT_CALL_SIGNAL_REJECTED' });
      expect(database.assignmentCall.findUnique).not.toHaveBeenCalled();
    });

    it('rejects an oversize sdp as ASSIGNMENT_CALL_SIGNAL_TOO_LARGE, before any database call', async () => {
      const { authorization, database } = service(callRow(), {
        ASSIGNMENT_CALL_SIGNAL_MAX_SDP_BYTES: 10,
      });

      const result = await authorization.authorize({
        socketId: SOCKET_ID,
        actorId: CALLER_ID,
        payload: offerPayload({ sdp: 'a'.repeat(11) }),
      });

      expect(result).toEqual({ ok: false, code: 'ASSIGNMENT_CALL_SIGNAL_TOO_LARGE' });
      expect(database.assignmentCall.findUnique).not.toHaveBeenCalled();
    });

    it('rejects an oversize candidate.candidate as ASSIGNMENT_CALL_SIGNAL_TOO_LARGE, before any database call', async () => {
      const { authorization, database } = service();

      const result = await authorization.authorize({
        socketId: SOCKET_ID,
        actorId: CALLER_ID,
        payload: {
          callId: CALL_ID,
          callSessionId: CALL_SESSION_ID,
          kind: 'ice_candidate',
          candidate: { candidate: 'a'.repeat(1_025), sdpMid: '0', sdpMLineIndex: 0 },
          signalSeq: 0,
        },
      });

      expect(result).toEqual({ ok: false, code: 'ASSIGNMENT_CALL_SIGNAL_TOO_LARGE' });
      expect(database.assignmentCall.findUnique).not.toHaveBeenCalled();
    });

    it('accepts a candidate exactly at the 1024-byte ceiling', async () => {
      const { authorization } = service();

      const result = await authorization.authorize({
        socketId: SOCKET_ID,
        actorId: CALLER_ID,
        payload: {
          callId: CALL_ID,
          callSessionId: CALL_SESSION_ID,
          kind: 'ice_candidate',
          candidate: { candidate: 'a'.repeat(1_024), sdpMid: '0', sdpMLineIndex: 0 },
          signalSeq: 0,
        },
      });

      expect(result.ok).toBe(true);
    });
  });

  describe('call-state gating', () => {
    it('reports ASSIGNMENT_CALL_NOT_FOUND, never a 403, for a non-participant sender', async () => {
      const { authorization } = service(callRow());

      const result = await authorization.authorize({
        socketId: SOCKET_ID,
        actorId: OUTSIDER_ID,
        payload: offerPayload(),
      });

      expect(result).toEqual({ ok: false, code: 'ASSIGNMENT_CALL_NOT_FOUND' });
    });

    it('reports ASSIGNMENT_CALL_NOT_FOUND for a call that does not exist', async () => {
      const { authorization } = service(null);

      const result = await authorization.authorize({
        socketId: SOCKET_ID,
        actorId: CALLER_ID,
        payload: offerPayload(),
      });

      expect(result).toEqual({ ok: false, code: 'ASSIGNMENT_CALL_NOT_FOUND' });
    });

    it.each(['missed', 'declined', 'ended', 'failed_busy', 'failed_provider'])(
      'reports ASSIGNMENT_CALL_NOT_FOUND for a call in terminal outcome %s',
      async (outcome) => {
        const { authorization } = service(callRow({ outcome, ended_at: new Date() }));

        const result = await authorization.authorize({
          socketId: SOCKET_ID,
          actorId: CALLER_ID,
          payload: offerPayload(),
        });

        expect(result).toEqual({ ok: false, code: 'ASSIGNMENT_CALL_NOT_FOUND' });
      },
    );

    it('rejects an offer sent by the callee', async () => {
      const { authorization } = service(callRow({ outcome: 'ringing', answered_at: null }));

      const result = await authorization.authorize({
        socketId: SOCKET_ID,
        actorId: CALLEE_ID,
        payload: offerPayload(),
      });

      expect(result).toEqual({ ok: false, code: 'ASSIGNMENT_CALL_SIGNAL_REJECTED' });
    });

    it('rejects an answer sent by the caller', async () => {
      const { authorization } = service(callRow());

      const result = await authorization.authorize({
        socketId: SOCKET_ID,
        actorId: CALLER_ID,
        payload: offerPayload({ kind: 'answer' }),
      });

      expect(result).toEqual({ ok: false, code: 'ASSIGNMENT_CALL_SIGNAL_REJECTED' });
    });

    it('rejects an answer from the real callee while the call is still ringing (answered_at not yet set)', async () => {
      // A callee could otherwise establish media on a call whose durable
      // history says `missed` -- the durable command, not the socket, is
      // authoritative for whether an answer is legitimate.
      const { authorization } = service(callRow({ outcome: 'ringing', answered_at: null }));

      const result = await authorization.authorize({
        socketId: SOCKET_ID,
        actorId: CALLEE_ID,
        payload: offerPayload({ kind: 'answer' }),
      });

      expect(result).toEqual({ ok: false, code: 'ASSIGNMENT_CALL_SIGNAL_REJECTED' });
    });

    it('accepts an answer from the callee once answered_at is actually set', async () => {
      const { authorization } = service(
        callRow({ outcome: 'answered', answered_at: new Date() }),
      );

      const result = await authorization.authorize({
        socketId: SOCKET_ID,
        actorId: CALLEE_ID,
        payload: offerPayload({ kind: 'answer' }),
      });

      expect(result).toMatchObject({ ok: true, peerId: CALLER_ID });
    });

    it('allows ice_candidate signals from either participant regardless of the offer/answer gate', async () => {
      const { authorization } = service(callRow({ outcome: 'ringing', answered_at: null }));

      const result = await authorization.authorize({
        socketId: SOCKET_ID,
        actorId: CALLEE_ID,
        payload: offerPayload({ kind: 'ice_candidate', sdp: undefined }),
      });

      expect(result).toMatchObject({ ok: true, peerId: CALLER_ID });
    });

    it('rejects a signal from a sender whose account is suspended', async () => {
      const { authorization } = service(callRow({ callerStatus: 'suspended' }));

      const result = await authorization.authorize({
        socketId: SOCKET_ID,
        actorId: CALLER_ID,
        payload: offerPayload(),
      });

      expect(result).toEqual({ ok: false, code: 'ASSIGNMENT_CALL_NOT_FOUND' });
    });

    it('reflects a mid-call suspension once the 3s call-state cache expires, rather than holding the stale active snapshot forever', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-22T12:00:00.000Z'));
      try {
        const database = {
          assignmentCall: {
            findUnique: jest
              .fn()
              .mockResolvedValueOnce(callRow({ callerStatus: 'active' }))
              .mockResolvedValueOnce(callRow({ callerStatus: 'suspended' })),
          },
        };
        const authorization = new AssignmentCallAuthorizationService(
          database as never,
          config(),
        );

        const first = await authorization.authorize({
          socketId: SOCKET_ID,
          actorId: CALLER_ID,
          payload: offerPayload(),
        });
        expect(first.ok).toBe(true);

        // Still within the 3s cache window: the stale (pre-suspension)
        // snapshot is served, exactly as the class's own doc comment
        // describes ("re-checked fresh (within the cache window)").
        jest.advanceTimersByTime(2_000);
        const stillCached = await authorization.authorize({
          socketId: SOCKET_ID,
          actorId: CALLER_ID,
          payload: offerPayload({ signalSeq: 1 }),
        });
        expect(stillCached.ok).toBe(true);
        expect(database.assignmentCall.findUnique).toHaveBeenCalledTimes(1);

        // Past the 3s TTL: a fresh read picks up the suspension.
        jest.advanceTimersByTime(1_001);
        const afterExpiry = await authorization.authorize({
          socketId: SOCKET_ID,
          actorId: CALLER_ID,
          payload: offerPayload({ signalSeq: 2 }),
        });
        expect(afterExpiry).toEqual({ ok: false, code: 'ASSIGNMENT_CALL_NOT_FOUND' });
        expect(database.assignmentCall.findUnique).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('the 3-second call-state cache', () => {
    it('serves two authorize() calls within the window from one database read', async () => {
      const { authorization, database } = service(callRow());

      await authorization.authorize({ socketId: SOCKET_ID, actorId: CALLER_ID, payload: offerPayload() });
      await authorization.authorize({
        socketId: SOCKET_ID,
        actorId: CALLER_ID,
        payload: offerPayload({ signalSeq: 1 }),
      });

      expect(database.assignmentCall.findUnique).toHaveBeenCalledTimes(1);
    });

    it('invalidate(callId) busts the cache immediately, forcing the next authorize() to re-read', async () => {
      const { authorization, database } = service(callRow());

      await authorization.authorize({ socketId: SOCKET_ID, actorId: CALLER_ID, payload: offerPayload() });
      authorization.invalidate(CALL_ID);
      await authorization.authorize({
        socketId: SOCKET_ID,
        actorId: CALLER_ID,
        payload: offerPayload({ signalSeq: 1 }),
      });

      expect(database.assignmentCall.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('rate limiting', () => {
    it('allows exactly 60 signals per 10s and rejects the 61st as ASSIGNMENT_CALL_SIGNAL_RATE_LIMITED', async () => {
      const { authorization } = service(callRow(), { ASSIGNMENT_CALL_SIGNALS_PER_10S: 60 });

      for (let index = 0; index < 60; index += 1) {
        const result = await authorization.authorize({
          socketId: SOCKET_ID,
          actorId: CALLER_ID,
          payload: offerPayload({ kind: 'ice_candidate', sdp: undefined, signalSeq: index }),
        });
        expect(result.ok).toBe(true);
      }

      const rejected = await authorization.authorize({
        socketId: SOCKET_ID,
        actorId: CALLER_ID,
        payload: offerPayload({ kind: 'ice_candidate', sdp: undefined, signalSeq: 60 }),
      });

      expect(rejected).toEqual({ ok: false, code: 'ASSIGNMENT_CALL_SIGNAL_RATE_LIMITED' });
    });

    it('tells the client to disconnect once repeated calls reach 3x the ceiling', async () => {
      // Every attempt counts towards the ceiling, not only the ones that
      // pass -- otherwise a client already rejected at the base ceiling
      // could never be counted climbing towards the disconnect threshold,
      // and "past a hard ceiling, disconnect" would be unreachable through
      // any real sequence of calls. This drives 180 real `authorize()`
      // calls (not a seeded internal counter) to prove the branch is
      // actually reachable end-to-end.
      const { authorization } = service(callRow(), { ASSIGNMENT_CALL_SIGNALS_PER_10S: 60 });
      const signal = () =>
        authorization.authorize({
          socketId: SOCKET_ID,
          actorId: CALLER_ID,
          payload: offerPayload({ kind: 'ice_candidate', sdp: undefined }),
        });

      let last: Awaited<ReturnType<typeof signal>> | undefined;
      for (let index = 0; index < 181; index += 1) {
        last = await signal();
      }

      // The 181st call is the first to exceed 3x 60 (180) -- everything
      // from the 61st through the 180th was already ordinary rate-limited
      // (no `disconnect` flag), and only crossing 180 escalates.
      expect(last).toEqual({
        ok: false,
        code: 'ASSIGNMENT_CALL_SIGNAL_RATE_LIMITED',
        disconnect: true,
      });
    });

    it('applies a tighter 5-per-30s limit to offers/answers, independent of the general 60/10s counter', async () => {
      const { authorization } = service(callRow({ outcome: 'ringing', answered_at: null }));

      for (let index = 0; index < 5; index += 1) {
        const result = await authorization.authorize({
          socketId: SOCKET_ID,
          actorId: CALLER_ID,
          payload: offerPayload({ signalSeq: index }),
        });
        expect(result.ok).toBe(true);
      }

      const sixthOffer = await authorization.authorize({
        socketId: SOCKET_ID,
        actorId: CALLER_ID,
        payload: offerPayload({ signalSeq: 5 }),
      });
      expect(sixthOffer).toEqual({ ok: false, code: 'ASSIGNMENT_CALL_SIGNAL_RATE_LIMITED' });

      // The general counter (60/10s) is nowhere near its own ceiling yet --
      // an unrelated ice_candidate on the same socket+call still goes through.
      const candidate = await authorization.authorize({
        socketId: SOCKET_ID,
        actorId: CALLER_ID,
        payload: offerPayload({ kind: 'ice_candidate', sdp: undefined, signalSeq: 6 }),
      });
      expect(candidate.ok).toBe(true);
    });
  });

  describe('clearSocket', () => {
    it('clears this socket rate-limit history so a new signal is treated as fresh', async () => {
      const { authorization } = service(callRow(), { ASSIGNMENT_CALL_SIGNALS_PER_10S: 1 });

      const first = await authorization.authorize({
        socketId: SOCKET_ID,
        actorId: CALLER_ID,
        payload: offerPayload({ kind: 'ice_candidate', sdp: undefined }),
      });
      expect(first.ok).toBe(true);
      const second = await authorization.authorize({
        socketId: SOCKET_ID,
        actorId: CALLER_ID,
        payload: offerPayload({ kind: 'ice_candidate', sdp: undefined, signalSeq: 1 }),
      });
      expect(second).toMatchObject({ ok: false, code: 'ASSIGNMENT_CALL_SIGNAL_RATE_LIMITED' });

      authorization.clearSocket(SOCKET_ID);

      const afterClear = await authorization.authorize({
        socketId: SOCKET_ID,
        actorId: CALLER_ID,
        payload: offerPayload({ kind: 'ice_candidate', sdp: undefined, signalSeq: 2 }),
      });
      expect(afterClear.ok).toBe(true);
    });
  });
});
