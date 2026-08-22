import { Module } from '@nestjs/common';

import { AssignmentConversationsModule } from '../assignment-conversations/assignment-conversations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../../shared/realtime/realtime.module';
import { AssignmentCallSignalingGateway } from './assignment-call-signaling.gateway';
import { AssignmentCallsController } from './assignment-calls.controller';
import { AssignmentCallQueue } from './jobs/assignment-call.queue';
import { AssignmentCallWorker } from './jobs/assignment-call.worker';
import { AssignmentCallAuthorizationService } from './services/assignment-call-authorization.service';
import { AssignmentCallCapacityService } from './services/assignment-call-capacity.service';
import { AssignmentCallIceService } from './services/assignment-call-ice.service';
import { AssignmentCallRealtimeService } from './services/assignment-call-realtime.service';
import { AssignmentCallTimersService } from './services/assignment-call-timers.service';
import { AssignmentCallsService } from './services/assignment-calls.service';

/**
 * P2P WebRTC Assignment Calls (ADR 0016).
 *
 * Owns its own tables, queue, gateway, and ICE-credential boundary -- kept
 * separate from `assignment-conversations` rather than folded into it.
 * Imports `AssignmentConversationsModule` for `getParticipation()`
 * (authorization only) in a single direction; unlike `chat-attachments`,
 * nothing calls back into this module from there, so no `forwardRef` is
 * needed.
 */
@Module({
  imports: [AssignmentConversationsModule, NotificationsModule, RealtimeModule],
  controllers: [AssignmentCallsController],
  providers: [
    AssignmentCallsService,
    AssignmentCallAuthorizationService,
    AssignmentCallRealtimeService,
    AssignmentCallIceService,
    AssignmentCallTimersService,
    AssignmentCallCapacityService,
    AssignmentCallSignalingGateway,
    AssignmentCallQueue,
    AssignmentCallWorker,
  ],
})
export class AssignmentCallsModule {}
