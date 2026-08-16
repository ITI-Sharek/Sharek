import {
  IsBoolean,
  IsInt,
  IsUUID,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateContributorFieldRequest {
  @IsUUID('4')
  categoryId!: string;

  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(50)
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  labelEn!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  labelAr!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}

export class UpdateContributorFieldRequest {
  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  labelEn?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  labelAr?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}

export class CreateContributorFieldCategoryRequest {
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(50)
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  labelEn!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  labelAr!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}

export class UpdateContributorFieldCategoryRequest {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  labelEn?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  labelAr?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}
