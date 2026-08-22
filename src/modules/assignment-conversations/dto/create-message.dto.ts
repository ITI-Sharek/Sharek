import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

import { stableValidationMessage } from '../../../shared/validation/application-validation.pipe';

export class CreateMessageDto {
  @IsString()
  @Length(8, 128, {
    message: stableValidationMessage(
      'MESSAGE_IDEMPOTENCY_KEY_INVALID',
      'Message idempotency key is invalid',
    ),
  })
  idempotencyKey!: string;

  /**
   * Relaxed from `Length(1, 4000)`: COMMUNICATION.md permits captions on
   * attachments, so an attachment-only message (empty body, one or more
   * `attachmentUploadIds`) is coherent. The "body or attachments required"
   * check moves into the service, where the attachment count is known.
   */
  @IsString({
    message: stableValidationMessage(
      'MESSAGE_BODY_REQUIRED',
      'Message body is required',
    ),
  })
  @Length(0, 4000, {
    message: stableValidationMessage(
      'MESSAGE_TOO_LONG',
      'Message body is too long',
    ),
  })
  body!: string;

  @IsOptional()
  @IsUUID('4')
  @MaxLength(100)
  @Type(() => String)
  replyToMessageId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5, {
    message: stableValidationMessage(
      'CHAT_ATTACHMENT_LIMIT_EXCEEDED',
      'A message may carry at most 5 attachments',
    ),
  })
  @IsUUID('4', { each: true })
  attachmentUploadIds?: string[];
}
