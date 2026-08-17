import { IsBoolean, IsIn } from 'class-validator';

export class UpdatePrivacyRequest {
  @IsIn(['public', 'members', 'private'])
  profileVisibility!: 'public' | 'members' | 'private';

  @IsBoolean() showEmail!: boolean;
  @IsBoolean() showPhone!: boolean;
  @IsBoolean() showActivity!: boolean;
  @IsBoolean() allowIndexing!: boolean;
}
