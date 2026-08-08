import {
  GitHubAppInstallation,
  GitHubAppInstallationLink,
  GitHubAppRepository,
} from '@prisma/client';

import {
  GitHubAppInstallationLinkDto,
  GitHubAppRepositoryDto,
} from '../dto/github-app-installation.dto';

export interface GitHubAppUserPayload {
  id: number;
  login: string;
}

export interface GitHubAppInstallationPayload {
  id: number;
  app_id: number;
  account: { id: number; login: string; type: string };
  repository_selection: string;
  permissions: Record<string, string>;
  suspended_at?: string | null;
  created_at: string;
}

export interface GitHubAppRepositoryPayload {
  id: number;
  full_name: string;
  private: boolean;
  visibility?: string;
  default_branch?: string | null;
}

export interface GitHubAppUserTokenPayload {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_token_expires_in: number;
  scope?: string;
}

export interface GitHubAppInstallationTokenPayload {
  token: string;
  expires_at: string;
}

export function toGitHubAppInstallationLinkDto(
  link: GitHubAppInstallationLink & {
    installation: GitHubAppInstallation & {
      repositories?: GitHubAppRepository[];
    };
  },
  appSlug?: string,
): GitHubAppInstallationLinkDto {
  return {
    installationLinkId: link.id,
    providerInstallationId: link.installation.installation_id,
    accountLogin: link.installation.account_login,
    accountType: link.installation.account_type,
    status: link.status,
    repositorySelection: link.installation.repository_selection,
    installedAt: link.installation.installed_at,
    verifiedAt: link.last_verified_at,
    manageUrl: appSlug
      ? `https://github.com/settings/installations/${encodeURIComponent(link.installation.installation_id)}`
      : null,
    repositories: (link.installation.repositories ?? []).map(
      toGitHubAppRepositoryDto,
    ),
  };
}

export function toGitHubAppRepositoryDto(
  repository: GitHubAppRepository,
): GitHubAppRepositoryDto {
  return {
    repositoryId: repository.github_repository_id,
    fullName: repository.full_name,
    visibility: repository.visibility,
    defaultBranch: repository.default_branch,
  };
}
