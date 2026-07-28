export interface GitHubRepositoryDto {
  githubRepoId: string;
  fullName: string;
  name: string;
  owner: string;
  ownerId: string | null;
  ownerType: 'user' | 'organization' | 'unknown';
  description: string | null;
  htmlUrl: string;
  private: boolean;
  fork: boolean;
  archived: boolean;
  defaultBranch: string;
  primaryLanguage: string | null;
  languages: Record<string, number>;
  stars: number;
  forks: number;
  openIssues: number;
  watchers: number;
  topics: string[];
  pushedAt: Date | null;
  updatedAt: Date | null;
}

export interface GitHubRepositoryPageDto {
  items: GitHubRepositoryDto[];
  page: number;
  perPage: number;
  hasNextPage: boolean;
}

export interface GitHubRepositoryContributorDto {
  login: string | null;
  profileUrl: string | null;
  commits: number;
  additions: number;
  deletions: number;
}

export interface GitHubRepositoryWeeklyActivityDto {
  weekStart: Date;
  commits: number;
}

export interface GitHubRepositoryContributionActivityDto {
  totalContributors: number;
  totalCommits: number;
  lastYearCommitCount: number;
  weeklyCommitCounts: GitHubRepositoryWeeklyActivityDto[];
  topContributors: GitHubRepositoryContributorDto[];
  unavailableReason: string | null;
}

export interface GitHubRepositoryRecentCommitDto {
  sha: string;
  htmlUrl: string | null;
  messageHeadline: string;
  authorLogin: string | null;
  authoredAt: Date | null;
}

export interface GitHubRepositoryCommitSignalsDto {
  recentCommitCount: number;
  latestCommitAt: Date | null;
  oldestCommitAt: Date | null;
  authors: string[];
  recentCommits: GitHubRepositoryRecentCommitDto[];
  unavailableReason: string | null;
}

export interface GitHubRepositoryAuthorshipDto {
  githubLogin: string;
  repositoryOwned: boolean;
  recentCommitCount: number;
  totalCommits: number;
  additions: number;
  deletions: number;
  contributionDetected: boolean;
  matchedRecentCommitShas: string[];
}

export interface GitHubRepositoryImportSnapshot {
  repository: GitHubRepositoryDto;
  technologies: string[];
  repoStatistics: Record<string, unknown>;
  readmeContent: string | null;
  contributionActivity: GitHubRepositoryContributionActivityDto;
  commitSignals: GitHubRepositoryCommitSignalsDto;
  authorship: GitHubRepositoryAuthorshipDto | null;
  evidenceFailures: string[];
}

export interface GitHubSelectedRepositoryEvidenceFailureDto {
  fullName: string;
  code: string;
}

export interface GitHubSelectedSkillProfilingEvidenceDto {
  snapshots: GitHubRepositoryImportSnapshot[];
  failures: GitHubSelectedRepositoryEvidenceFailureDto[];
}
