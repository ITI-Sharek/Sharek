import { Injectable } from '@nestjs/common';
import { Prisma, Project, ProjectStatus } from '@prisma/client';

import { DatabaseService } from '../../../shared/database/database.service';
import {
  ApplicationError,
  NotFoundApplicationError,
} from '../../../shared/errors/application.error';
import {
  PublicProjectDto,
  PublicProjectPageDto,
} from '../dto/project-public-response.dto';
import { ProjectPageQueryDto } from '../dto/project-publication.dto';

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
    });
    if (!project) {
      throw new NotFoundApplicationError(
        'Project was not found',
        'PROJECT_NOT_FOUND',
      );
    }
    return this.present(project);
  }

  private present(project: Project): PublicProjectDto {
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
      publishedAt: project.published_at,
      source: publicAttribution
        ? {
            provider: 'github',
            attributionStatus: 'public',
            fullName: this.fullName(project.github_repo_url),
            repositoryUrl: project.github_repo_url,
            fetchedAt: project.source_fetched_at,
          }
        : { provider: 'github', attributionStatus: 'withheld' },
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
}
