import { AssignmentCallSignalingGateway } from './assignment-call-signaling.gateway';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PEER_ID = '22222222-2222-4222-8222-222222222222';
const CALL_ID = '33333333-3333-4333-8333-333333333333';
const CALL_SESSION_ID = '44444444-4444-4444-8444-444444444444';

function client(overrides: Partial<{ id: string; user: unknown }> = {}) {
  const id = overrides.id ?? 'socket-1';
  // `'user' in overrides` (rather than a destructuring default) so a test can
  // deliberately pass `user: undefined` without it being silently replaced.
  const user = 'user' in overrides
    ? overrides.user
    : { id: USER_ID, email: 'caller@example.com', role: 'owner', status: 'active' };
  return {
    id,
    data: { user },
    disconnect: jest.fn(),
  } as unknown as Parameters<AssignmentCallSignalingGateway['handleSignal']>[0];
}

function harness() {
  const authorization = { authorize: jest.fn(), clearSocket: jest.fn() };
  const publisher = { publishTransientToUser: jest.fn() };
  const gateway = new AssignmentCallSignalingGateway(authorization as never, publisher as never);
  return { gateway, authorization, publisher };
}

function validSignal(overrides: Record<string, unknown> = {}) {
  return {
    callId: CALL_ID,
    callSessionId: CALL_SESSION_ID,
    kind: 'offer',
    sdp: 'v=0 fake-sdp',
    signalSeq: 0,
    ...overrides,
  };
}

describe('AssignmentCallSignalingGateway', () => {
  it('refuses a message from a socket whose client.data.user was never set', async () => {
    const { gateway, authorization } = harness();
    const socket = client({ user: undefined });

    const ack = await gateway.handleSignal(socket, validSignal());

    expect(ack).toEqual({ ok: false, code: 'ASSIGNMENT_CALL_SIGNAL_REJECTED' });
    expect(authorization.authorize).not.toHaveBeenCalled();
  });

  it('acks { ok: false, code } for an unauthorized signal, without disconnecting', async () => {
    const { gateway, authorization } = harness();
    authorization.authorize.mockResolvedValue({ ok: false, code: 'ASSIGNMENT_CALL_SIGNAL_TOO_LARGE' });
    const socket = client();

    const ack = await gateway.handleSignal(socket, validSignal({ sdp: 'x'.repeat(100_000) }));

    expect(ack).toEqual({ ok: false, code: 'ASSIGNMENT_CALL_SIGNAL_TOO_LARGE' });
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('disconnects the socket when authorization signals the rate-limit ceiling', async () => {
    const { gateway, authorization } = harness();
    authorization.authorize.mockResolvedValue({
      ok: false,
      code: 'ASSIGNMENT_CALL_SIGNAL_RATE_LIMITED',
      disconnect: true,
    });
    const socket = client();

    const ack = await gateway.handleSignal(socket, validSignal());

    expect(ack).toEqual({ ok: false, code: 'ASSIGNMENT_CALL_SIGNAL_RATE_LIMITED' });
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('stamps fromUserId from the authenticated socket, never from the payload -- even a spoofed one', async () => {
    const { gateway, authorization, publisher } = harness();
    // Simulates a signal object that somehow carried an attacker-controlled
    // fromUserId -- the gateway must never forward it.
    authorization.authorize.mockResolvedValue({
      ok: true,
      peerId: PEER_ID,
      signal: { ...validSignal(), fromUserId: 'attacker-controlled-id' },
    });
    const socket = client();

    const ack = await gateway.handleSignal(socket, validSignal({ fromUserId: 'attacker-controlled-id' }));

    expect(ack).toEqual({ ok: true });
    const [, , outbound] = publisher.publishTransientToUser.mock.calls[0] as [
      string,
      string,
      { fromUserId: string },
    ];
    expect(outbound.fromUserId).toBe(USER_ID);
    expect(outbound.fromUserId).not.toBe('attacker-controlled-id');
  });

  it('relays only to the authorized peer, never back to the sender', async () => {
    const { gateway, authorization, publisher } = harness();
    authorization.authorize.mockResolvedValue({ ok: true, peerId: PEER_ID, signal: validSignal() });
    const socket = client();

    await gateway.handleSignal(socket, validSignal());

    expect(publisher.publishTransientToUser).toHaveBeenCalledWith(
      PEER_ID,
      'assignment_call.signal',
      expect.any(Object),
    );
    expect(publisher.publishTransientToUser).not.toHaveBeenCalledWith(
      USER_ID,
      expect.anything(),
      expect.anything(),
    );
  });

  it('relays the full signal shape with a server-stamped relayedAt', async () => {
    const { gateway, authorization, publisher } = harness();
    const candidate = { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 };
    authorization.authorize.mockResolvedValue({
      ok: true,
      peerId: PEER_ID,
      signal: validSignal({ kind: 'ice_candidate', sdp: undefined, candidate }),
    });
    const socket = client();

    await gateway.handleSignal(socket, validSignal({ kind: 'ice_candidate', sdp: undefined, candidate }));

    expect(publisher.publishTransientToUser).toHaveBeenCalledWith(
      PEER_ID,
      'assignment_call.signal',
      expect.objectContaining({
        callId: CALL_ID,
        fromCallSessionId: CALL_SESSION_ID,
        kind: 'ice_candidate',
        candidate,
        signalSeq: 0,
        relayedAt: expect.any(String) as string,
      }),
    );
  });

  it('always acks { ok: true } on success, with no code field', async () => {
    const { gateway, authorization } = harness();
    authorization.authorize.mockResolvedValue({ ok: true, peerId: PEER_ID, signal: validSignal() });
    const socket = client();

    const ack = await gateway.handleSignal(socket, validSignal());

    expect(ack).toEqual({ ok: true });
  });

  it('clears the socket rate-limit state on disconnect', () => {
    const { gateway, authorization } = harness();
    const socket = client();

    gateway.handleDisconnect(socket);

    expect(authorization.clearSocket).toHaveBeenCalledWith(socket.id);
  });
});
