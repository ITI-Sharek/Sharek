import { Injectable } from '@nestjs/common';
import {
  ContributionRequestStatus,
  Prisma,
  ProjectCategory,
  ProjectDifficulty,
  ProjectStatus,
  UserStatus,
} from '@prisma/client';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { DatabaseService } from '../../shared/database/database.service';
import {
  ApplicationError,
  ConflictApplicationError,
  ForbiddenApplicationError,
  NotFoundApplicationError,
} from '../../shared/errors/application.error';
import { ApplicationsService } from '../applications/applications.service';
import { AdminPublishedProjectOwnerDto } from './dto/admin-published-project-owner.dto';
import { ContributionRequestProjectAccessDto } from './dto/contribution-request-project-access.dto';
import { DiscoverProjectsQuery } from './dto/discover-projects.query';
import { DiscoverProjectsResponseDto } from './dto/discovered-project.dto';
import { MyProjectsResponseDto } from './dto/my-projects.dto';
import { ProjectPageQueryDto } from './dto/project-publication.dto';
import { toDiscoveredProjectDto } from './mappers/project.mapper';

const OWNER_MONTHLY_CONTRIBUTION_REQUEST_LIMIT = 20;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly applications: ApplicationsService,
  ) {}

  async getMyProjectsForActor(
    actor: AuthenticatedUser,
    query: ProjectPageQueryDto = {},
  ): Promise<MyProjectsResponseDto> {
    if (
      actor.status !== UserStatus.active ||
      (actor.role !== 'owner' && actor.role !== 'contributor')
    ) {
      throw new ForbiddenApplicationError(
        'An active owner or contributor account is required',
        'PROJECT_ACCOUNT_NOT_ELIGIBLE',
      );
    }
    return this.getMyProjects(actor.id, query);
  }

  async getMyProjects(
    ownerId: string,
    query: ProjectPageQueryDto = {},
  ): Promise<MyProjectsResponseDto> {
    const monthStart = this.getCurrentMonthStart();
    const limit = query.limit ?? 20;
    const cursor = query.cursor ? this.decodeOwnerCursor(query.cursor) : null;
    const [projects, monthlyRequestCount] = await Promise.all([
      this.database.project.findMany({
        where: {
          owner_id: ownerId,
          ...(cursor
            ? {
                OR: [
                  { updated_at: { lt: cursor.updatedAt } },
                  { updated_at: cursor.updatedAt, id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        include: {
          contributionRequests: {
            select: {
              status: true,
              id: true,
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

    const hasNextPage = projects.length > limit;
    const ownerProjects = projects.slice(0, limit);
    const applicationSummary = await this.applications.summarizePendingByContributionRequests(
      {
        requestScopes: ownerProjects.map((project) => ({
          projectId: project.id,
          contributionRequestIds: project.contributionRequests.map(
            (request) => request.id,
          ),
        })),
      },
    );
    const pendingApplicationsByProjectId = new Map(
      applicationSummary.projects.map((summary) => [
        summary.projectId,
        summary.pendingApplicationCount,
      ]),
    );
    const last = ownerProjects.at(-1);
    return {
      projects: ownerProjects.map((project) => ({
        id: project.id,
        title: project.title,
        slug: project.slug,
        status: project.status,
        revision: project.revision,
        openRequestsCount: project.contributionRequests.filter(
          (request) => request.status === ContributionRequestStatus.published,
        ).length,
        pendingApplicationsCount:
          pendingApplicationsByProjectId.get(project.id) ?? 0,
        lastActivityLabel: this.formatLastActivityLabel(project.updated_at),
      })),
      quota: {
        used: monthlyRequestCount,
        monthlyLimit: OWNER_MONTHLY_CONTRIBUTION_REQUEST_LIMIT,
      },
      pageInfo: {
        hasNextPage,
        nextCursor:
          hasNextPage && last
            ? Buffer.from(
                JSON.stringify({
                  updatedAt: last.updated_at.toISOString(),
                  id: last.id,
                }),
              ).toString('base64url')
            : null,
      },
    };
  }

  async getContributionRequestProjectAccess(
    projectId: string,
    ownerId: string,
  ): Promise<ContributionRequestProjectAccessDto> {
    const project = await this.database.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        owner_id: true,
        status: true,
      },
    });

    // Missing projects and projects owned by somebody else intentionally share
    // one audience-safe result so this capability cannot enumerate ownership.
    if (!project || project.owner_id !== ownerId) {
      throw new NotFoundApplicationError(
        'Project was not found',
        'CONTRIBUTION_REQUEST_PROJECT_NOT_FOUND',
      );
    }

    if (project.status !== ProjectStatus.published) {
      throw new ConflictApplicationError(
        'Contribution Requests require a published Project',
        'CONTRIBUTION_REQUEST_PROJECT_NOT_PUBLISHED',
      );
    }

    return {
      id: project.id,
      ownerId: project.owner_id,
      status: project.status,
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
          project.slug,
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

  rejectRetiredImportRoute(): never {
    throw new ApplicationError(
      'The combined GitHub import route has been retired',
      'PROJECT_IMPORT_ROUTE_RETIRED',
      410,
      {
        preview: 'POST /projects/github/preview',
        createDraft: 'POST /projects',
      },
    );
  }

  private assertActiveAdmin(admin: AuthenticatedUser): void {
    if (admin.role !== 'admin' || admin.status !== 'active') {
      throw new ForbiddenApplicationError(
        'Active admin access is required',
        'ADMIN_ACCESS_REQUIRED',
      );
    }
  }
  private getCurrentMonthStart(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  private decodeOwnerCursor(cursor: string): { updatedAt: Date; id: string } {
    try {
      const parsed = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      ) as { updatedAt?: unknown; id?: unknown };
      const updatedAt = new Date(String(parsed.updatedAt));
      if (
        typeof parsed.id !== 'string' ||
        parsed.id.length === 0 ||
        Number.isNaN(updatedAt.getTime())
      ) {
        throw new Error('invalid cursor');
      }
      return { updatedAt, id: parsed.id };
    } catch {
      throw new ApplicationError(
        'Project cursor is invalid',
        'PROJECT_REQUEST_INVALID',
        400,
      );
    }
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
