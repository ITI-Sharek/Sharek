import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

function normalizeString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class SubmitContributionProposalDto {
  @IsUUID('4')
  projectId!: string;

  @Transform(normalizeString)
  @IsString()
  @Length(5, 255)
  title!: string;

  @Transform(normalizeString)
  @IsString()
  @Length(20, 5000)
  body!: string;

  // The contributor must acknowledge the attribution-and-assignment disclosure:
  // accepted proposals grant attribution but never an Assignment or selection
  // priority.
  @Equals(true)
  acknowledgesAttributionAndAssignmentDisclosure!: true;

  @IsUUID('4')
  idempotencyKey!: string;
}

export class SubmitProposalVersionDto {
  @Transform(normalizeString)
  @IsString()
  @Length(5, 255)
  title!: string;

  @Transform(normalizeString)
  @IsString()
  @Length(20, 5000)
  body!: string;

  @IsUUID('4')
  idempotencyKey!: string;
}

export class RequestProposalRevisionDto {
  @Transform(normalizeString)
  @IsString()
  @Length(5, 500)
  reason!: string;

  @IsUUID('4')
  idempotencyKey!: string;
}

export class SetProposalIntakeDto {
  @IsBoolean()
  enabled!: boolean;
}
