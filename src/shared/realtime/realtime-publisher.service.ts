import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RealtimeEventEnvelope } from './realtime-event-envelope';
import { isRealtimeNotificationsEnabled, realtimeUserRoom } from './realtime.config';

export interface RealtimeRoomEmitter {
  emit(eventType: string, envelope: unknown): unknown;
}

export interface RealtimeBroadcastServer {
  to(room: string): RealtimeRoomEmitter;
}

@Injectable()
export class RealtimePublisherService {
  private server?: RealtimeBroadcastServer;

  constructor(private readonly config: ConfigService) {}

  bindServer(server: RealtimeBroadcastServer): void {
    this.server = server;
  }

  isEnabled(): boolean {
    return isRealtimeNotificationsEnabled(this.config);
  }

  publishToUser<TPayload>(
    userId: string,
    envelope: RealtimeEventEnvelope<TPayload>,
  ): boolean {
    if (!this.isEnabled() || !this.server) {
      return false;
    }

    try {
      this.server.to(realtimeUserRoom(userId)).emit(envelope.type, envelope);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Fire-and-forget delivery to every tab a user has open, with none of
   * {@link publishToUser}'s durability machinery: no envelope, no `eventId`,
   * no dedup, and nothing to sweep on a later recovery pass.
   *
   * For state that changes *because* of committing something (a Message, a
   * Notification), losing delivery would leave the client's cache silently
   * stale forever, so that path is outbox-backed. This is for state that is
   * only ever a live signal -- typing, presence, and (Slice 4) call
   * SDP/ICE -- where a client that missed it because it was briefly offline
   * has nothing to recover, because there was never a durable fact to recover.
   */
  publishTransientToUser(
    userId: string,
    eventName: string,
    payload: unknown,
  ): boolean {
    if (!this.isEnabled() || !this.server) {
      return false;
    }

    try {
      this.server.to(realtimeUserRoom(userId)).emit(eventName, payload);
      return true;
    } catch {
      return false;
    }
  }
}
