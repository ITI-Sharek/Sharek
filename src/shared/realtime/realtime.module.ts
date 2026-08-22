import { Module } from '@nestjs/common';

import { EventsModule } from '../events/events.module';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimePublisherService } from './realtime-publisher.service';

@Module({
  imports: [EventsModule],
  providers: [RealtimeGateway, RealtimePublisherService],
  exports: [RealtimePublisherService],
})
export class RealtimeModule {}
