import { Module } from '@nestjs/common';

import { RealtimeGateway } from './realtime.gateway';
import { RealtimePublisherService } from './realtime-publisher.service';

@Module({
  providers: [RealtimeGateway, RealtimePublisherService],
  exports: [RealtimePublisherService],
})
export class RealtimeModule {}
