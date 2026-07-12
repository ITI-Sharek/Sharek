import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class ImportGitHubProjectRequest {
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
}
