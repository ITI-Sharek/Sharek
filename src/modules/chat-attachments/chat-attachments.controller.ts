import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AccessTokenGuard } from '../../shared/auth/guards/access-token.guard';
import { BadRequestApplicationError } from '../../shared/errors/application.error';
import { CreateAttachmentUploadDto } from './dto/create-attachment-upload.dto';
import { ChatAttachmentDownloadService } from './services/chat-attachment-download.service';
import {
  ChatAttachmentsService,
  UploadedAttachmentFile,
} from './services/chat-attachments.service';

/**
 * A memory-safety backstop for multer's own buffering, independent of the
 * business-configurable `CHAT_ATTACHMENT_MAX_BYTES`. Interceptor decorators
 * evaluate during module import -- before `ConfigModule.forRoot()` has
 * loaded `.env` into `process.env` -- so this cannot itself track live
 * config the way `MaterialsService.validateContent` does. It only needs to
 * sit safely above the Joi-validated range for `CHAT_ATTACHMENT_MAX_BYTES`;
 * the service remains the source of truth and the one that returns a domain
 * error code for an ordinary oversized upload.
 */
const MULTER_HARD_CEILING_BYTES = 104_858_624; // 100 MiB + 1 KiB

/**
 * Attachment commands. Upload is storage-and-scan consent only, mirroring
 * `MaterialsController`. Stays thin -- no direct persistence access here,
 * matching the repository's controller-thinness check.
 */
@UseGuards(AccessTokenGuard)
@Controller()
export class ChatAttachmentsController {
  constructor(
    private readonly attachments: ChatAttachmentsService,
    private readonly downloads: ChatAttachmentDownloadService,
  ) {}

  /**
   * A top-level path, not nested under `/assignment-conversations/`, for the
   * same reason as `material-upload-constraints`
   * (`materials.controller.ts`): a route declared as
   * `assignment-conversations/attachment-upload-constraints` would share a
   * path segment with `assignment-conversations/:conversationId`, and that
   * UUID pipe would reject the literal segment before a handler is reached.
   */
  @Get('chat-attachment-upload-constraints')
  getUploadConstraints() {
    return this.attachments.getUploadConstraints();
  }

  @Post('assignment-conversations/:conversationId/attachment-uploads')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MULTER_HARD_CEILING_BYTES } }),
  )
  createUpload(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('conversationId', new ParseUUIDPipe({ version: '4' }))
    conversationId: string,
    @Body() body: CreateAttachmentUploadDto,
    @UploadedFile() file?: UploadedAttachmentFile,
  ) {
    return this.attachments.createUpload({
      actor,
      conversationId,
      idempotencyKey: body.idempotencyKey,
      caption: body.caption,
      file: this.requireFile(file),
    });
  }

  @Post(
    'assignment-conversations/:conversationId/attachments/:attachmentId/download-url',
  )
  createDownloadUrl(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('conversationId', new ParseUUIDPipe({ version: '4' }))
    conversationId: string,
    @Param('attachmentId', new ParseUUIDPipe({ version: '4' }))
    attachmentId: string,
  ) {
    return this.downloads.createDownloadUrl({ actor, conversationId, attachmentId });
  }

  private requireFile(file?: UploadedAttachmentFile): UploadedAttachmentFile {
    if (!file) {
      throw new BadRequestApplicationError(
        'Attachment file is required',
        'CHAT_ATTACHMENT_FILE_REQUIRED',
      );
    }
    return file;
  }
}
