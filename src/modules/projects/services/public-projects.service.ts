import { Injectable } from '@nestjs/common';
import {
  ApplicationStatus,
  Prisma,
  ProjectStatus,
  UserStatus,
} from '@prisma/client';

import { DatabaseService } from '../../../shared/database/database.service';
import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import {
  ApplicationError,
  NotFoundApplicationError,
} from '../../../shared/errors/application.error';
import {
  PublicProjectDto,
  PublicProjectApplicantsDto,
  PublicProjectPageDto,
  PublicProjectSavedStateDto,
  PublicProjectSourceStatisticsDto,
} from '../dto/project-public-response.dto';
import { ProjectPageQueryDto } from '../dto/project-publication.dto';

const PUBLIC_PROJECT_SELECT = {
  id: true,
  slug: true,
  title: true,
  description: true,
  tags: true,
  technologies: true,
  category: true,
  difficulty: true,
  published_at: true,
  source_visibility: true,
  source_fetched_at: true,
  source_updated_at: true,
  github_repo_url: true,
  repo_statistics: true,
  hero_image_mime_type: true,
  owner: {
    select: {
      username: true,
      first_name: true,
      last_name: true,
      avatar_url: true,
      status: true,
      profile_visibility: true,
      _count: {
        select: {
          projects: {
            where: {
              status: ProjectStatus.published,
              published_at: { not: null },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ProjectSelect;

type PublicProjectRecord = Prisma.ProjectGetPayload<{
  select: typeof PUBLIC_PROJECT_SELECT;
}>;

@Injectable()
export class PublicProjectsService {
  constructor(private readonly database: DatabaseService) {}

  async list(query: ProjectPageQueryDto): Promise<PublicProjectPageDto> {
    const limit = query.limit ?? 20;
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : null;
    const cursorWhere: Prisma.ProjectWhereInput | undefined = cursor
      ? {
          OR: [
            { published_at: { lt: cursor.publishedAt } },
            {
              published_at: cursor.publishedAt,
              id: { lt: cursor.id },
            },
          ],
        }
      : undefined;
    const projects = await this.database.project.findMany({
      where: {
        status: ProjectStatus.published,
        published_at: { not: null },
        ...(cursorWhere ? { AND: [cursorWhere] } : {}),
      },
      orderBy: [{ published_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: PUBLIC_PROJECT_SELECT,
    });
    const hasNextPage = projects.length > limit;
    const items = projects.slice(0, limit);
    const last = items.at(-1);
    return {
      items: items.map((project) => this.present(project)),
      pageInfo: {
        hasNextPage,
        nextCursor:
          hasNextPage && last?.published_at
            ? this.encodeCursor(last.published_at, last.id)
            : null,
      },
    };
  }

  async getBySlug(projectSlug: string): Promise<PublicProjectDto> {
    const project = await this.database.project.findFirst({
      where: {
        slug_normalized: projectSlug.trim().toLowerCase(),
        status: ProjectStatus.published,
        published_at: { not: null },
      },
      select: PUBLIC_PROJECT_SELECT,
    });
    if (!project) {
      throw new NotFoundApplicationError(
        'Project was not found',
        'PROJECT_NOT_FOUND',
      );
    }
    return this.present(project);
  }

  async getHeroImage(projectSlug: string): Promise<{
    data: Buffer;
    mimeType: string;
    updatedAt: Date;
  }> {
    const project = await this.database.project.findFirst({
      where: {
        slug_normalized: projectSlug.trim().toLowerCase(),
        status: ProjectStatus.published,
        published_at: { not: null },
      },
      select: {
        hero_image_data: true,
        hero_image_mime_type: true,
        updated_at: true,
      },
    });
    if (!project?.hero_image_data || !project.hero_image_mime_type) {
      throw new NotFoundApplicationError(
        'Project hero image was not found',
        'PROJECT_HERO_IMAGE_NOT_FOUND',
      );
    }
    return {
      data: Buffer.from(project.hero_image_data),
      mimeType: project.hero_image_mime_type,
      updatedAt: project.updated_at,
    };
  }

  async listApplicantsByProjectSlug(
    projectSlug: string,
  ): Promise<PublicProjectApplicantsDto> {
    const project = await this.getBySlug(projectSlug);
    const applications = await this.database.application.findMany({
      where: {
        status: {
          in: [
            ApplicationStatus.pending_owner_review,
            ApplicationStatus.accepted,
          ],
        },
        contributionRequest: { project_id: project.id },
        contributor: {
          status: UserStatus.active,
          profile_visibility: 'public',
        },
      },
      select: {
        id: true,
        submitted_at: true,
        contributionRequest: { select: { id: true, title: true } },
        contributor: {
          select: {
            username: true,
            first_name: true,
            last_name: true,
            avatar_url: true,
          },
        },
      },
      orderBy: [{ submitted_at: 'desc' }, { id: 'desc' }],
      take: 50,
    });
    return {
      items: applications.map((application) => ({
        applicationId: application.id,
        contributionRequest: {
          id: application.contributionRequest.id,
          title: application.contributionRequest.title,
        },
        contributor: {
          username: application.contributor.username,
          displayName:
            `${application.contributor.first_name} ${application.contributor.last_name}`.trim() ||
            'Contributor',
          avatarUrl: application.contributor.avatar_url,
        },
        submittedAt: application.submitted_at,
      })),
    };
  }

  async getSavedState(
    actor: AuthenticatedUser,
    projectSlug: string,
  ): Promise<PublicProjectSavedStateDto> {
    const project = await this.getBySlug(projectSlug);
    const savedProject = await this.database.savedProject.findUnique({
      where: {
        user_id_project_id: {
          user_id: actor.id,
          project_id: project.id,
        },
      },
      select: { project_id: true },
    });
    return { saved: savedProject !== null };
  }

  async save(
    actor: AuthenticatedUser,
    projectSlug: string,
  ): Promise<PublicProjectSavedStateDto> {
    const project = await this.getBySlug(projectSlug);
    await this.database.savedProject.upsert({
      where: {
        user_id_project_id: {
          user_id: actor.id,
          project_id: project.id,
        },
      },
      create: { user_id: actor.id, project_id: project.id },
      update: {},
    });
    return { saved: true };
  }

  async unsave(
    actor: AuthenticatedUser,
    projectSlug: string,
  ): Promise<PublicProjectSavedStateDto> {
    const project = await this.getBySlug(projectSlug);
    await this.database.savedProject.deleteMany({
      where: { user_id: actor.id, project_id: project.id },
    });
    return { saved: false };
  }

  private present(project: PublicProjectRecord): PublicProjectDto {
    if (!project.published_at) {
      throw new NotFoundApplicationError(
        'Project was not found',
        'PROJECT_NOT_FOUND',
      );
    }
    const publicAttribution = project.source_visibility !== 'private';
    return {
      id: project.id,
      slug: project.slug,
      title: project.title,
      description: project.description,
      tags: this.stringArray(project.tags),
      technologies: this.stringArray(project.technologies),
      category: project.category,
      difficulty: project.difficulty,
      heroImageUrl: project.hero_image_mime_type
        ? `/public/projects/${encodeURIComponent(project.slug)}/hero-image`
        : null,
      publishedAt: project.published_at,
      owner: this.publicOwner(project),
      source: publicAttribution
        ? {
            provider: 'github',
            attributionStatus: 'public',
            fullName: this.fullName(project.github_repo_url),
            repositoryUrl: project.github_repo_url,
            fetchedAt: project.source_fetched_at,
            statistics: this.publicStatistics(
              project.repo_statistics,
              project.source_updated_at,
            ),
          }
        : { provider: 'github', attributionStatus: 'withheld' },
    };
  }

  private publicOwner(project: PublicProjectRecord): PublicProjectDto['owner'] {
    const owner = project.owner;
    if (
      owner.status !== UserStatus.active ||
      owner.profile_visibility !== 'public'
    ) {
      return null;
    }
    return {
      username: owner.username,
      displayName:
        `${owner.first_name} ${owner.last_name}`.trim() || 'Project owner',
      avatarUrl: owner.avatar_url,
      publishedProjectsCount: owner._count.projects,
    };
  }

  private encodeCursor(publishedAt: Date, id: string): string {
    return Buffer.from(
      JSON.stringify({ publishedAt: publishedAt.toISOString(), id }),
    ).toString('base64url');
  }

  private decodeCursor(cursor: string): { publishedAt: Date; id: string } {
    try {
      const parsed = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      ) as { publishedAt?: unknown; id?: unknown };
      const publishedAt = new Date(String(parsed.publishedAt));
      if (
        typeof parsed.id !== 'string' ||
        parsed.id.length === 0 ||
        Number.isNaN(publishedAt.getTime())
      ) {
        throw new Error('invalid cursor');
      }
      return { publishedAt, id: parsed.id };
    } catch {
      throw new ApplicationError(
        'Project cursor is invalid',
        'PROJECT_REQUEST_INVALID',
        400,
      );
    }
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private fullName(repositoryUrl: string): string {
    try {
      return new URL(repositoryUrl).pathname.replace(/^\//, '').replace(/\.git$/, '');
    } catch {
      return repositoryUrl;
    }
  }

  private publicStatistics(
    value: unknown,
    sourceUpdatedAt: Date | null,
  ): PublicProjectSourceStatisticsDto {
    const record = this.record(value);
    const activity = this.record(record.contributionActivity);
    const commitSignals = this.record(record.commitSignals);
    const repositoryTree = this.record(record.repositoryTree);
    return {
      stars: this.nonNegativeInteger(record.stars),
      forks: this.nonNegativeInteger(record.forks),
      contributors:
        activity.totalContributors === undefined
          ? null
          : this.nonNegativeInteger(activity.totalContributors),
      latestCommitAt: this.date(commitSignals.latestCommitAt),
      sourceUpdatedAt,
      defaultBranch: this.string(record.defaultBranch),
      recentCommits: this.array(commitSignals.recentCommits)
        .map((commit) => this.record(commit))
        .filter((commit) => this.string(commit.sha) !== null && this.string(commit.messageHeadline) !== null)
        .slice(0, 30)
        .map((commit) => ({
          sha: this.string(commit.sha) as string,
          url: this.string(commit.htmlUrl),
          message: this.string(commit.messageHeadline) as string,
          author: this.string(commit.authorLogin),
          authoredAt: this.date(commit.authoredAt),
        })),
      rootEntries: this.array(this.record(record.rootEntries).entries)
        .map((entry) => this.record(entry))
        .filter((entry) => this.string(entry.name) !== null && this.string(entry.path) !== null)
        .slice(0, 100)
        .map((entry) => ({
          name: this.string(entry.name) as string,
          path: this.string(entry.path) as string,
          type: this.rootEntryType(entry.type),
          size: this.nonNegativeIntegerOrNull(entry.size),
          url: this.string(entry.url),
        })),
      rootEntriesUnavailableReason: this.string(
        this.record(record.rootEntries).unavailableReason,
      )
        ? 'source_snapshot_unavailable'
        : null,
      treeEntries: this.array(repositoryTree.entries)
        .map((entry) => this.record(entry))
        .filter(
          (entry) =>
            this.string(entry.path) !== null &&
            this.string(entry.url) !== null,
        )
        .slice(0, 500)
        .map((entry) => ({
          path: this.string(entry.path) as string,
          type: this.treeEntryType(entry.type),
          size: this.nonNegativeIntegerOrNull(entry.size),
          url: this.string(entry.url) as string,
        })),
      treeTruncated: repositoryTree.truncated === true,
      treeUnavailableReason: this.string(repositoryTree.unavailableReason)
        ? 'source_snapshot_unavailable'
        : null,
    };
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private nonNegativeInteger(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? Math.floor(value)
      : 0;
  }

  private nonNegativeIntegerOrNull(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? Math.floor(value)
      : null;
  }

  private string(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  private array(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private rootEntryType(
    value: unknown,
  ): PublicProjectSourceStatisticsDto['rootEntries'][number]['type'] {
    if (value === 'file') return 'file';
    if (value === 'directory' || value === 'dir') return 'directory';
    if (value === 'symlink') return 'symlink';
    if (value === 'submodule') return 'submodule';
    return 'unknown';
  }

  private treeEntryType(
    value: unknown,
  ): PublicProjectSourceStatisticsDto['treeEntries'][number]['type'] {
    if (value === 'file') return 'file';
    if (value === 'directory') return 'directory';
    if (value === 'submodule') return 'submodule';
    return 'unknown';
  }

  private date(value: unknown): Date | null {
    if (typeof value !== 'string') return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}
