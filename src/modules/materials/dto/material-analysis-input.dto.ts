import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MaterialAnalysisVersionSelectionDto {
  @IsUUID('4')
  materialId!: string;

  @IsInt()
  @Min(1)
  version!: number;
}

export class CreateMaterialAnalysisSetDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => MaterialAnalysisVersionSelectionDto)
  materialVersions!: MaterialAnalysisVersionSelectionDto[];
}

export type MaterialAnalysisSuggestionReview = 'ACCEPTED' | 'REJECTED';

export class AdoptProjectSuggestionDto {
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @Length(8, 128)
  idempotencyKey!: string;
}

export class AdoptContributionRequestSuggestionDto {
  @IsISO8601({ strict: true, strictSeparator: true })
  applicationsCloseTime!: string;

  @IsOptional()
  @IsDateString({ strict: true })
  targetCompletionDate?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  rewardCents?: number | null;

  @IsOptional()
  @Length(3, 3)
  rewardCurrency?: string | null;

  @Length(8, 128)
  idempotencyKey!: string;
}
