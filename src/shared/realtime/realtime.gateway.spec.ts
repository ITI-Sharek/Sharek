import { AuthSession, User, UserRole, UserStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

import { hashToken } from '../auth/token-hash';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimePublisherService } from './realtime-publisher.service';

type RealtimeSocket = Parameters<RealtimeGateway['handleConnection']>[0];
type RealtimeServer = Parameters<RealtimeGateway['afterInit']>[0];
type SessionWithUser = AuthSession & { user: User };

const user = {
  id: 'user-1',
  email: 'contributor@example.com',
  username: 'contributor',
  password_hash: null,
  first_name: 'Sharek',
  last_name: 'Contributor',
  avatar_url: null,
  role: UserRole.contributor,
  status: UserStatus.pending,
  preferred_language: 'en',
  created_at: new Date('2026-07-19T00:00:00.000Z'),
  updated_at: new Date('2026-07-19T00:00:00.000Z'),
  last_login_at: null,
} as User;

const session = {
  id: 'session-1',
  user_id: user.id,
  access_token_hash: hashToken('access-token'),
  refresh_token_hash: hashToken('refresh-token'),
  user_agent: null,
  ip_address: null,
  expires_at: new Date('2026-07-19T00:15:00.000Z'),
  refresh_expires_at: new Date('2026-08-19T00:00:00.000Z'),
  revoked_at: null,
  created_at: new Date('2026-07-19T00:00:00.000Z'),
  updated_at: new Date('2026-07-19T00:00:00.000Z'),
  user,
} as AuthSession & { user: User };

function createSocket(input: {
  token?: string;
  authorization?: string;
}): RealtimeSocket {
  return {
    id: 'socket-1',
    handshake: {
      auth: input.token ? { token: input.token } : {},
      headers: input.authorization
        ? { authorization: input.authorization }
        : {},
    },
    data: {},
    join: jest.fn().mockResolvedValue(undefined),
    emit: jest.fn(),
    disconnect: jest.fn(),
  } as unknown as RealtimeSocket;
}

function createGateway(findFirst = jest.fn().mockResolvedValue(session)) {
  const database = { authSession: { findFirst } };
  const publisher = new RealtimePublisherService(
    new ConfigService({ REALTIME_NOTIFICATIONS_ENABLED: true }),
  );
  return {
    gateway: new RealtimeGateway(
      database as never,
      new ConfigService({ REALTIME_NOTIFICATIONS_ENABLED: true }),
      publisher,
    ),
    database,
  };
}

function sessionFor(userOverrides: Partial<User>): SessionWithUser {
  return {
    ...session,
    user: { ...user, ...userOverrides },
  } as SessionWithUser;
}

