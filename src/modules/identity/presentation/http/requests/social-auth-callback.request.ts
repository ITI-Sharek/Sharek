import { Allow, IsString, Length } from 'class-validator';

export class SocialAuthCallbackRequest {
  @IsString()
  @Length(1, 500)
  code: string;

  @IsString()
  @Length(16, 200)
  state: string;

  // Google appends these to its OAuth redirect; accept and ignore them so
  // forbidNonWhitelisted does not reject the callback.
  @Allow()
  iss?: string;

  @Allow()
  scope?: string;

  @Allow()
  authuser?: string;

  @Allow()
  prompt?: string;
}
