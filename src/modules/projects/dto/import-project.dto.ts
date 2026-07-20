import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { ProjectCategory, ProjectDifficulty, ProjectStatus } from '@prisma/client';

export type ImportProjectStatus = Extract<ProjectStatus, 'draft' | 'published'>;

export class ImportProjectDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  @Matches(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
  fullName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  @Matches(/^https?:\/\/(www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?(\.git)?$/)
  repoUrl?: string;

  @IsOptional()
  @IsIn([ProjectStatus.draft, ProjectStatus.published])
  status?: ImportProjectStatus;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  title?: string;

  @IsOptional()
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
  category?: ProjectCategory;

  @IsOptional()
  @IsEnum(ProjectDifficulty)
  difficulty?: ProjectDifficulty;
}
