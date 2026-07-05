import { IsString } from 'class-validator';

export class GitHubOAuthCallbackRequest {
  @IsString()
  code: string;

  @IsString()
  state: string;
}
