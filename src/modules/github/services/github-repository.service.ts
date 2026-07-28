import { Injectable } from '@nestjs/common';

import {
  GitHubRepositoryDto,
  GitHubRepositoryPageDto,
} from '../dto/github-repository.dto';
import {
  GitHubApiClient,
  GitHubRepositoryPayload,
} from '../integrations/github-api.client';
import { GitHubAccountService } from './github-account.service';

const LANGUAGE_FETCH_CONCURRENCY = 8;
const DEFAULT_REPOSITORY_PAGE = 1;
const DEFAULT_REPOSITORY_PER_PAGE = 12;
const MAX_REPOSITORY_PER_PAGE = 50;

@Injectable()
export class GitHubRepositoryService {
  constructor(
    private readonly gitHubAccountService: GitHubAccountService,
    private readonly gitHubApiClient: GitHubApiClient,
  ) {}

  async listRepositories(userId: string): Promise<GitHubRepositoryDto[]> {
    const accessToken = await this.gitHubAccountService.getAccessToken(userId);
    const repositories = await this.gitHubApiClient.listRepositories(accessToken);
    return this.mapRepositoryPayloads(accessToken, repositories);
  }

  async listRepositoryPage(
    userId: string,
    {
      page = DEFAULT_REPOSITORY_PAGE,
      perPage = DEFAULT_REPOSITORY_PER_PAGE,
    }: { page?: number; perPage?: number } = {},
  ): Promise<GitHubRepositoryPageDto> {
    const normalizedPage = Math.max(DEFAULT_REPOSITORY_PAGE, Math.trunc(page));
    const normalizedPerPage = Math.max(
      1,
      Math.min(Math.trunc(perPage), MAX_REPOSITORY_PER_PAGE),
    );
    const accessToken = await this.gitHubAccountService.getAccessToken(userId);
    const repositoryPage = await this.gitHubApiClient.listRepositoryPage(
      accessToken,
      { page: normalizedPage, perPage: normalizedPerPage },
    );

    return {
      items: await this.mapRepositoryPayloads(
        accessToken,
        repositoryPage.repositories,
      ),
      page: normalizedPage,
      perPage: normalizedPerPage,
      hasNextPage: repositoryPage.hasNextPage,
    };
  }

  private mapRepositoryPayloads(
    accessToken: string,
    repositories: GitHubRepositoryPayload[],
  ): Promise<GitHubRepositoryDto[]> {
    return this.mapWithConcurrencyLimit(
      repositories,
      LANGUAGE_FETCH_CONCURRENCY,
      async (repository) => {
        const languages = await this.gitHubApiClient
          .getRepositoryLanguages(accessToken, repository.full_name)
          .catch(() => ({}));
        return this.toRepositoryDto(repository, languages);
      },
    );
  }

  private async mapWithConcurrencyLimit<T, R>(
    items: T[],
    limit: number,
    mapper: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex]);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(limit, items.length) }, () => worker()),
    );
    return results;
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
      ownerId:
        typeof repository.owner?.id === 'number'
          ? String(repository.owner.id)
          : null,
      ownerType: this.normalizeOwnerType(repository.owner?.type),
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

  private normalizeOwnerType(
    ownerType: string | undefined,
  ): 'user' | 'organization' | 'unknown' {
    if (ownerType?.toLowerCase() === 'user') return 'user';
    if (ownerType?.toLowerCase() === 'organization') return 'organization';
    return 'unknown';
  }

  private parseOptionalDate(value: string | null | undefined): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}
