import { ProjectCategory, ProjectDifficulty } from '@prisma/client';

/**
 * Structured metadata surfaced for semantic discovery. It mirrors the published
 * project fields indexed into the RAG store (see TASK-2-05) and carries source
 * attribution so semantic matches remain retrievable back to the project.
 */
export interface ProjectDiscoveryMetadataDto {
  source: 'project';
  sourceId: string;
  keywords: string[];
  semanticText: string;
}

export interface DiscoveredProjectDto {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  category: ProjectCategory | null;
  difficulty: ProjectDifficulty | null;
  technologies: string[];
  tags: string[];
  languages: unknown;
  githubRepoUrl: string;
  repoStatistics: unknown;
  publishedAt: Date | null;
  priorityVisibility: boolean;
  discoveryMetadata: ProjectDiscoveryMetadataDto;
}

export interface DiscoverProjectsAppliedFiltersDto {
  technologies: string[];
  category: ProjectCategory | null;
  difficulty: ProjectDifficulty | null;
  search: string | null;
}

export interface DiscoverProjectsPaginationDto {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface DiscoverProjectsResponseDto {
  projects: DiscoveredProjectDto[];
  pagination: DiscoverProjectsPaginationDto;
  appliedFilters: DiscoverProjectsAppliedFiltersDto;
}