describe('RealtimeGateway', () => {
  it('authenticates a session and joins only its user room', async () => {
    const { gateway, database } = createGateway();
    const client = createSocket({ token: 'Bearer access-token' });

    await gateway.handleConnection(client);

    expect(database.authSession.findFirst).toHaveBeenCalledWith({
      where: {
        access_token_hash: hashToken('access-token'),
        revoked_at: null,
        expires_at: { gt: expect.any(Date) as Date },
      },
      include: { user: true },
    });
    expect(client.join).toHaveBeenCalledWith('user:user-1');
    expect(client.data.user).toMatchObject({
      id: 'user-1',
      role: UserRole.contributor,
      status: UserStatus.pending,
    });
  });

  it.each([
    ['active users', sessionFor({ role: UserRole.owner, status: UserStatus.active })],
    [
      'pending contributors',
      sessionFor({ role: UserRole.contributor, status: UserStatus.pending }),
    ],
  ])('accepts %s', async (_description, usableSession) => {
    const { gateway } = createGateway(jest.fn().mockResolvedValue(usableSession));
    const client = createSocket({ token: 'access-token' });

    await gateway.handleConnection(client);

    expect(client.join).toHaveBeenCalledWith(`user:${usableSession.user.id}`);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it.each([
    ['expired', null],
    ['revoked', null],
    [
      'suspended',
      sessionFor({ role: UserRole.contributor, status: UserStatus.suspended }),
    ],
  ])('rejects %s sessions', async (_description, unusableSession) => {
    const { gateway } = createGateway(
      jest.fn().mockResolvedValue(unusableSession),
    );
    const client = createSocket({ token: 'access-token' });

    await gateway.handleConnection(client);

    expect(client.emit).toHaveBeenCalledWith('realtime.error', {
      code: 'REALTIME_UNAUTHORIZED',
      message: 'Invalid or expired session',
    });
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('normalizes bearer credentials with mixed casing and repeated whitespace', async () => {
    const { gateway, database } = createGateway();
    const client = createSocket({ token: '  bEaReR   access-token  ' });

    await gateway.handleConnection(client);

    expect(database.authSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          access_token_hash: hashToken('access-token'),
        }),
      }),
    );
  });

  it('rejects an invalid session with the shared realtime error contract', async () => {
    const { gateway } = createGateway(jest.fn().mockResolvedValue(null));
    const client = createSocket({ token: 'missing-token' });

    await gateway.handleConnection(client);

    expect(client.emit).toHaveBeenCalledWith('realtime.error', {
      code: 'REALTIME_UNAUTHORIZED',
      message: 'Invalid or expired session',
    });
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('binds the shared publisher to the initialized Socket.IO server', () => {
    const { gateway } = createGateway();
    const publisher = (gateway as unknown as { publisher: RealtimePublisherService })
      .publisher;
    const server = { to: jest.fn() } as unknown as RealtimeServer;

    gateway.afterInit(server);

    expect(() => publisher.publishToUser('user-1', {
      eventId: 'event-1',
      type: 'test.event',
      version: 1,
      occurredAt: '2026-08-09T00:00:00.000Z',
      aggregateId: 'aggregate-1',
      aggregateVersion: 1,
      payload: {},
    })).not.toThrow();
    expect(server.to).toHaveBeenCalledWith('user:user-1');
  });

  it('publishes independently to the requested user room without connection-state authority', () => {
    const { gateway } = createGateway();
    const publisher = (gateway as unknown as { publisher: RealtimePublisherService })
      .publisher;
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    const server = { to } as unknown as RealtimeServer;
    gateway.afterInit(server);

    expect(
      publisher.publishToUser('user-1', {
        eventId: 'event-user-1',
        type: 'notification.created',
        version: 1,
        occurredAt: '2026-08-09T00:00:00.000Z',
        aggregateId: 'notification-1',
        aggregateVersion: 1,
        payload: {},
      }),
    ).toBe(true);
    expect(
      publisher.publishToUser('user-2', {
        eventId: 'event-user-2',
        type: 'notification.created',
        version: 1,
        occurredAt: '2026-08-09T00:00:00.000Z',
        aggregateId: 'notification-2',
        aggregateVersion: 1,
        payload: {},
      }),
    ).toBe(true);

    expect(to).toHaveBeenNthCalledWith(1, 'user:user-1');
    expect(to).toHaveBeenNthCalledWith(2, 'user:user-2');
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('rejects all connections while disabled', async () => {
    const database = { authSession: { findFirst: jest.fn() } };
    const gateway = new RealtimeGateway(
      database as never,
      new ConfigService({ REALTIME_NOTIFICATIONS_ENABLED: false }),
      new RealtimePublisherService(new ConfigService({ REALTIME_NOTIFICATIONS_ENABLED: false })),
    );
    const client = createSocket({ token: 'access-token' });

    await gateway.handleConnection(client);

    expect(client.emit).toHaveBeenCalledWith('realtime.error', {
      code: 'REALTIME_DISABLED',
      message: 'Realtime is not enabled',
    });
    expect(database.authSession.findFirst).not.toHaveBeenCalled();
  });
});
