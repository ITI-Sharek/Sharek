import { Injectable } from '@nestjs/common';
import { Prisma, ProjectStatus } from '@prisma/client';

import { GitHubEvidenceService } from '../github/services/github-evidence.service';
import { DatabaseService } from '../../shared/database/database.service';
import { ApplicationError } from '../../shared/errors/application.error';
import { ProjectResponseDto } from './dto/project-response.dto';
import { toProjectResponseDto } from './mappers/project.mapper';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly gitHubEvidenceService: GitHubEvidenceService,
  ) {}

  async importFromGitHub(
    ownerId: string,
    repositoryReference: string,
  ): Promise<ProjectResponseDto> {
    const snapshot =
      await this.gitHubEvidenceService.getPublicImportSnapshot(
        repositoryReference,
      );
    const { repository } = snapshot;

    const existingProject = await this.database.project.findUnique({
      where: {
        github_repo_url: repository.htmlUrl,
      },
    });

    if (existingProject && existingProject.owner_id !== ownerId) {
      throw new ApplicationError(
        'GitHub repository is already imported by another owner',
        'GITHUB_REPOSITORY_ALREADY_IMPORTED',
        409,
      );
    }

    const project = existingProject
      ? await this.database.project.update({
          where: {
            id: existingProject.id,
          },
          data: {
            title: repository.name,
            description: repository.description,
            github_repo_id: repository.githubRepoId,
            languages: repository.languages,
            tags: repository.topics,
            technologies: snapshot.technologies,
            repo_statistics: snapshot.repoStatistics as Prisma.InputJsonObject,
            readme_content: snapshot.readmeContent,
          },
        })
      : await this.database.project.create({
          data: {
            owner_id: ownerId,
            title: repository.name,
            description: repository.description,
            github_repo_url: repository.htmlUrl,
            github_repo_id: repository.githubRepoId,
            languages: repository.languages,
            tags: repository.topics,
            technologies: snapshot.technologies,
            repo_statistics: snapshot.repoStatistics as Prisma.InputJsonObject,
            status: ProjectStatus.draft,
            readme_content: snapshot.readmeContent,
          },
        });

    return toProjectResponseDto(project);
  }
}
