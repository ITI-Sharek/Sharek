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

import { PublicContributionRequestSkillRequirementDto } from './contribution-request-skill-requirement.dto';

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
  technologyFacets: ContributionRequestTechnologyFacetDto[];
}

export interface PublicContributionRequestRequirementDto {
  id: string;
  text: string;
  classification: 'required' | 'preferred';
}

export interface ContributionRequestTechnologyFacetDto {
  technology: string;
  /**
   * How many actionable Requests carry this tag. A filter that cannot say how
   * much it will narrow the list makes the reader click to find out, and an
   * empty result then reads as a broken filter rather than an honest zero.
   */
  count: number;
}

export interface PublicContributionRequestAttributionDto {
  contributorId: string;
  contributorName: string;
  contributorUsername: string | null;
}

export interface PublicContributionRequestDetailDto
  extends PublicContributionRequestListItemDto {
  description: string;
  status: 'published';
  requirements: PublicContributionRequestRequirementDto[];
  /**
   * The level bar, frozen at publication (DEC-078). A contributor sees exactly
   * what is demanded of them and nothing about how it was arrived at — no
   * `confidence`, no `source`, no model name.
   */
  skillRequirements: PublicContributionRequestSkillRequirementDto[];
  attribution: PublicContributionRequestAttributionDto | null;
}
