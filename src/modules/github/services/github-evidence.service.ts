import { Injectable, Optional } from '@nestjs/common';

import {
  GitHubRepositoryCommitSignalsDto,
  GitHubRepositoryContributionActivityDto,
  GitHubRepositoryDto,
  GitHubFrameworkDetectionEvidence,
  GitHubRepositoryImportSnapshot,
  GitHubRepositoryRecentCommitDto,
  GitHubRepositoryRootEntriesDto,
  GitHubRepositoryTreeDto,
  GitHubSelectedSkillProfilingEvidenceDto,
} from '../dto/github-repository.dto';
import { ApplicationError } from '../../../shared/errors/application.error';
import {
  GitHubApiClient,
  GitHubCommitPayload,
  GitHubContributorStatsPayload,
  GitHubOptionalResult,
  GitHubRepositoryRootEntryPayload,
  GitHubRepositoryTreePayload,
  GitHubRepositoryPayload,
  GitHubWeeklyCommitActivityPayload,
} from '../integrations/github-api.client';
import { GitHubAccountService } from './github-account.service';
import { GitHubAppService } from './github-app.service';
import { GitHubAppApiClient } from '../integrations/github-app-api.client';
import { detectGitHubFrameworks } from '../utils/github-framework-detector';

const DEFAULT_SKILL_PROFILING_REPOSITORY_LIMIT = 10;
const MAX_SKILL_PROFILING_REPOSITORY_LIMIT = 30;
const GITHUB_FULL_NAME_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MAX_SELECTED_SKILL_PROFILING_REPOSITORIES = 10;
const FRAMEWORK_DEPENDENCY_FILES = [
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'requirements.txt',
  'pyproject.toml',
  'Pipfile',
  'poetry.lock',
  'composer.json',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'go.mod',
  'Cargo.toml',
  'Gemfile',
  'pubspec.yaml',
];

@Injectable()
export class GitHubEvidenceService {
  constructor(
    private readonly gitHubAccountService: GitHubAccountService,
    private readonly gitHubApiClient: GitHubApiClient,
    @Optional() private readonly gitHubAppService?: GitHubAppService,
    @Optional() private readonly gitHubAppApiClient?: GitHubAppApiClient,
  ) {}

  async getImportSnapshot(
    userId: string,
    fullName: string,
  ): Promise<GitHubRepositoryImportSnapshot> {
    const normalizedFullName = this.normalizeRepositoryReference(fullName);
    const accessToken = await this.gitHubAccountService.getAccessToken(userId);
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

  async getProjectImportSnapshot(
    userId: string,
    repositoryReference: string,
  ): Promise<GitHubRepositoryImportSnapshot> {
    try {
      return await this.getPublicImportSnapshot(repositoryReference);
    } catch (publicError) {
      if (!this.gitHubAppService || !this.gitHubAppApiClient) {
        throw publicError;
      }
      const selected = await this.gitHubAppService.findSelectedRepositoryAccess(
        userId,
        repositoryReference,
      );
      if (!selected) throw publicError;

      const evidence = await this.getGitHubAppSkillProfilingEvidence(
        userId,
        selected.installationLinkId,
        [selected.repositoryId],
      );
      if (evidence.snapshots.length === 1) return evidence.snapshots[0];
      throw new ApplicationError(
        'GitHub repository source is not available',
        evidence.failures[0]?.code ?? 'GITHUB_SOURCE_NOT_AVAILABLE',
        404,
      );
    }
  }

  async verifySelectedRepositoryControl(
    userId: string,
    repositoryId: string,
  ): Promise<boolean> {
    if (!this.gitHubAppService) return false;
    return this.gitHubAppService.verifySelectedRepositoryControl(
      userId,
      repositoryId,
    );
  }

  async getSkillProfilingEvidence(
    userId: string,
    repositoryLimit = DEFAULT_SKILL_PROFILING_REPOSITORY_LIMIT,
  ): Promise<GitHubRepositoryImportSnapshot[]> {
    const accessToken = await this.gitHubAccountService.getAccessToken(userId);
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

  async getSelectedSkillProfilingEvidence(
    userId: string,
    fullNames: string[],
  ): Promise<GitHubSelectedSkillProfilingEvidenceDto> {
    const selectedFullNames = this.normalizeSelectedRepositoryFullNames(fullNames);
    const accessToken = await this.gitHubAccountService.getAccessToken(userId);
    const githubLogin = await this.gitHubAccountService.getConnectedUsername(userId);
    const repositories = await this.gitHubApiClient.findRepositoriesByFullNames(
      accessToken,
      selectedFullNames,
    );

    if (repositories.length !== selectedFullNames.length) {
      throw new ApplicationError(
        'One or more repositories are not available through the connected GitHub account',
        'GITHUB_REPOSITORY_SELECTION_NOT_ALLOWED',
        403,
      );
    }

    const settledSnapshots = await Promise.allSettled(
      repositories.map((repository) =>
        this.buildRepositorySnapshot(accessToken, repository, githubLogin),
      ),
    );
    const snapshots: GitHubRepositoryImportSnapshot[] = [];
    const failures: GitHubSelectedSkillProfilingEvidenceDto['failures'] = [];

    settledSnapshots.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        snapshots.push(result.value);
        return;
      }

      failures.push({
        fullName: repositories[index].full_name,
        code:
          result.reason instanceof ApplicationError
            ? result.reason.code
            : 'GITHUB_REPOSITORY_EVIDENCE_UNAVAILABLE',
      });
    });

