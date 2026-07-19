import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { SkillProfileProficiencyLevel } from '@prisma/client';

export class ListAdminSkillReviewsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class ApproveSkillReviewRequest {
  @IsOptional()
  @IsEnum(SkillProfileProficiencyLevel)
  proficiency?: SkillProfileProficiencyLevel;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class RejectSkillReviewRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  notes!: string;
}

export class AdjustSkillReviewProficiencyRequest {
  @IsEnum(SkillProfileProficiencyLevel)
  proficiency!: SkillProfileProficiencyLevel;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
