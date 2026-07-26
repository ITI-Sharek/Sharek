import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ProjectCategory, ProjectDifficulty } from '@prisma/client';

function normalizeTechnologyFilter(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [value];

  return Array.from(
    new Set(
      raw
        .flatMap((entry) =>
          typeof entry === 'string' ? entry.split(',') : [],
        )
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),
  );
}

export class DiscoverProjectsQuery {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @Transform(({ value }) => normalizeTechnologyFilter(value))
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  technologies?: string[];

  @IsOptional()
  @IsEnum(ProjectCategory)
  category?: ProjectCategory;

  @IsOptional()
  @IsEnum(ProjectDifficulty)
  difficulty?: ProjectDifficulty;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  search?: string;
}
