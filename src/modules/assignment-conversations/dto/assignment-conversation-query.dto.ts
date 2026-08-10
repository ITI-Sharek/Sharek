import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { stableValidationMessage } from '../../../shared/validation/application-validation.pipe';

const PAGE_SIZE_ERROR = stableValidationMessage(
  'ASSIGNMENT_CONVERSATION_LIMIT_INVALID',
  'Conversation page size is invalid',
);

export class AssignmentConversationQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: PAGE_SIZE_ERROR })
  @Min(1, { message: PAGE_SIZE_ERROR })
  @Max(100, { message: PAGE_SIZE_ERROR })
  limit?: number;
}

export class AssignmentMessageQueryDto extends AssignmentConversationQueryDto {
  @IsOptional()
  @IsString()
  query?: string;
}
