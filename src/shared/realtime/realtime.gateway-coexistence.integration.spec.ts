import { AddressInfo } from 'node:net';
import { INestApplication, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { AuthSession, User, UserRole, UserStatus } from '@prisma/client';
import { io as createSocket, Socket as ClientSocket } from 'socket.io-client';

import { hashToken } from '../auth/token-hash';
import { DatabaseService } from '../database/database.service';
import { AuthenticatedRealtimeSocket, RealtimeGateway } from './realtime.gateway';
import { REALTIME_NAMESPACE } from './realtime.config';
import { RealtimePublisherService } from './realtime-publisher.service';

/**
 * The day-1 proof §4.4 of the P2P WebRTC calling plan requires: does Nest
 * invoke `handleConnection` once (from `RealtimeGateway`, the only gateway
 * that implements `OnGatewayConnection`) or does a *second* gateway sharing
 * the `/realtime` namespace get an unwanted second authentication pass?
 *
 * This boots a real Nest HTTP+WebSocket server (not a mocked gateway
 * instance) with both `RealtimeGateway` and a second, minimal gateway that
 * mirrors `AssignmentCallSignalingGateway`'s shape -- same namespace, same
 * `@SubscribeMessage` pattern, deliberately no `OnGatewayConnection` -- and
 * a real `socket.io-client` connection, so the assertions exercise Nest's
 * actual gateway-dispatch mechanism rather than a mock of it.
 */

type SessionWithUser = AuthSession & { user: User };

const user: User = {
  id: 'user-1',
  email: 'contributor@example.com',
  username: 'contributor',
  password_hash: null,
  first_name: 'Sharek',
  last_name: 'Contributor',
  avatar_url: null,
  role: UserRole.contributor,
  status: UserStatus.active,
  preferred_language: 'en',
  phone_number: null,
  phone_verified_at: null,
  country: null,
  region: null,
  city: null,
  gender: null,
  date_of_birth: null,
  profile_visibility: 'public',
  show_email: false,
  show_phone: false,
  show_activity: true,
  allow_indexing: true,
  identity_verification_status: 'unverified',
  identity_document_data: null,
  identity_document_mime_type: null,
  identity_document_updated_at: null,
  identity_verified_at: null,
  identity_verification_rejected_reason: null,
  identity_verified_by: null,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
  last_login_at: null,
} as User;

const session: SessionWithUser = {
  id: 'session-1',
  user_id: user.id,
  access_token_hash: hashToken('access-token'),
  refresh_token_hash: hashToken('refresh-token'),
  user_agent: null,
  ip_address: null,
  expires_at: new Date(Date.now() + 60_000),
  refresh_expires_at: new Date(Date.now() + 3_600_000),
  revoked_at: null,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
  user,
} as SessionWithUser;

/**
 * Deliberately shaped like `AssignmentCallSignalingGateway`: bound to the
 * same namespace, one `@SubscribeMessage` handler, and -- the entire point
 * of this test -- it does NOT implement `OnGatewayConnection`. If Nest ever
 * called an authentication hook on this class too, the `findFirst` call
 * count in the test below would show two authentication attempts, not one.
 */
@WebSocketGateway({ namespace: REALTIME_NAMESPACE, transports: ['websocket'] })
class SecondNamespaceGateway {
  @SubscribeMessage('second.probe')
  handleProbe(@ConnectedSocket() client: AuthenticatedRealtimeSocket, @MessageBody() _payload: unknown) {
    const userId = client.data.user?.id;
    if (!userId) {
      return Promise.resolve({ ok: false, code: 'UNAUTHENTICATED' });
    }
    return Promise.resolve({ ok: true, seenUserId: userId });
  }
}

describe('Two gateways sharing the /realtime namespace', () => {
  let app: INestApplication;
  let client: ClientSocket;
  let findFirst: jest.Mock;
  let baseUrl: string;

  beforeAll(async () => {
    findFirst = jest.fn().mockResolvedValue(session);
    const database = { authSession: { findFirst } };

    @Module({
      providers: [
        { provide: DatabaseService, useValue: database },
        {
          provide: ConfigService,
          useValue: new ConfigService({ REALTIME_NOTIFICATIONS_ENABLED: true }),
        },
        RealtimePublisherService,
        RealtimeGateway,
        SecondNamespaceGateway,
      ],
    })
    class CoexistenceTestModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [CoexistenceTestModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    client?.disconnect();
    await app?.close();
  });

  it('authenticates exactly once and lets the second gateway read the same client.data.user', async () => {
    client = createSocket(`${baseUrl}/realtime`, {
      auth: { token: 'access-token' },
      transports: ['websocket'],
      autoConnect: false,
    });

    const connected = new Promise<void>((resolve, reject) => {
      client.once('connect', () => resolve());
      client.once('connect_error', reject);
    });
    client.connect();
    await connected;

    // The one behavior this whole test exists to prove: RealtimeGateway's
    // handleConnection ran exactly once. If the second gateway also
    // implemented OnGatewayConnection, this would be 2.
    expect(findFirst).toHaveBeenCalledTimes(1);

    const ack = await new Promise<{ ok: boolean; seenUserId?: string }>(
      (resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('second-gateway ack timed out')), 5_000);
        client.emit('second.probe', {}, (response: { ok: boolean; seenUserId?: string }) => {
          clearTimeout(timeout);
          resolve(response);
        });
      },
    );

    // The second gateway never authenticated on its own -- it only read
    // `client.data.user`, already populated by RealtimeGateway before this
    // message could ever arrive.
    expect(ack).toEqual({ ok: true, seenUserId: user.id });
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it('rejects the second gateway message if somehow client.data.user were ever absent', async () => {
    // Documents the fallback the signaling gateway itself codes for
    // (`assignment-call-signaling.gateway.ts`'s `if (!user)` branch) --
    // exercised here directly against the fixture gateway rather than by
    // contriving an unauthenticated-yet-connected socket, which
    // RealtimeGateway's own handleConnection does not allow to persist.
    const gateway = new SecondNamespaceGateway();
    const clientStub = { data: {} } as never;

    await expect(gateway.handleProbe(clientStub, {})).resolves.toEqual({
      ok: false,
      code: 'UNAUTHENTICATED',
    });
  });
});
