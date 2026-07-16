import { Allow, IsString, Length } from 'class-validator';

export class SocialAuthCallbackRequest {
  @IsString()
  @Length(1, 500)
  code: string;

  @IsString()
  @Length(16, 200)
  state: string;


}
