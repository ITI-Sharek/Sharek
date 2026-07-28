import { Transform } from 'class-transformer';
import { IsInt, IsString, IsUUID, Length, Max, Min } from 'class-validator';

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
