import { Type } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

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

  @IsString({
    message: stableValidationMessage(
      'MESSAGE_BODY_REQUIRED',
      'Message body is required',
    ),
  })
  @Length(1, 4000, {
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
}
