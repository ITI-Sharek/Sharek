import { forwardRef, Module } from '@nestjs/common';

import { ChatAttachmentsModule } from '../chat-attachments/chat-attachments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../../shared/realtime/realtime.module';
import { AssignmentConversationRealtimeService } from './assignment-conversation-realtime.service';
import { AssignmentConversationsController } from './assignment-conversations.controller';
import { AssignmentConversationsService } from './assignment-conversations.service';

@Module({
  imports: [
    RealtimeModule,
    NotificationsModule,
    // The binding call in sendMessage goes into chat-attachments, and
    // chat-attachments imports this module back for getParticipation(), so
    // both sides declare forwardRef. See chat-attachments/README.md.
    forwardRef(() => ChatAttachmentsModule),
  ],
  controllers: [AssignmentConversationsController],
  providers: [
    AssignmentConversationsService,
    AssignmentConversationRealtimeService,
  ],
  exports: [AssignmentConversationsService],
})
export class AssignmentConversationsModule {}
