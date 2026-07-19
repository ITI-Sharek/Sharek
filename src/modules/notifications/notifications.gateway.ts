import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { AuthSession, User } from '@prisma/client';
import { Server, Socket } from 'socket.io';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { hashToken } from '../../shared/auth/token-hash';
import { DatabaseService } from '../../shared/database/database.service';
import { RealtimeNotificationDto } from './dto/realtime-notification.dto';

type AuthenticatedNotificationSocket = Socket & {
  data: Socket['data'] & {
    user?: AuthenticatedUser;
    authSessionId?: string;
  };
};

type SessionWithUser = AuthSession & { user: User };

function parseCorsOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

@WebSocketGateway({
  namespace: 'notifications',
  cors: {
    origin: parseCorsOrigins(
      process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:3001',
    ),
    credentials: true,
  },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private server?: Server;

  private readonly userSockets = new Map<string, Set<string>>();

  constructor(private readonly database: DatabaseService) {}

  async handleConnection(client: AuthenticatedNotificationSocket) {
    const token = this.extractAccessToken(client);

    if (!token) {
      this.rejectConnection(client);
      return;
    }

    const session = await this.findUsableSession(token);

    if (!session) {
      this.rejectConnection(client);
      return;
    }

    client.data.user = {
      id: session.user.id,
      email: session.user.email,
      role: session.user.role,
      status: session.user.status,
    };
    client.data.authSessionId = session.id;
    await client.join(this.userRoom(session.user.id));
    this.trackSocket(session.user.id, client.id);
  }

  handleDisconnect(client: AuthenticatedNotificationSocket) {
    const userId = client.data.user?.id;

    if (!userId) {
      return;
    }

    const sockets = this.userSockets.get(userId);
    sockets?.delete(client.id);

    if (sockets?.size === 0) {
      this.userSockets.delete(userId);
    }
  }

  emitNotification(notification: RealtimeNotificationDto): boolean {
    if (!this.server || !this.userSockets.has(notification.userId)) {
      return false;
    }

    this.server
      .to(this.userRoom(notification.userId))
      .emit('notification.created', notification);
    return true;
  }

  getConnectedSocketCount(userId: string): number {
    return this.userSockets.get(userId)?.size ?? 0;
  }

  bindServerForTesting(server: Server): void {
    this.server = server;
  }

  private async findUsableSession(
    token: string,
  ): Promise<SessionWithUser | null> {
    const session = await this.database.authSession.findFirst({
      where: {
        access_token_hash: hashToken(token),
        revoked_at: null,
        expires_at: {
          gt: new Date(),
        },
      },
      include: {
        user: true,
      },
    });

    if (!session || !this.canUseSession(session.user)) {
      return null;
    }

    return session;
  }

  private canUseSession(user: User): boolean {
    return (
      user.status === 'active' ||
      (user.role === 'contributor' && user.status === 'pending')
    );
  }

  private extractAccessToken(
    client: AuthenticatedNotificationSocket,
  ): string | null {
    const authToken = client.handshake.auth?.token;

    if (typeof authToken === 'string' && authToken.trim().length > 0) {
      return this.normalizeBearerToken(authToken);
    }

    const authorization = client.handshake.headers.authorization;

    if (typeof authorization === 'string') {
      return this.normalizeBearerToken(authorization);
    }

    return null;
  }

  private normalizeBearerToken(value: string): string | null {
    const trimmed = value.trim();

    if (!trimmed) {
      return null;
    }

    const [scheme, token] = trimmed.split(' ');

    if (scheme?.toLowerCase() === 'bearer') {
      return token?.trim() || null;
    }

    return trimmed;
  }

  private rejectConnection(client: AuthenticatedNotificationSocket): void {
    client.emit('notifications.error', {
      code: 'NOTIFICATIONS_SOCKET_UNAUTHORIZED',
      message: 'Invalid or expired session',
    });
    client.disconnect(true);
  }

  private trackSocket(userId: string, socketId: string): void {
    const sockets = this.userSockets.get(userId) ?? new Set<string>();
    sockets.add(socketId);
    this.userSockets.set(userId, sockets);
  }

  private userRoom(userId: string): string {
    return `user:${userId}`;
  }
}
