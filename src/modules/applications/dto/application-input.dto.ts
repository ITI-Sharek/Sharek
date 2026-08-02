import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { stableValidationMessage } from '../../../shared/validation/application-validation.pipe';

function normalizeString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class SubmitApplicationDto {
  @Transform(normalizeString)
  @IsString()
  @Length(10, 5000)
  contributionApproach!: string;

  @IsInt()
  @Min(1)
  @Max(365)
  proposedDeliveryDurationDays!: number;

  @IsUUID('4')
  idempotencyKey!: string;
}

export class DeclineApplicationDto {
  @Transform(normalizeString)
  @IsString()
  @IsNotEmpty({
    message: stableValidationMessage(
      'APPLICATION_DECISION_FEEDBACK_REQUIRED',
      'Owner decision feedback is required when declining an Application',
    ),
  })
  @MaxLength(2000)
  feedback!: string;
}

export class RequestAssessmentDto {
  @IsUUID('4')
  idempotencyKey!: string;
}
