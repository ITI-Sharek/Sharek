import { Project } from '@prisma/client';

import { DiscoveredProjectDto } from '../dto/discovered-project.dto';
import { ProjectResponseDto } from '../dto/project-response.dto';

export function toProjectResponseDto(project: Project): ProjectResponseDto {
  return {
    id: project.id,
    ownerId: project.owner_id,
    title: project.title,
    description: project.description,
    githubRepoUrl: project.github_repo_url,
    githubRepoId: project.github_repo_id,
    languages: project.languages,
    tags: project.tags,
    technologies: project.technologies,
    repoStatistics: project.repo_statistics,
    status: project.status,
    readmeContent: project.readme_content,
    category: project.category,
    difficulty: project.difficulty,
    heroImageUrl: project.hero_image_data
      ? `/projects/me/${project.id}/hero-image`
      : null,
    publishedAt: project.published_at,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
  };
}

export function toDiscoveredProjectDto(
  project: Project,
  slug: string,
): DiscoveredProjectDto {
  const technologies = toStringArray(project.technologies);
  const tags = toStringArray(project.tags);
  const languageNames = Object.keys(toStringKeyedObject(project.languages));

  const keywords = dedupeKeywords([
    ...technologies,
    ...tags,
    ...languageNames,
    ...(project.category ? [project.category] : []),
    ...(project.difficulty ? [project.difficulty] : []),
  ]);

  return {
    id: project.id,
    title: project.title,
    slug,
    description: project.description,
    category: project.category,
    difficulty: project.difficulty,
    technologies,
    tags,
    languages: project.languages,
    githubRepoUrl: project.github_repo_url,
    repoStatistics: project.repo_statistics,
    publishedAt: project.published_at,
    discoveryMetadata: {
      source: 'project',
      sourceId: project.id,
      keywords,
      semanticText: buildSemanticText(project, technologies, tags),
    },
  };
}

function buildSemanticText(
  project: Project,
  technologies: string[],
  tags: string[],
): string {
  const segments = [project.title, project.description ?? ''];

  if (technologies.length > 0) {
    segments.push(`Technologies: ${technologies.join(', ')}`);
  }
  if (tags.length > 0) {
    segments.push(`Tags: ${tags.join(', ')}`);
  }
  if (project.category) {
    segments.push(`Category: ${project.category}`);
  }
  if (project.difficulty) {
    segments.push(`Difficulty: ${project.difficulty}`);
  }

  return segments
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .join('. ');
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function toStringKeyedObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function dedupeKeywords(values: string[]): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (normalized.length === 0 || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    keywords.push(normalized);
  }

  return keywords;
}
