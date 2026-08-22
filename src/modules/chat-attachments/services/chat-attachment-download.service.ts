import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatAttachmentScanStatus } from '@prisma/client';

import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { DatabaseService } from '../../../shared/database/database.service';
import {
  ApplicationError,
  ForbiddenApplicationError,
  NotFoundApplicationError,
} from '../../../shared/errors/application.error';
import { ObjectStorage } from '../../../shared/storage/object-storage';
import { CHAT_ATTACHMENT_SCAN_ABANDONED_ERROR_CODE } from '../chat-attachment.constants';
import { ChatAttachmentDownloadUrlResponseDto } from '../dto/chat-attachment-response.dto';
import { AssignmentConversationsService } from '../../assignment-conversations/assignment-conversations.service';

/**
 * Mint-on-demand presigned GET, minted only after a live re-authorization.
 *
 * Deliberately not a raw long-lived URL, and not the HMAC streaming
 * indirection `MaterialDownloadTokenService` uses -- direct S3 egress is the
 * point of using S3. The residual risk this accepts is documented, not
 * hand-waved: once minted, the URL bypasses authorization for its TTL. The
 * TTL is kept short (60s default, tighter than the Material token's 300s)
 * specifically to bound that window.
 */
@Injectable()
export class ChatAttachmentDownloadService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly conversations: AssignmentConversationsService,
    private readonly storage: ObjectStorage,
  ) {}

  async createDownloadUrl(input: {
    actor: AuthenticatedUser;
    conversationId: string;
    attachmentId: string;
  }): Promise<ChatAttachmentDownloadUrlResponseDto> {
    // Live participation, re-resolved now -- a revoked participant must lose
    // access to a link they already have, not just to future links.
    await this.conversations.getParticipation(input.actor.id, input.conversationId);
    if (input.actor.status !== 'active') {
      throw new ForbiddenApplicationError(
        'Only an active account may download chat attachments',
        'CHAT_ATTACHMENT_ACCOUNT_NOT_ACTIVE',
      );
    }

    const attachment = await this.database.chatAttachment.findFirst({
      where: { id: input.attachmentId, conversation_id: input.conversationId },
      select: {
        storage_key: true,
        mime_type: true,
        original_filename: true,
        scan_status: true,
        scan_error_code: true,
        purged_at: true,
        message_id: true,
      },
    });
    // Non-leaking: a foreign attachment id, an unbound intent, and a purged
    // row all read the same as "not found".
    if (!attachment || attachment.purged_at || !attachment.message_id) {
      throw new NotFoundApplicationError(
        'Attachment was not found',
        'CHAT_ATTACHMENT_NOT_FOUND',
      );
    }

    this.assertDownloadable(attachment.scan_status, attachment.scan_error_code);

    const ttlSeconds = this.config.get<number>(
      'CHAT_ATTACHMENT_DOWNLOAD_URL_TTL_SECONDS',
      60,
    );
    const inline = attachment.mime_type.startsWith('image/');
    const disposition = this.buildContentDisposition(
      inline ? 'inline' : 'attachment',
      attachment.original_filename,
    );
    const presigned = await this.storage.createPresignedGetUrl(attachment.storage_key, {
      expiresInSeconds: ttlSeconds,
      responseContentDisposition: disposition,
      // From the sniffed mime, never the declared one -- so the bucket origin
      // can never be made to serve a payload as `text/html`.
      responseContentType: attachment.mime_type,
    });

    return {
      url: presigned.url,
      expiresAt: presigned.expiresAt,
      disposition: inline ? 'inline' : 'attachment',
    };
  }

  private assertDownloadable(
    scanStatus: ChatAttachmentScanStatus,
    scanErrorCode: string | null,
  ): void {
    if (scanStatus === ChatAttachmentScanStatus.ready) return;
    if (scanStatus === ChatAttachmentScanStatus.rejected) {
      throw new ApplicationError(
        'This attachment was blocked and cannot be downloaded',
        'CHAT_ATTACHMENT_BLOCKED',
        403,
      );
    }
    if (
      scanStatus === ChatAttachmentScanStatus.quarantined &&
      scanErrorCode === CHAT_ATTACHMENT_SCAN_ABANDONED_ERROR_CODE
    ) {
      throw new ApplicationError(
        'This attachment could not be scanned and is unavailable',
        'CHAT_ATTACHMENT_SCAN_UNAVAILABLE',
        409,
      );
    }
    throw new ApplicationError(
      'This attachment has not finished scanning yet',
      'CHAT_ATTACHMENT_SCAN_PENDING',
      409,
    );
  }

  private buildContentDisposition(
    kind: 'inline' | 'attachment',
    filename: string,
  ): string {
    const encoded = encodeURIComponent(filename);
    return `${kind}; filename*=UTF-8''${encoded}`;
  }
}
