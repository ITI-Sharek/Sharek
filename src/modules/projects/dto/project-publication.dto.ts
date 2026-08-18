import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Matches,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ProjectCategory, ProjectDifficulty, ProjectStatus } from '@prisma/client';

const REPOSITORY_REFERENCE_PATTERN =
  /^(?:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+|https:\/\/(?:www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?\/?$)$/;

export class PreviewProjectSourceDto {
  @IsString()
  @Length(1, 500)
  @Matches(REPOSITORY_REFERENCE_PATTERN)
  repositoryReference!: string;
}

export class ProjectDraftSourceDto {
  @IsIn(['github'])
  provider!: 'github';

  @IsString()
  @Length(1, 500)
  @Matches(REPOSITORY_REFERENCE_PATTERN)
  repositoryReference!: string;

  @IsString()
  @Length(64, 64)
  previewFingerprint!: string;
}

export class ProjectPresentationDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 255)
  title?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  technologies?: string[];

  @IsOptional()
  @IsEnum(ProjectCategory)
  category?: ProjectCategory | null;

  @IsOptional()
  @IsEnum(ProjectDifficulty)
  difficulty?: ProjectDifficulty | null;
}

export class CreateProjectDraftDto {
  @IsObject()
  @ValidateNested()
  @Type(() => ProjectDraftSourceDto)
  source!: ProjectDraftSourceDto;

  @IsObject()
  @ValidateNested()
  @Type(() => ProjectPresentationDto)
  project!: ProjectPresentationDto;
}

export class UpdateProjectDto extends ProjectPresentationDto {
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsIn(['title', 'description', 'tags', 'technologies'], { each: true })
  restoreFromSource?: Array<
    'title' | 'description' | 'tags' | 'technologies'
  >;
}

export class UpdateProjectHeroImageDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRevision!: number;
}

export class RefreshProjectSourceDto {
  @IsInt()
  @Min(1)
  expectedRevision!: number;
}

export class ConfirmProjectTransitionDto extends RefreshProjectSourceDto {
  @IsBoolean()
  @IsIn([true])
  confirm!: true;
}

export class ProjectPageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  q?: string;
}

export function isValidRepositoryReference(value: string): boolean {
  return REPOSITORY_REFERENCE_PATTERN.test(value.trim());
}
