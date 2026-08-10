import { Module } from '@nestjs/common';

import { AssignmentConversationsController } from './assignment-conversations.controller';
import { AssignmentConversationsService } from './assignment-conversations.service';
import { AssignmentConversationRealtimeService } from './assignment-conversation-realtime.service';
import { RealtimeModule } from '../../shared/realtime/realtime.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [RealtimeModule, NotificationsModule],
  controllers: [AssignmentConversationsController],
  providers: [
    AssignmentConversationsService,
    AssignmentConversationRealtimeService,
  ],
  exports: [AssignmentConversationsService],
})
export class AssignmentConversationsModule {}