    return { snapshots, failures };
  }

  async getGitHubAppSkillProfilingEvidence(
    userId: string,
    installationLinkId: string,
    repositoryIds: string[],
  ): Promise<GitHubSelectedSkillProfilingEvidenceDto> {
    if (!this.gitHubAppService || !this.gitHubAppApiClient) {
      throw new ApplicationError(
        'GitHub App evidence is unavailable',
        'GITHUB_APP_NOT_CONFIGURED',
        503,
      );
    }
    const authorization = await this.gitHubAppService.verifyRepositorySelection(
      userId,
      installationLinkId,
      repositoryIds,
    );
    const installationCredential =
      await this.gitHubAppApiClient.createInstallationToken(
        authorization.providerInstallationId,
      );
    const settledSnapshots = await Promise.allSettled(
      authorization.repositories.map(async (selected) => {
        const repository = await this.gitHubApiClient.getRepository(
          installationCredential.token,
          selected.fullName,
        );
        if (String(repository.id) !== selected.repositoryId) {
          throw new ApplicationError(
            'GitHub repository identity changed during evidence collection',
            'GITHUB_APP_REPOSITORY_ACCESS_REVOKED',
            403,
          );
        }
        return this.buildRepositorySnapshot(
          installationCredential.token,
          repository,
          authorization.githubLogin,
        );
      }),
    );
    const snapshots: GitHubRepositoryImportSnapshot[] = [];
    const failures: GitHubSelectedSkillProfilingEvidenceDto['failures'] = [];
    settledSnapshots.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        snapshots.push(result.value);
      } else {
        failures.push({
          fullName: authorization.repositories[index].fullName,
          code:
            result.reason instanceof ApplicationError
              ? result.reason.code
              : 'GITHUB_REPOSITORY_EVIDENCE_UNAVAILABLE',
        });
      }
    });
    return { snapshots, failures };
  }

  async getRepositoryReadme(
    userId: string,
    fullName: string,
  ): Promise<string | null> {
    const accessToken = await this.gitHubAccountService.getAccessToken(userId);
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
    const accessToken = await this.gitHubAccountService.getAccessToken(userId);
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
    const accessToken = await this.gitHubAccountService.getAccessToken(userId);
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
      commit.authorLogin?.toLowerCase() === normalizedAuthor,
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

  private normalizeSelectedRepositoryFullNames(fullNames: string[]): string[] {
    const selectedFullNames = this.getUniqueSortedValues(
      fullNames.map((fullName) => this.normalizeRepositoryReference(fullName)),
    );

    if (selectedFullNames.length === 0) {
      throw new ApplicationError(
        'At least one repository must be selected',
        'GITHUB_REPOSITORY_SELECTION_REQUIRED',
        400,
      );
    }

    if (selectedFullNames.length > MAX_SELECTED_SKILL_PROFILING_REPOSITORIES) {
      throw new ApplicationError(
        `Select at most ${MAX_SELECTED_SKILL_PROFILING_REPOSITORIES} repositories`,
        'GITHUB_REPOSITORY_SELECTION_LIMIT_EXCEEDED',
        400,
      );
    }

    return selectedFullNames;
  }

  private async buildRepositorySnapshot(
    accessToken: string | null,
    repository: GitHubRepositoryPayload,
    githubLogin?: string,
  ): Promise<GitHubRepositoryImportSnapshot> {
    const settledEvidence = await Promise.allSettled([
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
      this.gitHubApiClient.listRepositoryRootEntries(
        accessToken,
        repository.full_name,
        repository.default_branch,
      ),
      this.gitHubApiClient.getRepositoryTree(
        accessToken,
        repository.full_name,
        repository.default_branch ?? 'main',
      ),
    ]);
    const evidenceFailures: string[] = [];
    const [
      languages,
      readmeContent,
      contributionStats,
      commitActivity,
      recentCommits,
      rootEntries,
      repositoryTree,
    ] = [
      this.readSettledEvidence(
        settledEvidence[0],
        {},
        'languages_unavailable',
        evidenceFailures,
      ),
      this.readSettledEvidence(
        settledEvidence[1],
        null,
        'readme_unavailable',
        evidenceFailures,
      ),
      this.readSettledEvidence(
        settledEvidence[2],
        { data: null, unavailableReason: 'github_request_failed' },
        'contributor_stats_unavailable',
        evidenceFailures,
      ),
      this.readSettledEvidence(
        settledEvidence[3],
        { data: null, unavailableReason: 'github_request_failed' },
        'commit_activity_unavailable',
        evidenceFailures,
      ),
      this.readSettledEvidence(
        settledEvidence[4],
        { data: null, unavailableReason: 'github_request_failed' },
        'recent_commits_unavailable',
        evidenceFailures,
      ),
      this.readSettledEvidence(
        settledEvidence[5],
        { data: null, unavailableReason: 'github_request_failed' },
        'root_entries_unavailable',
        evidenceFailures,
      ),
      this.readSettledEvidence(
        settledEvidence[6],
        { data: null, unavailableReason: 'github_request_failed' },
        'repository_tree_unavailable',
        evidenceFailures,
      ),
    ];
    const repositoryDto = this.toRepositoryDto(repository, languages);
    const contributionActivity = this.toContributionActivity(
      contributionStats,
      commitActivity,
    );
    const commitSignals = this.toCommitSignals(recentCommits);
    const rootEntriesDto = this.toRootEntries(rootEntries);
    const repositoryTreeDto = this.toRepositoryTree(
      repositoryTree,
      repositoryDto,
    );
    const frameworkDetection = await this.collectFrameworkDetection(
      accessToken,
      repository,
    );
    if (frameworkDetection.status === 'unavailable') {
      evidenceFailures.push('framework_detection_unavailable');
    }

    return {
      repository: repositoryDto,
      technologies: this.getTechnologies(repositoryDto),
      repoStatistics: this.getRepositoryStatistics(
        repositoryDto,
        contributionActivity,
        commitSignals,
        rootEntriesDto,
        repositoryTreeDto,
      ),
      readmeContent,
      contributionActivity,
      commitSignals,
      rootEntries: rootEntriesDto,
      repositoryTree: repositoryTreeDto,
      authorship: githubLogin
        ? this.toRepositoryAuthorship(
            repositoryDto,
            githubLogin,
            contributionStats,
            commitSignals,
          )
        : null,
      evidenceFailures,
      frameworkDetection,
    };
  }

  private async collectFrameworkDetection(
    accessToken: string | null,
    repository: GitHubRepositoryPayload,
  ): Promise<GitHubFrameworkDetectionEvidence> {
    const getRepositoryFile = this.gitHubApiClient.getRepositoryFile;
    if (typeof getRepositoryFile !== 'function') {
      return detectGitHubFrameworks({}, 0);
    }

    const results = await Promise.allSettled(
      FRAMEWORK_DEPENDENCY_FILES.map(async (path) => ({
        path,
        content: await getRepositoryFile.call(
          this.gitHubApiClient,
          accessToken,
          repository.full_name,
          path,
          repository.default_branch,
        ),
      })),
    );
    const dependencyFiles: Record<string, string> = {};
    let unavailableCount = 0;
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.content !== null) {
        dependencyFiles[result.value.path] = result.value.content;
      } else if (result.status === 'rejected') {
        unavailableCount += 1;
      }
    }

    return detectGitHubFrameworks(dependencyFiles, unavailableCount);
  }

  private readSettledEvidence<T>(
    result: PromiseSettledResult<T>,
    fallback: T,
    failureCode: string,
    failures: string[],
  ): T {
    if (result.status === 'fulfilled') {
      return result.value;
    }

    failures.push(failureCode);
    return fallback;
  }

  private toRepositoryAuthorship(
    repository: GitHubRepositoryDto,
    githubLogin: string,
    contributionStats: GitHubOptionalResult<GitHubContributorStatsPayload[]>,
    commitSignals: GitHubRepositoryCommitSignalsDto,
  ) {
    const normalizedLogin = githubLogin.toLowerCase();
    const contributor = (contributionStats.data ?? []).find(
      (candidate) => candidate.author?.login?.toLowerCase() === normalizedLogin,
    );
    const weeks = contributor?.weeks ?? [];
    const recentCommits = commitSignals.recentCommits.filter(
      (commit) => commit.authorLogin?.toLowerCase() === normalizedLogin,
    );
    const totalCommits =
      contributor?.total ??
      weeks.reduce((total, week) => total + (week.c ?? 0), 0);

    return {
      githubLogin,
      repositoryOwned: repository.owner.toLowerCase() === normalizedLogin,
      recentCommitCount: recentCommits.length,
      totalCommits,
      additions: weeks.reduce((total, week) => total + (week.a ?? 0), 0),
      deletions: weeks.reduce((total, week) => total + (week.d ?? 0), 0),
      contributionDetected: totalCommits > 0 || recentCommits.length > 0,
      matchedRecentCommitShas: recentCommits.map((commit) => commit.sha),
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

  private toRootEntries(
    result: GitHubOptionalResult<GitHubRepositoryRootEntryPayload[]>,
  ): GitHubRepositoryRootEntriesDto {
    const entries = Array.isArray(result.data) ? result.data : [];
    return {
      entries: entries
        .filter(
          (entry) =>
            typeof entry.name === 'string' &&
            entry.name.length > 0 &&
            typeof entry.path === 'string' &&
            entry.path.length > 0,
        )
        .slice(0, 100)
        .map((entry) => ({
          name: entry.name as string,
          path: entry.path as string,
          type: this.rootEntryType(entry.type),
          size:
            typeof entry.size === 'number' && entry.size >= 0
              ? Math.floor(entry.size)
              : null,
          url: typeof entry.html_url === 'string' ? entry.html_url : null,
        })),
      unavailableReason: Array.isArray(result.data)
        ? result.unavailableReason
        : (result.unavailableReason ?? 'github_invalid_root_entries_response'),
    };
  }

  private rootEntryType(
    value: unknown,
  ): GitHubRepositoryRootEntriesDto['entries'][number]['type'] {
    if (value === 'file') return 'file';
    if (value === 'dir') return 'directory';
    if (value === 'symlink') return 'symlink';
    if (value === 'submodule') return 'submodule';
    return 'unknown';
  }

  private toRepositoryTree(
    result: GitHubOptionalResult<GitHubRepositoryTreePayload>,
    repository: GitHubRepositoryDto,
  ): GitHubRepositoryTreeDto {
    const tree = result.data;
    const entries = Array.isArray(tree?.tree) ? tree.tree : [];
    return {
      entries: entries
        .filter(
          (entry) =>
            typeof entry.path === 'string' &&
            entry.path.length > 0 &&
            !entry.path.startsWith('/') &&
            !entry.path.includes('..'),
        )
        .slice(0, 500)
        .map((entry) => ({
          path: entry.path as string,
          type: this.treeEntryType(entry.type),
          size:
            typeof entry.size === 'number' && entry.size >= 0
              ? Math.floor(entry.size)
              : null,
          url: this.repositoryTreeEntryUrl(
            repository.htmlUrl,
            repository.defaultBranch,
            entry.path as string,
            entry.type,
          ),
        })),
      truncated: Boolean(tree?.truncated) || entries.length > 500,
      unavailableReason: tree
        ? result.unavailableReason
        : (result.unavailableReason ?? 'github_invalid_repository_tree_response'),
    };
  }

  private treeEntryType(
    value: unknown,
  ): GitHubRepositoryTreeDto['entries'][number]['type'] {
    if (value === 'blob') return 'file';
    if (value === 'tree') return 'directory';
    if (value === 'commit') return 'submodule';
    return 'unknown';
  }

  private repositoryTreeEntryUrl(
    repositoryUrl: string,
    branch: string,
    path: string,
    type: unknown,
  ): string {
    const entryKind = type === 'tree' ? 'tree' : 'blob';
    const encodedPath = path
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    return `${repositoryUrl}/${entryKind}/${encodeURIComponent(branch)}/${encodedPath}`;
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
      authorLogin: commit.author?.login ?? null,
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
    rootEntries: GitHubRepositoryRootEntriesDto,
    repositoryTree: GitHubRepositoryTreeDto,
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
      rootEntries,
      repositoryTree,
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
