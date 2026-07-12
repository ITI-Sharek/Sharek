import { Injectable } from '@nestjs/common';

import {
  GitHubRepositoryCommitSignalsDto,
  GitHubRepositoryContributionActivityDto,
  GitHubRepositoryDto,
  GitHubRepositoryImportSnapshot,
  GitHubRepositoryRecentCommitDto,
} from '../dto/github-repository.dto';
import { DatabaseService } from '../../../../shared/database/database.service';
import { ApplicationError } from '../../../../shared/errors/application.error';
import {
  GitHubApiClient,
  GitHubCommitPayload,
  GitHubContributorStatsPayload,
  GitHubOptionalResult,
  GitHubRepositoryPayload,
  GitHubWeeklyCommitActivityPayload,
} from '../../infrastructure/integrations/github-api.client';
import { GitHubTokenEncryptionService } from '../../infrastructure/security/github-token-encryption.service';

const DEFAULT_SKILL_PROFILING_REPOSITORY_LIMIT = 10;
const MAX_SKILL_PROFILING_REPOSITORY_LIMIT = 30;
const GITHUB_FULL_NAME_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

@Injectable()
export class GitHubRepositoryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly tokenEncryption: GitHubTokenEncryptionService,
    private readonly gitHubApiClient: GitHubApiClient,
  ) {}

  async listRepositories(userId: string): Promise<GitHubRepositoryDto[]> {
    const accessToken = await this.getAccessToken(userId);
    const repositories = await this.gitHubApiClient.listRepositories(accessToken);

    return Promise.all(
      repositories.map(async (repository) => {
        const languages = await this.gitHubApiClient.getRepositoryLanguages(
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
    const normalizedFullName = this.normalizeRepositoryReference(fullName);
    const accessToken = await this.getAccessToken(userId);
    const repository = await this.gitHubApiClient.getRepository(
      accessToken,
      normalizedFullName,
    );

    return this.buildRepositorySnapshot(accessToken, repository);
  }

  async getPublicImportSnapshot(
    repositoryReference: string,
  ): Promise<GitHubRepositoryImportSnapshot> {
    const normalizedFullName =
      this.normalizeRepositoryReference(repositoryReference);
    const repository =
      await this.gitHubApiClient.getPublicRepository(normalizedFullName);

    return this.buildRepositorySnapshot(null, repository);
  }

  async getSkillProfilingEvidence(
    userId: string,
    repositoryLimit = DEFAULT_SKILL_PROFILING_REPOSITORY_LIMIT,
  ): Promise<GitHubRepositoryImportSnapshot[]> {
    const accessToken = await this.getAccessToken(userId);
    const repositories = await this.gitHubApiClient.listRepositories(accessToken);
    const normalizedLimit = Math.max(
      0,
      Math.min(repositoryLimit, MAX_SKILL_PROFILING_REPOSITORY_LIMIT),
    );

    return Promise.all(
      repositories
        .slice(0, normalizedLimit)
        .map((repository) =>
          this.buildRepositorySnapshot(accessToken, repository),
        ),
    );
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

  async getRepositoryReadme(
    userId: string,
    fullName: string,
  ): Promise<string | null> {
    const accessToken = await this.getAccessToken(userId);
    const normalizedFullName = this.normalizeRepositoryReference(fullName);

    return this.gitHubApiClient.getRepositoryReadme(
      accessToken,
      normalizedFullName,
    );
  }

  async getRepositoryDescription(
    userId: string,
    fullName: string,
  ): Promise<string | null> {
    const accessToken = await this.getAccessToken(userId);
    const normalizedFullName = this.normalizeRepositoryReference(fullName);
    const repository = await this.gitHubApiClient.getRepository(
      accessToken,
      normalizedFullName,
    );

    return repository.description ?? null;
  }

  async fetchRepositoryStatistics(
    userId: string,
    fullName: string,
  ): Promise<Record<string, unknown>> {
    const snapshot = await this.getImportSnapshot(userId, fullName);

    return snapshot.repoStatistics;
  }

  async fetchContributionActivity(
    userId: string,
    fullName: string,
  ): Promise<GitHubRepositoryContributionActivityDto> {
    const snapshot = await this.getImportSnapshot(userId, fullName);

    return snapshot.contributionActivity;
  }

  async fetchCommitSignals(
    userId: string,
    fullName: string,
    author?: string,
  ): Promise<GitHubRepositoryCommitSignalsDto> {
    const accessToken = await this.getAccessToken(userId);
    const normalizedFullName = this.normalizeRepositoryReference(fullName);
    const commitSignals = this.toCommitSignals(
      await this.gitHubApiClient.listRecentCommits(
        accessToken,
        normalizedFullName,
      ),
    );

    if (!author) {
      return commitSignals;
    }

    const normalizedAuthor = author.toLowerCase();
    const recentCommits = commitSignals.recentCommits.filter((commit) =>
      commit.authorLogin?.toLowerCase().includes(normalizedAuthor),
    );
    const authoredDates = recentCommits
      .map((commit) => commit.authoredAt)
      .filter((date): date is Date => date !== null);

    return {
      ...commitSignals,
      recentCommitCount: recentCommits.length,
      latestCommitAt: this.getMaxDate(authoredDates),
      oldestCommitAt: this.getMinDate(authoredDates),
      authors: this.getUniqueSortedValues(
        recentCommits.map((commit) => commit.authorLogin),
      ),
      recentCommits,
    };
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

  private async buildRepositorySnapshot(
    accessToken: string | null,
    repository: GitHubRepositoryPayload,
  ): Promise<GitHubRepositoryImportSnapshot> {
    const [
      languages,
      readmeContent,
      contributionStats,
      commitActivity,
      recentCommits,
    ] = await Promise.all([
      this.gitHubApiClient.getRepositoryLanguages(
        accessToken,
        repository.full_name,
      ),
      this.gitHubApiClient.getRepositoryReadme(
        accessToken,
        repository.full_name,
      ),
      this.gitHubApiClient.getRepositoryContributionStats(
        accessToken,
        repository.full_name,
      ),
      this.gitHubApiClient.getRepositoryCommitActivity(
        accessToken,
        repository.full_name,
      ),
      this.gitHubApiClient.listRecentCommits(
        accessToken,
        repository.full_name,
      ),
    ]);
    const repositoryDto = this.toRepositoryDto(repository, languages);
    const contributionActivity = this.toContributionActivity(
      contributionStats,
      commitActivity,
    );
    const commitSignals = this.toCommitSignals(recentCommits);

    return {
      repository: repositoryDto,
      technologies: this.getTechnologies(repositoryDto),
      repoStatistics: this.getRepositoryStatistics(
        repositoryDto,
        contributionActivity,
        commitSignals,
      ),
      readmeContent,
      contributionActivity,
      commitSignals,
    };
  }

  private toContributionActivity(
    contributionStatsResult: GitHubOptionalResult<
      GitHubContributorStatsPayload[]
    >,
    commitActivityResult: GitHubOptionalResult<
      GitHubWeeklyCommitActivityPayload[]
    >,
  ): GitHubRepositoryContributionActivityDto {
    const contributorStats = contributionStatsResult.data ?? [];
    const commitActivity = commitActivityResult.data ?? [];
    const weeklyCommitCounts = commitActivity
      .filter((week) => typeof week.week === 'number')
      .map((week) => ({
        weekStart: new Date(Number(week.week) * 1000),
        commits: week.total ?? 0,
      }));
    const contributors = contributorStats.map((contributor) => {
      const weeks = contributor.weeks ?? [];

      return {
        login: contributor.author?.login ?? null,
        profileUrl: contributor.author?.html_url ?? null,
        commits:
          contributor.total ??
          weeks.reduce((total, week) => total + (week.c ?? 0), 0),
        additions: weeks.reduce(
          (total, week) => total + (week.a ?? 0),
          0,
        ),
        deletions: weeks.reduce(
          (total, week) => total + (week.d ?? 0),
          0,
        ),
      };
    });
    const topContributors = contributors
      .sort((left, right) => right.commits - left.commits)
      .slice(0, 5);
    const lastYearCommitCount = weeklyCommitCounts.reduce(
      (total, week) => total + week.commits,
      0,
    );
    const totalContributorCommits = contributors.reduce(
      (total, contributor) => total + contributor.commits,
      0,
    );

    return {
      totalContributors: contributorStats.length,
      totalCommits: Math.max(totalContributorCommits, lastYearCommitCount),
      lastYearCommitCount,
      weeklyCommitCounts,
      topContributors,
      unavailableReason: this.combineUnavailableReasons([
        contributionStatsResult.unavailableReason,
        commitActivityResult.unavailableReason,
      ]),
    };
  }

  private toCommitSignals(
    recentCommitsResult: GitHubOptionalResult<GitHubCommitPayload[]>,
  ): GitHubRepositoryCommitSignalsDto {
    const recentCommits = (recentCommitsResult.data ?? [])
      .map((commit) => this.toRecentCommitDto(commit))
      .filter((commit) => commit.messageHeadline.length > 0);
    const authoredDates = recentCommits
      .map((commit) => commit.authoredAt)
      .filter((date): date is Date => date !== null);

    return {
      recentCommitCount: recentCommits.length,
      latestCommitAt: this.getMaxDate(authoredDates),
      oldestCommitAt: this.getMinDate(authoredDates),
      authors: this.getUniqueSortedValues(
        recentCommits.map((commit) => commit.authorLogin),
      ),
      recentCommits,
      unavailableReason: recentCommitsResult.unavailableReason,
    };
  }

  private toRecentCommitDto(
    commit: GitHubCommitPayload,
  ): GitHubRepositoryRecentCommitDto {
    return {
      sha: commit.sha,
      htmlUrl: commit.html_url ?? null,
      messageHeadline: this.getMessageHeadline(commit.commit?.message),
      authorLogin:
        commit.author?.login ??
        commit.committer?.login ??
        commit.commit?.author?.name ??
        null,
      authoredAt: this.parseOptionalDate(
        commit.commit?.author?.date ?? commit.commit?.committer?.date,
      ),
    };
  }

  private getMessageHeadline(message: string | undefined): string {
    if (!message) {
      return '';
    }

    return message.split('\n')[0].trim();
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
    contributionActivity: GitHubRepositoryContributionActivityDto,
    commitSignals: GitHubRepositoryCommitSignalsDto,
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
      contributionActivity: {
        totalContributors: contributionActivity.totalContributors,
        totalCommits: contributionActivity.totalCommits,
        lastYearCommitCount: contributionActivity.lastYearCommitCount,
        weeklyCommitCounts: contributionActivity.weeklyCommitCounts.map(
          (week) => ({
            weekStart: week.weekStart.toISOString(),
            commits: week.commits,
          }),
        ),
        topContributors: contributionActivity.topContributors,
        unavailableReason: contributionActivity.unavailableReason,
      },
      commitSignals: {
        recentCommitCount: commitSignals.recentCommitCount,
        latestCommitAt: commitSignals.latestCommitAt?.toISOString() ?? null,
        oldestCommitAt: commitSignals.oldestCommitAt?.toISOString() ?? null,
        authors: commitSignals.authors,
        recentCommits: commitSignals.recentCommits.map((commit) => ({
          ...commit,
          authoredAt: commit.authoredAt?.toISOString() ?? null,
        })),
        unavailableReason: commitSignals.unavailableReason,
      },
    };
  }

  private combineUnavailableReasons(
    reasons: Array<string | null>,
  ): string | null {
    const uniqueReasons = this.getUniqueSortedValues(reasons);

    return uniqueReasons.length > 0 ? uniqueReasons.join(',') : null;
  }

  private getUniqueSortedValues(values: Array<string | null>): string[] {
    return Array.from(
      new Set(values.filter((value): value is string => Boolean(value))),
    ).sort((left, right) => left.localeCompare(right));
  }

  private getMaxDate(values: Date[]): Date | null {
    if (values.length === 0) {
      return null;
    }

    return new Date(Math.max(...values.map((value) => value.getTime())));
  }

  private getMinDate(values: Date[]): Date | null {
    if (values.length === 0) {
      return null;
    }

    return new Date(Math.min(...values.map((value) => value.getTime())));
  }

  private parseOptionalDate(value: string | null | undefined): Date | null {
    if (!value) {
      return null;
    }

    const parsedDate = new Date(value);

    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  }

  private normalizeRepositoryReference(repositoryReference: string): string {
    const trimmedReference = repositoryReference?.trim();

    if (!trimmedReference) {
      throw new ApplicationError(
        'GitHub repository reference is required',
        'GITHUB_REPOSITORY_REFERENCE_REQUIRED',
      );
    }

    const fullName = this.extractFullName(trimmedReference);

    if (!GITHUB_FULL_NAME_PATTERN.test(fullName)) {
      throw new ApplicationError(
        'GitHub repository reference must be owner/repo or a github.com repo URL',
        'GITHUB_REPOSITORY_INVALID_REFERENCE',
      );
    }

    return fullName;
  }

  private extractFullName(repositoryReference: string): string {
    if (repositoryReference.includes('://')) {
      try {
        const url = new URL(repositoryReference);
        const hostname = url.hostname.toLowerCase();

        if (hostname !== 'github.com' && hostname !== 'www.github.com') {
          return repositoryReference;
        }

        const [owner, repo] = url.pathname.split('/').filter(Boolean);

        if (!owner || !repo) {
          return repositoryReference;
        }

        return `${owner}/${repo.replace(/\.git$/i, '')}`;
      } catch {
        return repositoryReference;
      }
    }

    return repositoryReference.replace(/\.git$/i, '');
  }
}
