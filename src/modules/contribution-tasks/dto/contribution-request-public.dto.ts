import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ContributionRequestDifficulty } from '@prisma/client';

function normalizeTechnologyFilter(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [value];
  return Array.from(
    new Set(
      raw
        .flatMap((entry) =>
          typeof entry === 'string' ? entry.split(',') : [],
        )
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

function normalizeBoolean(value: unknown): unknown {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return value;
}

export class ContributionRequestFeedQueryDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeTechnologyFilter(value))
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  technologies?: string[];

  @IsOptional()
  @Transform(({ value }) => normalizeTechnologyFilter(value))
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  ['technologies[]']?: string[];

  @IsOptional()
  @IsEnum(ContributionRequestDifficulty)
  difficulty?: ContributionRequestDifficulty;

  @IsOptional()
  @Transform(({ value }) => normalizeBoolean(value))
  @IsBoolean()
  hasReward?: boolean;
}

export interface ContributionRequestRewardDto {
  amount: number;
  currency: string;
}

export interface PublicContributionRequestListItemDto {
  id: string;
  projectId: string;
  projectName: string;
  projectSlug: string;
  title: string;
  technologyTags: string[];
  difficulty: ContributionRequestDifficulty | null;
  applicationsCloseAt: Date;
  targetCompletionDate: string | null;
  reward: ContributionRequestRewardDto | null;
}

export interface ContributionRequestFeedResponseDto {
  items: PublicContributionRequestListItemDto[];
  totalCount: number;
  technologyFacets: string[];
}

export interface PublicContributionRequestRequirementDto {
  id: string;
  text: string;
  classification: 'required' | 'preferred';
}

export interface PublicContributionRequestAttributionDto {
  contributorId: string;
  contributorName: string;
}

export interface PublicContributionRequestDetailDto
  extends PublicContributionRequestListItemDto {
  description: string;
  status: 'published';
  requirements: PublicContributionRequestRequirementDto[];
  attribution: PublicContributionRequestAttributionDto | null;
}
