import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

import { stableValidationMessage } from '../../../shared/validation/application-validation.pipe';

export class CreateAttachmentUploadDto {
  @IsUUID('4', {
    message: stableValidationMessage(
      'CHAT_ATTACHMENT_IDEMPOTENCY_KEY_INVALID',
      'Attachment upload idempotency key is invalid',
    ),
  })
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  @Length(1, 500, {
    message: stableValidationMessage(
      'CHAT_ATTACHMENT_CAPTION_TOO_LONG',
      'Attachment caption is too long',
    ),
  })
  caption?: string;
}
