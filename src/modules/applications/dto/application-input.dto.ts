import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

function normalizeOptionalString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class SubmitApplicationDto {
  @IsOptional()
  @Transform(normalizeOptionalString)
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @Length(10, 5000)
  contributionApproach?: string | null;

  @IsInt()
  @Min(1)
  @Max(365)
  proposedDeliveryDurationDays!: number;

  @IsUUID('4')
  idempotencyKey!: string;
}
