import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';

import { AuthenticatedRealtimeSocket } from '../../shared/realtime/realtime.gateway';
import {
  parseRealtimeCorsOrigins,
  REALTIME_NAMESPACE,
} from '../../shared/realtime/realtime.config';
import { RealtimePublisherService } from '../../shared/realtime/realtime-publisher.service';
import { AssignmentCallSignalAck, AssignmentCallSignalOutboundDto } from './dto/assignment-call-signal.dto';
import { AssignmentCallAuthorizationService } from './services/assignment-call-authorization.service';

/**
 * Relays SDP offer/answer and ICE candidates -- the only two payload shapes
 * the amended Share-k realtime boundary (COMMUNICATION.md, realtime
 * boundary item 3) allows onto a socket instead of a durable HTTP command.
 * These are the first `@SubscribeMessage` handlers in this repo.
 *
 * CRITICAL: this class must NEVER implement `OnGatewayConnection`.
 * `RealtimeGateway.handleConnection` (`shared/realtime/realtime.gateway.ts`)
 * is the only place that authenticates a socket and sets
 * `client.data.user`. Nest invokes `handleConnection`
 * on *every* gateway bound to a namespace that implements the interface, so
 * a second `handleConnection` here would either re-run authentication
 * redundantly or -- if written carelessly -- run before `RealtimeGateway`'s
 * and see no session yet. This gateway only ever *reads*
 * `client.data.user`, already set by the time any client message arrives.
 * `realtime.gateway-coexistence.integration.spec.ts` proves two gateways
 * share this namespace without double-authenticating; do not remove that
 * spec's guard when refactoring either gateway.
 *
 * Deliberately implements `OnGatewayDisconnect` (unlike connection) only to
 * release this socket's own in-memory rate-limit state -- it does not
 * authenticate on connect, so there is nothing asymmetric about also
 * cleaning up on disconnect.
 */
@WebSocketGateway({
  namespace: REALTIME_NAMESPACE,
  transports: ['websocket'],
  cors: {
    origin: parseRealtimeCorsOrigins(
      process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:3001',
    ),
    credentials: true,
  },
})
export class AssignmentCallSignalingGateway implements OnGatewayDisconnect {
  constructor(
    private readonly authorization: AssignmentCallAuthorizationService,
    private readonly publisher: RealtimePublisherService,
  ) {}

  @SubscribeMessage('assignment_call.signal')
  async handleSignal(
    @ConnectedSocket() client: AuthenticatedRealtimeSocket,
    @MessageBody() payload: unknown,
  ): Promise<AssignmentCallSignalAck> {
    const user = client.data.user;
    if (!user) {
      // Should be unreachable: RealtimeGateway disconnects any socket that
      // never authenticates. Refusing rather than throwing keeps a
      // misbehaving client from being told anything beyond "rejected".
      return { ok: false, code: 'ASSIGNMENT_CALL_SIGNAL_REJECTED' };
    }

    const authorized = await this.authorization.authorize({
      socketId: client.id,
      actorId: user.id,
      payload,
    });
    if (!authorized.ok) {
      if (authorized.disconnect) {
        client.disconnect(true);
      }
      return { ok: false, code: authorized.code };
    }

    const outbound: AssignmentCallSignalOutboundDto = {
      callId: authorized.signal.callId,
      // Always the authenticated sender's own identity -- never read from
      // the payload, which is untrusted client input.
      fromUserId: user.id,
      fromCallSessionId: authorized.signal.callSessionId,
      kind: authorized.signal.kind,
      sdp: authorized.signal.sdp,
      candidate: authorized.signal.candidate,
      signalSeq: authorized.signal.signalSeq,
      relayedAt: new Date().toISOString(),
    };
    // `user:<id>` fan-out reaches every tab the peer has open; the client
    // filters by `fromCallSessionId` (this call's session, opaque to the
    // server) to find the tab that is actually in the call. Never the
    // sender's own room -- a signal is never echoed back to itself.
    this.publisher.publishTransientToUser(
      authorized.peerId,
      'assignment_call.signal',
      outbound,
    );

    return { ok: true };
  }

  handleDisconnect(client: AuthenticatedRealtimeSocket): void {
    this.authorization.clearSocket(client.id);
  }
}
