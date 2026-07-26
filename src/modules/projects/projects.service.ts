import { Injectable } from '@nestjs/common';
import {
  ApplicationStatus,
  ContributionRequestStatus,
  Prisma,
  ProjectCategory,
  ProjectDifficulty,
  ProjectStatus,
} from '@prisma/client';

import { GitHubEvidenceService } from '../github/services/github-evidence.service';
import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { DatabaseService } from '../../shared/database/database.service';
import {
  ApplicationError,
  ForbiddenApplicationError,
} from '../../shared/errors/application.error';
import { AdminPublishedProjectOwnerDto } from './dto/admin-published-project-owner.dto';
import { DiscoverProjectsQuery } from './dto/discover-projects.query';
import { DiscoverProjectsResponseDto } from './dto/discovered-project.dto';
import { ImportProjectDto } from './dto/import-project.dto';
import { MyProjectsResponseDto } from './dto/my-projects.dto';
import { ProjectResponseDto } from './dto/project-response.dto';
import {
  toDiscoveredProjectDto,
  toProjectResponseDto,
} from './mappers/project.mapper';

const OWNER_MONTHLY_CONTRIBUTION_REQUEST_LIMIT = 20;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly gitHubEvidenceService: GitHubEvidenceService,
  ) {}

  async getMyProjects(ownerId: string): Promise<MyProjectsResponseDto> {
    const monthStart = this.getCurrentMonthStart();
    const [projects, monthlyRequestCount] = await Promise.all([
      this.database.project.findMany({
        where: {
          owner_id: ownerId,
        },
        orderBy: {
          updated_at: 'desc',
        },
        include: {
          contributionRequests: {
            select: {
              status: true,
              applications: {
                select: {
                  status: true,
                },
              },
            },
          },
        },
      }),
      this.database.contributionRequest.count({
        where: {
          owner_id: ownerId,
          created_at: {
            gte: monthStart,
          },
        },
      }),
    ]);

    return {
      projects: projects.map((project) => ({
        id: project.id,
        title: project.title,
        slug: this.resolveProjectSlug(project.github_repo_url, project.title),
        status: project.status,
        openRequestsCount: project.contributionRequests.filter(
          (request) => request.status === ContributionRequestStatus.published,
        ).length,
        pendingApplicationsCount: project.contributionRequests.reduce(
          (count, request) =>
            count +
            request.applications.filter((application) =>
              this.isPendingOwnerApplication(application.status),
            ).length,
          0,
        ),
        lastActivityLabel: this.formatLastActivityLabel(project.updated_at),
      })),
      quota: {
        used: monthlyRequestCount,
        monthlyLimit: OWNER_MONTHLY_CONTRIBUTION_REQUEST_LIMIT,
      },
    };
  }

  async discoverPublishedProjects(
    query: DiscoverProjectsQuery,
  ): Promise<DiscoverProjectsResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 12;
    const technologies = query.technologies ?? [];
    const category = query.category ?? null;
    const difficulty = query.difficulty ?? null;
    const search = query.search?.trim() || null;

    const where = this.buildDiscoveryWhere({
      technologies,
      category,
      difficulty,
      search,
    });

    const [total, projects] = await Promise.all([
      this.database.project.count({ where }),
      this.database.project.findMany({
        where,
        orderBy: [{ published_at: 'desc' }, { created_at: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      projects: projects.map((project) =>
        toDiscoveredProjectDto(
          project,
          this.resolveProjectSlug(project.github_repo_url, project.title),
        ),
      ),
      pagination: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
      appliedFilters: {
        technologies,
        category,
        difficulty,
        search,
      },
    };
  }

  private buildDiscoveryWhere(filters: {
    technologies: string[];
    category: ProjectCategory | null;
    difficulty: ProjectDifficulty | null;
    search: string | null;
  }): Prisma.ProjectWhereInput {
    // Contributor discovery is limited to published projects; drafts and
    // archived projects must never appear in the discovery feed.
    const conditions: Prisma.ProjectWhereInput[] = [
      { status: ProjectStatus.published },
    ];

    if (filters.category) {
      conditions.push({ category: filters.category });
    }

    if (filters.difficulty) {
      conditions.push({ difficulty: filters.difficulty });
    }

    if (filters.technologies.length > 0) {
      // A project matches when its technology stack contains any of the
      // requested technologies.
      conditions.push({
        OR: filters.technologies.map((technology) => ({
          technologies: { array_contains: [technology] },
        })),
      });
    }

    if (filters.search) {
      conditions.push({
        OR: [
          { title: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
        ],
      });
    }

    return { AND: conditions };
  }

  async listPublishedProjectOwners(
    admin: AuthenticatedUser,
    limit = 10,
  ): Promise<AdminPublishedProjectOwnerDto[]> {
    this.assertActiveAdmin(admin);
    const ownerGroups = await this.database.project.groupBy({
      by: ['owner_id'],
      where: { status: ProjectStatus.published },
      _count: { _all: true },
      _max: { published_at: true },
      orderBy: { _max: { published_at: 'desc' } },
      take: limit,
    });

    const owners = await Promise.all(
      ownerGroups.map(async (group) => {
        const latestProject = await this.database.project.findFirst({
          where: {
            owner_id: group.owner_id,
            status: ProjectStatus.published,
          },
          orderBy: { published_at: 'desc' },
          select: {
            id: true,
            title: true,
            github_repo_url: true,
            owner: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
              },
            },
          },
        });
        if (!latestProject) return null;

        return {
          ownerId: latestProject.owner.id,
          ownerName:
            `${latestProject.owner.first_name} ${latestProject.owner.last_name}`.trim(),
          ownerEmail: latestProject.owner.email,
          publishedProjectsCount: group._count._all,
          latestPublishedAt: group._max.published_at,
          latestProject: {
            id: latestProject.id,
            title: latestProject.title,
            githubRepoUrl: latestProject.github_repo_url,
          },
        } satisfies AdminPublishedProjectOwnerDto;
      }),
    );

    return owners.filter(
      (owner): owner is AdminPublishedProjectOwnerDto => owner !== null,
    );
  }

  async importFromGitHub(
    ownerId: string,
    input: ImportProjectDto,
  ): Promise<ProjectResponseDto> {
    const repositoryReference = input.repoUrl ?? input.fullName ?? '';
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

    const status = input.status ?? existingProject?.status ?? ProjectStatus.draft;
    const projectMetadata = {
      title: this.resolveTitle(repository.name, input.title),
      description: this.resolveDescription(
        repository.description,
        input.description,
      ),
      github_repo_id: repository.githubRepoId,
      languages: repository.languages,
      tags: this.resolveStringArray(repository.topics, input.tags),
      technologies: this.resolveStringArray(
        snapshot.technologies,
        input.technologies,
      ),
      category: input.category ?? existingProject?.category ?? null,
      difficulty: input.difficulty ?? existingProject?.difficulty ?? null,
      repo_statistics: snapshot.repoStatistics as Prisma.InputJsonObject,
      readme_content: snapshot.readmeContent,
      status,
      published_at: this.resolvePublishedAt(
        status,
        existingProject?.published_at ?? null,
      ),
    };
    this.assertCanSaveProjectStatus(projectMetadata);

    const project = existingProject
      ? await this.database.project.update({
          where: {
            id: existingProject.id,
          },
          data: projectMetadata,
        })
      : await this.database.project.create({
          data: {
            owner_id: ownerId,
            github_repo_url: repository.htmlUrl,
            ...projectMetadata,
          },
        });

    return toProjectResponseDto(project);
  }

  private assertCanSaveProjectStatus(project: {
    status: ProjectStatus;
    category: unknown;
    difficulty: unknown;
  }): void {
    if (
      project.status === ProjectStatus.published &&
      (project.category === null || project.difficulty === null)
    ) {
      throw new ApplicationError(
        'Project category and difficulty are required before publication',
        'PROJECT_PUBLICATION_METADATA_REQUIRED',
        422,
      );
    }
  }

  private assertActiveAdmin(admin: AuthenticatedUser): void {
    if (admin.role !== 'admin' || admin.status !== 'active') {
      throw new ForbiddenApplicationError(
        'Active admin access is required',
        'ADMIN_ACCESS_REQUIRED',
      );
    }
  }

  private resolveTitle(repositoryName: string, reviewedTitle?: string): string {
    const title = reviewedTitle?.trim();

    return title || repositoryName;
  }

  private resolveDescription(
    repositoryDescription: string | null,
    reviewedDescription?: string | null,
  ): string | null {
    if (reviewedDescription === undefined) {
      return repositoryDescription;
    }

    const description = reviewedDescription?.trim();

    return description || null;
  }

  private resolveStringArray(
    repositoryValues: string[],
    reviewedValues?: string[],
  ): string[] {
    const values = reviewedValues ?? repositoryValues;

    return Array.from(
      new Set(
        values
          .map((value) => value.trim())
          .filter((value) => value.length > 0),
      ),
    );
  }

  private resolvePublishedAt(
    status: ProjectStatus,
    existingPublishedAt: Date | null,
  ): Date | null {
    if (status === ProjectStatus.published) {
      return existingPublishedAt ?? new Date();
    }

    if (status === ProjectStatus.draft) {
      return null;
    }

    return existingPublishedAt;
  }

  private isPendingOwnerApplication(status: ApplicationStatus): boolean {
    return (
      status === ApplicationStatus.pending_validation ||
      status === ApplicationStatus.eligible
    );
  }

  private getCurrentMonthStart(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  private resolveProjectSlug(repoUrl: string, title: string): string {
    try {
      const url = new URL(repoUrl);
      const repoName = url.pathname.split('/').filter(Boolean)[1];
      if (repoName) {
        return this.slugify(repoName.replace(/\.git$/i, ''));
      }
    } catch {
      // Fall back to the reviewed title when the stored URL is not parseable.
    }

    return this.slugify(title);
  }

  private slugify(value: string): string {
    const slug = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return slug || 'project';
  }

  private formatLastActivityLabel(updatedAt: Date): string {
    const elapsedMs = Date.now() - updatedAt.getTime();
    if (elapsedMs < 60 * 60 * 1000) {
      return 'اليوم';
    }

    const elapsedDays = Math.floor(elapsedMs / (24 * 60 * 60 * 1000));
    if (elapsedDays <= 0) {
      return 'اليوم';
    }

    if (elapsedDays === 1) {
      return 'منذ يوم';
    }

    if (elapsedDays <= 10) {
      return `منذ ${elapsedDays} أيام`;
    }

    return `منذ ${elapsedDays} يوم`;
  }
}
