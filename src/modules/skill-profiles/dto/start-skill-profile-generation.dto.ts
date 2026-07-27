import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDefined,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class SkillProfileGenerationConsentRequest {
  @IsBoolean()
  accepted!: boolean;

  @IsString()
  @MaxLength(100)
  version!: string;
}

export class StartSkillProfileGenerationRequest {
  @IsUUID()
  installationLinkId!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  repositoryIds!: string[];

  @ValidateNested()
  @IsDefined()
  @Type(() => SkillProfileGenerationConsentRequest)
  consent!: SkillProfileGenerationConsentRequest;
}

export class RetrySkillProfileGenerationRequest {
  @ValidateNested()
  @IsDefined()
  @Type(() => SkillProfileGenerationConsentRequest)
  consent!: SkillProfileGenerationConsentRequest;
}
