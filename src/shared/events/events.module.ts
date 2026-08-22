import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

/**
 * The in-process internal event bus, distinct from `shared/realtime` (which
 * talks to browsers) and from BullMQ (which talks to Redis-backed workers).
 * This is for one Nest process telling another part of itself something
 * happened -- currently just the realtime gateway announcing a socket
 * disconnected, so `assignment-calls` can arm its reconnect-grace timer
 * without the gateway needing to know that module exists.
 */
@Module({
  imports: [EventEmitterModule.forRoot()],
  exports: [EventEmitterModule],
})
export class EventsModule {}
