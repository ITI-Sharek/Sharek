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
}
