import { forwardRef, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RealtimeModule } from '../../shared/realtime/realtime.module';
import { MalwareScanner } from '../../shared/scanning/malware-scanner';
import {
  SCANNER_STUB_MODE_CONFIG_KEY,
  StubMalwareScanner,
} from '../../shared/scanning/stub-malware-scanner';
import { ObjectStorage } from '../../shared/storage/object-storage';
import { S3ObjectStorage } from '../../shared/storage/s3-object-storage';
import { AssignmentConversationsModule } from '../assignment-conversations/assignment-conversations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChatAttachmentsController } from './chat-attachments.controller';
import { ChatAttachmentScanQueue } from './jobs/chat-attachment-scan.queue';
import { ChatAttachmentScanWorker } from './jobs/chat-attachment-scan.worker';
import { ChatAttachmentBindingService } from './services/chat-attachment-binding.service';
import { ChatAttachmentDownloadService } from './services/chat-attachment-download.service';
import { ChatAttachmentEventRecoveryService } from './services/chat-attachment-event-recovery.service';
import { ChatAttachmentPurgeService } from './services/chat-attachment-purge.service';
import { ChatAttachmentRealtimeService } from './services/chat-attachment-realtime.service';
import { ChatAttachmentScanProcessorService } from './services/chat-attachment-scan-processor.service';
import { ChatAttachmentScanReaperService } from './services/chat-attachment-scan-reaper.service';
import { ChatAttachmentsService } from './services/chat-attachments.service';

/**
 * S3 chat attachments.
 *
 * `AssignmentConversationsModule` is imported here for authorization
 * (`getParticipation`); the binding call goes the other way, so
 * `AssignmentConversationsModule` imports this module back with
 * `forwardRef` and injects `ChatAttachmentBindingService` `@Optional()` --
 * the same pattern `AssignmentConversationsService` already uses for
 * `realtime` and `notifications`, so the module graph still boots with the
 * `chat_attachments` flag off. Only `ChatAttachmentBindingService` is
 * exported, per `backend-conventions.md`.
 */
@Module({
  imports: [
    forwardRef(() => AssignmentConversationsModule),
    NotificationsModule,
    RealtimeModule,
  ],
  controllers: [ChatAttachmentsController],
  providers: [
    ChatAttachmentsService,
    ChatAttachmentBindingService,
    ChatAttachmentDownloadService,
    ChatAttachmentScanProcessorService,
    ChatAttachmentScanReaperService,
    ChatAttachmentPurgeService,
    ChatAttachmentRealtimeService,
    ChatAttachmentEventRecoveryService,
    ChatAttachmentScanQueue,
    ChatAttachmentScanWorker,
    {
      provide: ObjectStorage,
      useFactory: (config: ConfigService) =>
        new S3ObjectStorage(config, {
          bucket: config.get<string>('S3_CHAT_ATTACHMENTS_BUCKET', ''),
          keyPrefix: config.get<string>(
            'S3_CHAT_ATTACHMENTS_KEY_PREFIX',
            'chat-attachments/',
          ),
        }),
      inject: [ConfigService],
    },
    // Bound here and nowhere else, so replacing the stub with a real scanner
    // is a one-line change in this file, exactly like Materials.
    { provide: MalwareScanner, useClass: StubMalwareScanner },
    {
      provide: SCANNER_STUB_MODE_CONFIG_KEY,
      useValue: 'CHAT_ATTACHMENT_SCANNER_STUB_MODE',
    },
  ],
  exports: [ChatAttachmentBindingService],
})
export class ChatAttachmentsModule {}
