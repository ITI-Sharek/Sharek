import { Project } from '@prisma/client';

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
    createdAt: project.created_at,
    updatedAt: project.updated_at,
  };
}
