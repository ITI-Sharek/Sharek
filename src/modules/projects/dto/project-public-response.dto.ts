import { ProjectCategory, ProjectDifficulty } from '@prisma/client';

export interface PublicProjectDto {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  tags: string[];
  technologies: string[];
  category: ProjectCategory | null;
  difficulty: ProjectDifficulty | null;
  publishedAt: Date;
  owner: PublicProjectOwnerDto | null;
  source:
    | {
        provider: 'github';
        attributionStatus: 'public';
        fullName: string;
      repositoryUrl: string;
      fetchedAt: Date | null;
      statistics: PublicProjectSourceStatisticsDto;
    }
  | { provider: 'github'; attributionStatus: 'withheld' };
}

export interface PublicProjectOwnerDto {
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  publishedProjectsCount: number;
}

/**
 * Deliberately small public projection of the persisted GitHub snapshot.
 * The underlying JSON contains richer provider evidence and must never be
 * spread directly into a public response.
 */
export interface PublicProjectSourceStatisticsDto {
  stars: number;
  forks: number;
  contributors: number | null;
  latestCommitAt: Date | null;
  sourceUpdatedAt: Date | null;
  defaultBranch: string | null;
  recentCommits: Array<{
    sha: string;
    url: string | null;
    message: string;
    author: string | null;
    authoredAt: Date | null;
  }>;
  rootEntries: Array<{
    name: string;
    path: string;
    type: 'file' | 'directory' | 'symlink' | 'submodule' | 'unknown';
    size: number | null;
    url: string | null;
  }>;
  rootEntriesUnavailableReason: string | null;
  treeEntries: Array<{
    path: string;
    type: 'file' | 'directory' | 'submodule' | 'unknown';
    size: number | null;
    url: string;
  }>;
  treeTruncated: boolean;
  treeUnavailableReason: string | null;
}

export interface PublicProjectPageDto {
  items: PublicProjectDto[];
  pageInfo: { nextCursor: string | null; hasNextPage: boolean };
}

/**
 * Public Application-card projection. Deliberately excludes application text,
 * evidence, skill assessment, decision, and other review-only information.
 */
export interface PublicProjectApplicantDto {
  applicationId: string;
  contributionRequest: { id: string; title: string };
  contributor: {
    username: string | null;
    displayName: string;
    avatarUrl: string | null;
  };
  submittedAt: Date;
}

export interface PublicProjectApplicantsDto {
  items: PublicProjectApplicantDto[];
}

export interface PublicProjectSavedStateDto {
  saved: boolean;
}
