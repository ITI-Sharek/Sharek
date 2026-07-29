import { Transform } from 'class-transformer';
import { IsEnum, IsString, Length } from 'class-validator';
import { ReportReason } from '@prisma/client';

function normalizeString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateDecisionFeedbackReportRequest {
  @IsEnum(ReportReason)
  reason!: ReportReason;

  @Transform(normalizeString)
  @IsString()
  @Length(10, 2000)
  description!: string;
}
