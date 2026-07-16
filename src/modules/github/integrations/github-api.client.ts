import { Injectable } from '@nestjs/common';

import { ApplicationError } from '../../../shared/errors/application.error';

const GITHUB_API_URL = 'https://api.github.com';

export interface GitHubRepositoryPayload {
  id: number;
  name: string;
  full_name: string;
  owner?: {
    login?: string;
  };
  description?: string | null;
  html_url: string;
  private: boolean;
  fork: boolean;
  archived: boolean;
  default_branch?: string;
  language?: string | null;
  stargazers_count?: number;
  forks_count?: number;
  open_issues_count?: number;
  watchers_count?: number;
  topics?: string[];
  pushed_at?: string | null;
  updated_at?: string | null;
}

export interface GitHubContributorWeekPayload {
  w?: number;
  a?: number;
  d?: number;
  c?: number;
}

export interface GitHubContributorStatsPayload {
  author?: {
    login?: string;
    html_url?: string;
  } | null;
  total?: number;
  weeks?: GitHubContributorWeekPayload[];
}

export interface GitHubWeeklyCommitActivityPayload {
  week?: number;
  total?: number;
  days?: number[];
}

export interface GitHubCommitPayload {
  sha: string;
  html_url?: string;
  commit?: {
    message?: string;
    author?: {
      name?: string | null;
      date?: string | null;
    } | null;
    committer?: {
      name?: string | null;
      date?: string | null;
    } | null;
  };
  author?: {
    login?: string;
  } | null;
  committer?: {
    login?: string;
  } | null;
}

export interface GitHubOptionalResult<T> {
  data: T | null;
  unavailableReason: string | null;
}

export interface GitHubRepositoryPagePayload {
  repositories: GitHubRepositoryPayload[];
  hasNextPage: boolean;
}

@Injectable()
export class GitHubApiClient {
  async listRepositories(accessToken: string): Promise<GitHubRepositoryPayload[]> {
    const repositories: GitHubRepositoryPayload[] = [];
    let pageNumber = 1;

    while (true) {
      const page = await this.listRepositoryPage(accessToken, {
        page: pageNumber,
        perPage: 100,
      });
      repositories.push(...page.repositories);

      if (!page.hasNextPage) {
        return repositories;
      }

      pageNumber += 1;
    }
  }

  async listRepositoryPage(
    accessToken: string,
    {
      page,
      perPage,
    }: {
      page: number;
      perPage: number;
    },
  ): Promise<GitHubRepositoryPagePayload> {
    const response = await this.fetchGitHubResponse(
      `/user/repos?visibility=all&affiliation=owner,collaborator,organization_member&sort=updated&page=${page}&per_page=${perPage}`,
      accessToken,
    );
    const repositories = (await response.json()) as unknown;

    if (!Array.isArray(repositories)) {
      throw new ApplicationError(
        'GitHub repository list response was invalid',
        'GITHUB_REPOSITORY_LIST_INVALID_RESPONSE',
        502,
      );
    }

    return {
      repositories: repositories as GitHubRepositoryPayload[],
      hasNextPage: this.hasNextLink(response.headers?.get?.('link') ?? null),
    };
  }

  async findRepositoriesByFullNames(
    accessToken: string,
    fullNames: string[],
  ): Promise<GitHubRepositoryPayload[]> {
    const remaining = new Set(fullNames.map((fullName) => fullName.toLowerCase()));
    const matches = new Map<string, GitHubRepositoryPayload>();
    let page = 1;

    while (remaining.size > 0) {
      const repositoryPage = await this.listRepositoryPage(accessToken, {
        page,
        perPage: 100,
      });

      for (const repository of repositoryPage.repositories) {
        const key = repository.full_name.toLowerCase();
        if (remaining.delete(key)) {
          matches.set(key, repository);
        }
      }

      if (!repositoryPage.hasNextPage) {
        break;
      }
      page += 1;
    }

    return fullNames
      .map((fullName) => matches.get(fullName.toLowerCase()))
      .filter((repository): repository is GitHubRepositoryPayload =>
        repository !== undefined,
      );
  }

  getRepository(
    accessToken: string,
    fullName: string,
  ): Promise<GitHubRepositoryPayload> {
    return this.fetchGitHub<GitHubRepositoryPayload>(
      `/repos/${this.encodeFullName(fullName)}`,
      accessToken,
    );
  }

