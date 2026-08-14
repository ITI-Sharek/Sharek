import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { EligibilityGuidanceStatus } from '@prisma/client';

import { BlockingSkillDto } from '../../eligibility/dto/eligibility.dto';

export class RequestEligibilityGuidanceDto {
  /**
   * The recorded block this guidance is for.
   *
   * Scoped to the evaluation rather than to a Contribution Request, because
   * under a hard block no Application exists and the evaluation is the only
   * durable record of what was demanded and what the contributor held.
   */
  @IsUUID('4')
  eligibilityEvaluationId!: string;
}

export class ListEligibilityGuidanceDto {
  /** Opaque, base64url. Tampering is a 400, never a silent first page. */
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? value : Number(value)))
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export interface EligibilityGuidanceDto {
  id: string;
  eligibilityEvaluationId: string;
  status: EligibilityGuidanceStatus;
  /**
   * The deterministic reason, always present — including when the narrative
   * failed. A contributor is never told only "you are blocked".
   */
  blockingSkills: BlockingSkillDto[];
  narrative: string | null;
  recommendations: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface EligibilityGuidancePageDto {
  items: EligibilityGuidanceDto[];
  pageInfo: {
    hasNextPage: boolean;
    nextCursor: string | null;
  };
}
