import { IsString, Length, Matches } from 'class-validator';

export class ImportGitHubProjectRequest {
  @IsString()
  @Length(1, 200)
  @Matches(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
  fullName: string;
}
