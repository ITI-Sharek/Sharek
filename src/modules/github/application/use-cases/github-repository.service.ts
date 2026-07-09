import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../../shared/database/database.service';
import { ApplicationError } from '../../../../shared/errors/application.error';
import { GitHubTokenEncryptionService } from '../../infrastructure/security/github-token-encryption.service';
import {
  GitHubRepositoryDto,
  GitHubRepositoryImportSnapshot,
} from '../dto/github-repository.dto';

const GITHUB_API_URL = 'https://api.github.com';

interface GitHubRepositoryPayload {
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

@Injectable()
export class GitHubRepositoryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly tokenEncryption: GitHubTokenEncryptionService,
  ) { }

  async listRepositories(userId: string): Promise<GitHubRepositoryDto[]> {
    const accessToken = await this.getAccessToken(userId);
    const repositories = await this.fetchGitHub<GitHubRepositoryPayload[]>(
      '/user/repos?visibility=public&affiliation=owner,collaborator,organization_member&sort=updated&per_page=100',
      accessToken,
    );

    return Promise.all(
      repositories.map(async (repository) => {
        const languages = await this.fetchRepositoryLanguages(
          accessToken,
          repository.full_name,
        );

        return this.toRepositoryDto(repository, languages);
      }),
    );
  }

  async getImportSnapshot(
    userId: string,
    fullName: string,
  ): Promise<GitHubRepositoryImportSnapshot> {
    const normalizedFullName = fullName.trim();
    const accessToken = await this.getAccessToken(userId);
    const repository = await this.fetchGitHub<GitHubRepositoryPayload>(
      `/repos/${encodeURIComponent(normalizedFullName).replace('%2F', '/')}`,
      accessToken,
    );
    const languages = await this.fetchRepositoryLanguages(
      accessToken,
      repository.full_name,
    );
    const readmeContent = await this.fetchRepositoryReadme(
      accessToken,
      repository.full_name,
    );
    const repositoryDto = this.toRepositoryDto(repository, languages);

    return {
      repository: repositoryDto,
      technologies: this.getTechnologies(repositoryDto),
      repoStatistics: this.getRepositoryStatistics(repositoryDto),
      readmeContent,
    };
  }

  async markRepositoryImportPrepared(userId: string): Promise<void> {
    await this.database.gitHubAccount.update({
      where: {
        user_id: userId,
      },
      data: {
        ingestion_status: 'pending',
        last_synced_at: new Date(),
      },
    });
  }

  async getRepositoryReadme(userId: string, fullName: string): Promise<string | null> {
    const normalizedFullName = fullName.trim();
    const accessToken = await this.getAccessToken(userId);
    return this.fetchRepositoryReadme(accessToken, normalizedFullName);
  }

  async getRepositoryDescription(userId: string, fullName: string): Promise<string | null> {
    const normalizedFullName = fullName.trim();
    const accessToken = await this.getAccessToken(userId);
    const repository = await this.fetchGitHub<GitHubRepositoryPayload>(
      `/repos/${encodeURIComponent(normalizedFullName).replace('%2F', '/')}`,
      accessToken,
    );
    return repository.description ?? null;
  }

  async fetchRepositoryStatistics(userId: string, fullName: string): Promise<Record<string, unknown>> {
    const normalizedFullName = fullName.trim();
    const accessToken = await this.getAccessToken(userId);
    const repository = await this.fetchGitHub<GitHubRepositoryPayload>(
      `/repos/${encodeURIComponent(normalizedFullName).replace('%2F', '/')}`,
      accessToken,
    );
    const languages = await this.fetchRepositoryLanguages(
      accessToken,
      repository.full_name,
    );
    const repositoryDto = this.toRepositoryDto(repository, languages);
    return this.getRepositoryStatistics(repositoryDto);
  }

  async fetchContributionActivity(userId: string, fullName: string): Promise<unknown> {
    const normalizedFullName = fullName.trim();
    const accessToken = await this.getAccessToken(userId);
    const rawData = await this.fetchGitHub<any[]>(
      `/repos/${encodeURIComponent(normalizedFullName).replace('%2F', '/')}/stats/contributors`,
      accessToken,
    );

    if (!Array.isArray(rawData)) {
      return rawData;
    }

    return rawData.map((contributor) => ({
      author: {
        username: contributor.author?.login,
        avatarUrl: contributor.author?.avatar_url,
        profileUrl: contributor.author?.html_url,
      },
      totalCommits: contributor.total,
      weeklyActivity: (contributor.weeks || []).map((week: any) => ({
        weekStarting: new Date(week.w * 1000).toISOString(),
        additions: week.a,
        deletions: week.d,
        commits: week.c,
      })),
    }));
  }

  async fetchCommitSignals(userId: string, fullName: string, author?: string): Promise<unknown> {
    const normalizedFullName = fullName.trim();
    const accessToken = await this.getAccessToken(userId);
    let path = `/repos/${encodeURIComponent(normalizedFullName).replace('%2F', '/')}/commits`;
    if (author) {
      path += `?author=${encodeURIComponent(author)}`;
    }
    
    const rawCommits = await this.fetchGitHub<any[]>(
      path,
      accessToken,
    );

    if (!Array.isArray(rawCommits)) {
      return rawCommits;
    }

    return rawCommits.map((commitData) => ({
      sha: commitData.sha,
      message: commitData.commit?.message,
      authorName: commitData.commit?.author?.name || commitData.author?.login,
      date: commitData.commit?.author?.date,
      url: commitData.html_url,
    }));
  }

  private async getAccessToken(userId: string): Promise<string> {
    const account = await this.database.gitHubAccount.findUnique({
      where: {
        user_id: userId,
      },
    });

    if (!account) {
      throw new ApplicationError(
        'GitHub account is not connected',
        'GITHUB_ACCOUNT_NOT_CONNECTED',
        404,
      );
    }

    return this.tokenEncryption.decrypt(account.access_token);
  }

  private async fetchRepositoryLanguages(
    accessToken: string,
    fullName: string,
  ): Promise<Record<string, number>> {
    return this.fetchGitHub<Record<string, number>>(
      `/repos/${encodeURIComponent(fullName).replace('%2F', '/')}/languages`,
      accessToken,
    );
  }

  private async fetchRepositoryReadme(
    accessToken: string,
    fullName: string,
  ): Promise<string | null> {
    const response = await fetch(
      `${GITHUB_API_URL}/repos/${encodeURIComponent(fullName).replace(
        '%2F',
        '/',
      )}/readme`,
      {
        headers: this.getGitHubHeaders(accessToken, 'application/vnd.github.raw'),
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

  private async fetchGitHub<T>(path: string, accessToken: string, retries = 3): Promise<T> {
    const response = await fetch(`${GITHUB_API_URL}${path}`, {
      headers: this.getGitHubHeaders(accessToken),
    });

    if (response.status === 202 && retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return this.fetchGitHub<T>(path, accessToken, retries - 1);
    }

    if (!response.ok) {
      throw new ApplicationError(
        'GitHub API request failed',
        'GITHUB_API_REQUEST_FAILED',
        response.status === 404 ? 404 : 502,
      );
    }

    return (await response.json()) as T;
  }

  private getGitHubHeaders(accessToken: string, accept = 'application/vnd.github+json') {
    return {
      Accept: accept,
      Authorization: `Bearer ${accessToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  private toRepositoryDto(
    repository: GitHubRepositoryPayload,
    languages: Record<string, number>,
  ): GitHubRepositoryDto {
    return {
      githubRepoId: String(repository.id),
      fullName: repository.full_name,
      name: repository.name,
      owner: repository.owner?.login ?? repository.full_name.split('/')[0],
      description: repository.description ?? null,
      htmlUrl: repository.html_url,
      private: repository.private,
      fork: repository.fork,
      archived: repository.archived,
      defaultBranch: repository.default_branch ?? 'main',
      primaryLanguage: repository.language ?? null,
      languages,
      stars: repository.stargazers_count ?? 0,
      forks: repository.forks_count ?? 0,
      openIssues: repository.open_issues_count ?? 0,
      watchers: repository.watchers_count ?? 0,
      topics: repository.topics ?? [],
      pushedAt: this.parseOptionalDate(repository.pushed_at),
      updatedAt: this.parseOptionalDate(repository.updated_at),
    };
  }

  private getTechnologies(repository: GitHubRepositoryDto): string[] {
    return Array.from(
      new Set([
        ...Object.keys(repository.languages),
        ...repository.topics,
        ...(repository.primaryLanguage ? [repository.primaryLanguage] : []),
      ]),
    ).sort((left, right) => left.localeCompare(right));
  }

  private getRepositoryStatistics(
    repository: GitHubRepositoryDto,
  ): Record<string, unknown> {
    return {
      stars: repository.stars,
      forks: repository.forks,
      openIssues: repository.openIssues,
      watchers: repository.watchers,
      fork: repository.fork,
      archived: repository.archived,
      defaultBranch: repository.defaultBranch,
      pushedAt: repository.pushedAt?.toISOString() ?? null,
      updatedAt: repository.updatedAt?.toISOString() ?? null,
    };
  }

  private parseOptionalDate(value: string | null | undefined): Date | null {
    return value ? new Date(value) : null;
  }
}
