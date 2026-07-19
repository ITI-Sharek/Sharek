import { AuthSession, User, UserRole, UserStatus } from '@prisma/client';

import { hashToken } from '../../shared/auth/token-hash';
import { NotificationsGateway } from './notifications.gateway';

type NotificationSocket = Parameters<NotificationsGateway['handleConnection']>[0];
type NotificationServer = Parameters<NotificationsGateway['bindServerForTesting']>[0];

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
  id?: string;
  token?: string;
  authorization?: string;
}): NotificationSocket {
  return {
    id: input.id ?? 'socket-1',
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
  } as unknown as NotificationSocket;
}

function createGateway(findFirst = jest.fn().mockResolvedValue(session)) {
  const database = {
    authSession: {
      findFirst,
    },
  };

  return {
    gateway: new NotificationsGateway(database as never),
    database,
  };
}

describe('NotificationsGateway', () => {
  it('authenticates a socket with an access token and joins the user room', async () => {
    const { gateway, database } = createGateway();
    const client = createSocket({ token: 'Bearer access-token' });

    await gateway.handleConnection(client);

    expect(database.authSession.findFirst).toHaveBeenCalledWith({
      where: {
        access_token_hash: hashToken('access-token'),
        revoked_at: null,
        expires_at: {
          gt: expect.any(Date) as Date,
        },
      },
      include: {
        user: true,
      },
    });
    expect(client.join).toHaveBeenCalledWith('user:user-1');
    expect(client.data.user).toMatchObject({
      id: 'user-1',
      email: 'contributor@example.com',
      role: 'contributor',
      status: 'pending',
    });
    expect(gateway.getConnectedSocketCount('user-1')).toBe(1);
  });

  it('rejects sockets without a usable session', async () => {
    const { gateway } = createGateway(jest.fn().mockResolvedValue(null));
    const client = createSocket({ token: 'missing-token' });

    await gateway.handleConnection(client);

    expect(client.emit).toHaveBeenCalledWith('notifications.error', {
      code: 'NOTIFICATIONS_SOCKET_UNAUTHORIZED',
      message: 'Invalid or expired session',
    });
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('emits persisted notifications to the connected user room', async () => {
    const { gateway } = createGateway();
    const client = createSocket({ token: 'access-token' });
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    gateway.bindServerForTesting({ to } as unknown as NotificationServer);

    await gateway.handleConnection(client);

    const delivered = gateway.emitNotification({
      notificationId: 'notification-1',
      userId: 'user-1',
      type: 'skill_review',
      title: 'Skill approved',
      message: 'Your TypeScript skill was approved.',
      metadata: { skillProfileId: 'skill-1' },
      isRead: false,
      readAt: null,
      createdAt: new Date('2026-07-19T00:01:00.000Z'),
    });

    expect(delivered).toBe(true);
    expect(to).toHaveBeenCalledWith('user:user-1');
    expect(emit).toHaveBeenCalledWith(
      'notification.created',
      expect.objectContaining({
        notificationId: 'notification-1',
        userId: 'user-1',
      }),
    );
  });

  it('stops delivering after the last user socket disconnects', async () => {
    const { gateway } = createGateway();
    const client = createSocket({ token: 'access-token' });

    await gateway.handleConnection(client);
    gateway.handleDisconnect(client);

    expect(gateway.getConnectedSocketCount('user-1')).toBe(0);
    expect(
      gateway.emitNotification({
        notificationId: 'notification-1',
        userId: 'user-1',
        type: 'skill_review',
        title: 'Skill approved',
        message: 'Your TypeScript skill was approved.',
        metadata: null,
        isRead: false,
        readAt: null,
        createdAt: new Date('2026-07-19T00:01:00.000Z'),
      }),
    ).toBe(false);
  });
});
