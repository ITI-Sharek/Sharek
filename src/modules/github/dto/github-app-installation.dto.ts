import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class StartGitHubAppInstallationRequest {
  @IsOptional()
  @IsIn(['install_and_authorize', 'authorize_existing_installation'])
  flowType: 'install_and_authorize' | 'authorize_existing_installation' =
    'install_and_authorize';

  @IsOptional()
  @IsUUID()
  installationLinkId?: string;
}

export class CompleteGitHubAppInstallationRequest {
  @IsUUID()
  attemptId!: string;

  @IsString()
  @IsNotEmpty()
  providerInstallationId!: string;
}

export class GitHubAppRepositoriesQueryRequest {
  @IsUUID()
  installationLinkId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perPage = 30;
}

export interface GitHubAppConnectionStartDto {
  installationUrl: string;
  expiresAt: Date;
}

export interface GitHubAppInstallationCandidateDto {
  providerInstallationId: string;
  accountLogin: string;
  accountType: 'user' | 'organization';
}

export interface GitHubAppConnectionAttemptDto {
  attemptId: string;
  expiresAt: Date;
  candidates: GitHubAppInstallationCandidateDto[];
}

export interface GitHubAppInstallationLinkDto {
  installationLinkId: string;
  providerInstallationId: string;
  accountLogin: string;
  accountType: 'user' | 'organization';
  status: 'active' | 'disconnected' | 'reauthorization_required' | 'revoked';
  repositorySelection: 'selected' | 'all';
  installedAt: Date;
  verifiedAt: Date | null;
  manageUrl: string | null;
  repositories: GitHubAppRepositoryDto[];
}

export interface GitHubAppRepositoryDto {
  repositoryId: string;
  fullName: string;
  visibility: string;
  defaultBranch: string | null;
}

export interface GitHubAppRepositoryPageDto {
  items: GitHubAppRepositoryDto[];
  page: number;
  perPage: number;
  hasNextPage: boolean;
  verifiedAt: Date;
}
