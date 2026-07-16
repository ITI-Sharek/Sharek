import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class SkillProfileGenerationRepositoryRequest {
  @IsString()
  @MaxLength(200)
  @Matches(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
  fullName!: string;
}

export class StartSkillProfileGenerationRequest {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => SkillProfileGenerationRepositoryRequest)
  repositories!: SkillProfileGenerationRepositoryRequest[];
}
