import { ChatAttachmentScanStatus } from '@prisma/client';

import { CHAT_ATTACHMENT_SCAN_ABANDONED_ERROR_CODE } from './chat-attachment.constants';
import {
  ChatAttachmentScanStateDto,
  ChatAttachmentSummaryDto,
  ChatAttachmentUploadResponseDto,
} from './dto/chat-attachment-response.dto';

/**
 * Public presentation surface for `ChatAttachment`, at module root rather
 * than under `services/` -- `assignment-conversations` embeds attachments on
 * a Message and needs `toAttachmentSummaryDto` too, and
 * `check-architecture.mjs::checkCrossModuleImports` forbids a cross-module
 * import reaching into an internal subdirectory like `services/`.
 */

/**
 * The one place a DB `scan_status` becomes what the client is told. Every
 * caller -- the upload response, the message DTO, the realtime event -- goes
 * through this function, so the three can never quietly disagree.
 */
export function toAttachmentScanState(
  scanStatus: ChatAttachmentScanStatus,
  scanErrorCode: string | null,
): ChatAttachmentScanStateDto {
  if (scanStatus === ChatAttachmentScanStatus.ready) return 'ready';
  if (scanStatus === ChatAttachmentScanStatus.rejected) return 'blocked';
  if (
    scanStatus === ChatAttachmentScanStatus.quarantined &&
    scanErrorCode === CHAT_ATTACHMENT_SCAN_ABANDONED_ERROR_CODE
  ) {
    return 'unavailable';
  }
  // Covers `quarantined` (not yet claimed) and `scanning` (in progress) --
  // the client has no download affordance to offer for either.
  return 'scanning';
}

export type ChatAttachmentUploadRecord = {
  id: string;
  original_filename: string;
  byte_size: number;
  mime_type: string;
  scan_status: ChatAttachmentScanStatus;
  scan_error_code: string | null;
  expires_at: Date;
};

export function toAttachmentUploadResponseDto(
  attachment: ChatAttachmentUploadRecord,
): ChatAttachmentUploadResponseDto {
  return {
    uploadId: attachment.id,
    filename: attachment.original_filename,
    byteSize: attachment.byte_size,
    mimeType: attachment.mime_type,
    scanState: toAttachmentScanState(
      attachment.scan_status,
      attachment.scan_error_code,
    ),
    expiresAt: attachment.expires_at,
  };
}

export type BoundChatAttachmentRecord = {
  id: string;
  original_filename: string;
  byte_size: number;
  mime_type: string;
  caption: string | null;
  scan_status: ChatAttachmentScanStatus;
  scan_error_code: string | null;
  event_version: number;
};

export function toAttachmentSummaryDto(
  attachment: BoundChatAttachmentRecord,
): ChatAttachmentSummaryDto {
  return {
    attachmentId: attachment.id,
    filename: attachment.original_filename,
    byteSize: attachment.byte_size,
    mimeType: attachment.mime_type,
    caption: attachment.caption,
    scanState: toAttachmentScanState(
      attachment.scan_status,
      attachment.scan_error_code,
    ),
    eventVersion: attachment.event_version,
  };
}