  getPublicRepository(fullName: string): Promise<GitHubRepositoryPayload> {
    return this.fetchGitHub<GitHubRepositoryPayload>(
      `/repos/${this.encodeFullName(fullName)}`,
      null,
    );
  }

  getRepositoryLanguages(
    accessToken: string | null,
    fullName: string,
  ): Promise<Record<string, number>> {
    return this.fetchGitHub<Record<string, number>>(
      `/repos/${this.encodeFullName(fullName)}/languages`,
      accessToken,
    );
  }

  async getRepositoryReadme(
    accessToken: string | null,
    fullName: string,
  ): Promise<string | null> {
    const response = await fetch(
      `${GITHUB_API_URL}/repos/${this.encodeFullName(fullName)}/readme`,
      {
        headers: this.getGitHubHeaders(
          accessToken,
          'application/vnd.github.raw',
        ),
      },
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new ApplicationError(
        'GitHub README fetch failed',
        'GITHUB_README_FETCH_FAILED',
        502,
      );
    }

    return response.text();
  }

  getRepositoryContributionStats(
    accessToken: string | null,
    fullName: string,
  ): Promise<GitHubOptionalResult<GitHubContributorStatsPayload[]>> {
    return this.fetchOptionalGitHub<GitHubContributorStatsPayload[]>(
      `/repos/${this.encodeFullName(fullName)}/stats/contributors`,
      accessToken,
    );
  }

  getRepositoryCommitActivity(
    accessToken: string | null,
    fullName: string,
  ): Promise<GitHubOptionalResult<GitHubWeeklyCommitActivityPayload[]>> {
    return this.fetchOptionalGitHub<GitHubWeeklyCommitActivityPayload[]>(
      `/repos/${this.encodeFullName(fullName)}/stats/commit_activity`,
      accessToken,
    );
  }

  listRecentCommits(
    accessToken: string | null,
    fullName: string,
    perPage = 30,
  ): Promise<GitHubOptionalResult<GitHubCommitPayload[]>> {
    return this.fetchOptionalGitHub<GitHubCommitPayload[]>(
      `/repos/${this.encodeFullName(fullName)}/commits?per_page=${perPage}`,
      accessToken,
    );
  }

  private async fetchGitHub<T>(
    path: string,
    accessToken: string | null,
  ): Promise<T> {
    const response = await this.fetchGitHubResponse(path, accessToken);

    return (await response.json()) as T;
  }

  private async fetchGitHubResponse(
    path: string,
    accessToken: string | null,
  ): Promise<Response> {
    const response = await fetch(`${GITHUB_API_URL}${path}`, {
      headers: this.getGitHubHeaders(accessToken),
    });

    if (!response.ok) {
      throw new ApplicationError(
        'GitHub API request failed',
        'GITHUB_API_REQUEST_FAILED',
        response.status === 404 ? 404 : 502,
      );
    }

    return response;
  }

  private async fetchOptionalGitHub<T>(
    path: string,
    accessToken: string | null,
  ): Promise<GitHubOptionalResult<T>> {
    const response = await fetch(`${GITHUB_API_URL}${path}`, {
      headers: this.getGitHubHeaders(accessToken),
    });

    if (response.status === 202) {
      return {
        data: null,
        unavailableReason: 'github_stats_pending',
      };
    }

    if (response.status === 204) {
      return {
        data: null,
        unavailableReason: 'github_no_content',
      };
    }

    if (response.status === 404) {
      return {
        data: null,
        unavailableReason: 'github_not_found',
      };
    }

    if (response.status === 409) {
      return {
        data: null,
        unavailableReason: 'github_repository_empty_or_unavailable',
      };
    }

    if (!response.ok) {
      return {
        data: null,
        unavailableReason: `github_http_${response.status}`,
      };
    }

    return {
      data: (await response.json()) as T,
      unavailableReason: null,
    };
  }

  private getGitHubHeaders(
    accessToken: string | null,
    accept = 'application/vnd.github+json',
  ): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: accept,
      'X-GitHub-Api-Version': '2022-11-28',
    };

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    return headers;
  }

  private encodeFullName(fullName: string): string {
    return fullName.split('/').map(encodeURIComponent).join('/');
  }

  private hasNextLink(linkHeader: string | null): boolean {
    return linkHeader?.split(',').some((link) => link.includes('rel="next"')) ?? false;
  }
}
