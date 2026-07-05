export interface GitHubRepositoryDto {
  githubRepoId: string;
  fullName: string;
  name: string;
  owner: string;
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

export interface GitHubRepositoryImportSnapshot {
  repository: GitHubRepositoryDto;
  technologies: string[];
  repoStatistics: Record<string, unknown>;
  readmeContent: string | null;
}
