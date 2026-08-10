import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

import { stableValidationMessage } from '../../../shared/validation/application-validation.pipe';

const FULL_NAME_REQUIRED = stableValidationMessage(
  'GITHUB_REPOSITORY_FULL_NAME_REQUIRED',
  'fullName query parameter is required',
);

export class GitHubRepositoryQueryRequest {
  @IsString({ message: FULL_NAME_REQUIRED })
  @IsNotEmpty({ message: FULL_NAME_REQUIRED })
  @Matches(/\S/, { message: FULL_NAME_REQUIRED })
  fullName!: string;
}

export class GitHubCommitSignalsQueryRequest extends GitHubRepositoryQueryRequest {
  @IsOptional()
  @IsString()
  author?: string;
}
