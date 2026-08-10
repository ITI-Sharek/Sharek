import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { AuthSession, User } from '@prisma/client';
import { Server, Socket } from 'socket.io';

import { AuthenticatedUser } from '../auth/authenticated-request';
import { hashToken } from '../auth/token-hash';
import { DatabaseService } from '../database/database.service';
import {
  isRealtimeNotificationsEnabled,
  REALTIME_NAMESPACE,
  realtimeUserRoom,
} from './realtime.config';
import { RealtimeBroadcastServer, RealtimePublisherService } from './realtime-publisher.service';

type AuthenticatedRealtimeSocket = Socket & {
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
  namespace: REALTIME_NAMESPACE,
  transports: ['websocket'],
  cors: {
    origin: parseCorsOrigins(
      process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:3001',
    ),
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayInit {
  @WebSocketServer()
  private server?: Server;

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly publisher: RealtimePublisherService,
  ) {}

  afterInit(server: Server): void {
    this.server = server;
    this.publisher.bindServer(server as RealtimeBroadcastServer);
  }

  async handleConnection(client: AuthenticatedRealtimeSocket): Promise<void> {
    if (!isRealtimeNotificationsEnabled(this.config)) {
      this.rejectConnection(client, 'REALTIME_DISABLED', 'Realtime is not enabled');
      return;
    }

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
    await client.join(realtimeUserRoom(session.user.id));
  }

  private async findUsableSession(
    token: string,
  ): Promise<SessionWithUser | null> {
    const session = await this.database.authSession.findFirst({
      where: {
        access_token_hash: hashToken(token),
        revoked_at: null,
        expires_at: { gt: new Date() },
      },
      include: { user: true },
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

  private extractAccessToken(client: AuthenticatedRealtimeSocket): string | null {
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
    if (!trimmed) return null;

    const bearer = trimmed.match(/^bearer\s+(.+)$/i);
    return bearer ? bearer[1].trim() || null : trimmed;
  }

  private rejectConnection(
    client: AuthenticatedRealtimeSocket,
    code = 'REALTIME_UNAUTHORIZED',
    message = 'Invalid or expired session',
  ): void {
    client.emit('realtime.error', { code, message });
    client.disconnect(true);
  }
}
