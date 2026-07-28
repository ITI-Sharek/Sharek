import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ContributionRequestDifficulty } from '@prisma/client';

const normalizeString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const normalizeTags = ({ value }: { value: unknown }): unknown =>
  Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' ? item.trim() : item))
    : value;

export class ContributionRequestRequirementInputDto {
  @Transform(normalizeString)
  @IsString()
  @Length(2, 500)
  text!: string;
}

export class CreateContributionRequestDto {
  @Transform(normalizeString)
  @IsString()
  @Length(3, 255)
  title!: string;

  @Transform(normalizeString)
  @IsString()
  @Length(10, 5000)
  description!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique((requirement: ContributionRequestRequirementInputDto) =>
    typeof requirement?.text === 'string'
      ? requirement.text.toLocaleLowerCase()
      : requirement,
  )
  @ValidateNested({ each: true })
  @Type(() => ContributionRequestRequirementInputDto)
  requiredRequirements!: ContributionRequestRequirementInputDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique((requirement: ContributionRequestRequirementInputDto) =>
    typeof requirement?.text === 'string'
      ? requirement.text.toLocaleLowerCase()
      : requirement,
  )
  @ValidateNested({ each: true })
  @Type(() => ContributionRequestRequirementInputDto)
  preferredRequirements?: ContributionRequestRequirementInputDto[];

  @IsOptional()
  @Transform(normalizeTags)
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique((tag: string) =>
    typeof tag === 'string' ? tag.toLocaleLowerCase() : tag,
  )
  @IsString({ each: true })
  @Length(1, 50, { each: true })
  technologyTags?: string[];

  @IsISO8601({ strict: true, strictSeparator: true })
  applicationsCloseTime!: string;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  targetCompletionDate?: string | null;

  @IsOptional()
  @IsEnum(ContributionRequestDifficulty)
  difficulty?: ContributionRequestDifficulty | null;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99_999_999.99)
  reward?: number | null;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  rewardCurrency?: string | null;
}

export class UpdateContributionRequestDto {
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(normalizeString)
  @IsString()
  @Length(3, 255)
  title?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(normalizeString)
  @IsString()
  @Length(10, 5000)
  description?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique((requirement: ContributionRequestRequirementInputDto) =>
    typeof requirement?.text === 'string'
      ? requirement.text.toLocaleLowerCase()
      : requirement,
  )
  @ValidateNested({ each: true })
  @Type(() => ContributionRequestRequirementInputDto)
  requiredRequirements?: ContributionRequestRequirementInputDto[];

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique((requirement: ContributionRequestRequirementInputDto) =>
    typeof requirement?.text === 'string'
      ? requirement.text.toLocaleLowerCase()
      : requirement,
  )
  @ValidateNested({ each: true })
  @Type(() => ContributionRequestRequirementInputDto)
  preferredRequirements?: ContributionRequestRequirementInputDto[];

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(normalizeTags)
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique((tag: string) =>
    typeof tag === 'string' ? tag.toLocaleLowerCase() : tag,
  )
  @IsString({ each: true })
  @Length(1, 50, { each: true })
  technologyTags?: string[];

  @ValidateIf((_object, value) => value !== undefined)
  @IsISO8601({ strict: true, strictSeparator: true })
  applicationsCloseTime?: string;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  targetCompletionDate?: string | null;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsEnum(ContributionRequestDifficulty)
  difficulty?: ContributionRequestDifficulty | null;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99_999_999.99)
  reward?: number | null;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  rewardCurrency?: string | null;
}

export class DiscardContributionRequestDto {
  @IsOptional()
  @Transform(normalizeString)
  @IsString()
  @Length(2, 500)
  reason?: string;
}
