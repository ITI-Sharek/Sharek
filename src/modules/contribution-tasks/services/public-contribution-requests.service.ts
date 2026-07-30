import { Injectable } from '@nestjs/common';
import {
  ContributionRequest,
  ContributionRequestRequirementKind,
  ContributionRequestStatus,
  Prisma,
} from '@prisma/client';

import { DatabaseService } from '../../../shared/database/database.service';
import { NotFoundApplicationError } from '../../../shared/errors/application.error';
import { ContributionRequestProjectReferenceDto } from '../../projects/dto/contribution-request-project-reference.dto';
import { ProjectsService } from '../../projects/projects.service';
import {
  ContributionRequestFeedQueryDto,
  ContributionRequestFeedResponseDto,
  PublicContributionRequestDetailDto,
  PublicContributionRequestListItemDto,
} from '../dto/contribution-request-public.dto';

@Injectable()
export class PublicContributionRequestsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly projectsService: ProjectsService,
  ) {}

  async list(
    query: ContributionRequestFeedQueryDto,
  ): Promise<ContributionRequestFeedResponseDto> {
    const now = new Date();
    const [publishedProjects, projectTitleMatches] = await Promise.all([
      this.projectsService.listContributionRequestProjectReferences({}),
      query.q
        ? this.projectsService.listContributionRequestProjectReferences({
            titleContains: query.q,
          })
        : [],
    ]);
    if (publishedProjects.length === 0) {
      return { items: [], totalCount: 0, technologyFacets: [] };
    }
    const actionableWhere = this.actionableWhere(
      now,
      publishedProjects.map((project) => project.id),
    );
    const where = this.buildDiscoveryWhere(
      actionableWhere,
      query,
      projectTitleMatches.map((project) => project.id),
    );
    const [totalCount, requests, facetRows] = await Promise.all([
      this.database.contributionRequest.count({ where }),
      this.database.contributionRequest.findMany({
        where,
        orderBy: [
          { applications_close_at: 'asc' },
          { published_at: 'desc' },
          { id: 'asc' },
        ],
      }),
      this.database.contributionRequest.findMany({
        where: actionableWhere,
        select: { technology_tags: true },
      }),
    ]);
    const projectsById = new Map(
      publishedProjects.map((project) => [project.id, project]),
    );

    return {
      items: requests.map((request) => {
        const project = projectsById.get(request.project_id);
        if (!project) throw this.requestNotFound();
        return this.toListItem(request, project);
      }),
      totalCount,
      technologyFacets: Array.from(
        new Set(
          facetRows.flatMap((request) =>
            this.readStringArray(request.technology_tags),
          ),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    };
  }

  async getById(
    requestId: string,
  ): Promise<PublicContributionRequestDetailDto> {
    const request = await this.database.contributionRequest.findFirst({
      where: { id: requestId, ...this.actionableWhere(new Date()) },
      include: {
        requirements: true,
        attributedContributor: {
          select: {
            id: true,
            username: true,
            first_name: true,
            last_name: true,
          },
        },
      },
    });
    if (!request) throw this.requestNotFound();
    const [project] =
      await this.projectsService.listContributionRequestProjectReferences({
        projectIds: [request.project_id],
      });
    if (!project) throw this.requestNotFound();

    const orderedRequirements = [
      ...request.requirements
        .filter(
          (requirement) =>
            requirement.kind === ContributionRequestRequirementKind.required,
        )
        .sort((left, right) => left.position - right.position),
      ...request.requirements
        .filter(
          (requirement) =>
            requirement.kind === ContributionRequestRequirementKind.preferred,
        )
        .sort((left, right) => left.position - right.position),
    ];
    return {
      ...this.toListItem(request, project),
      description: request.description,
      status: 'published',
      requirements: orderedRequirements.map((requirement) => ({
        id: requirement.id,
        text: requirement.text,
        classification: requirement.kind,
      })),
      attribution: request.attributedContributor
        ? {
            contributorId: request.attributedContributor.id,
            contributorName:
              `${request.attributedContributor.first_name} ${request.attributedContributor.last_name}`.trim(),
            contributorUsername: request.attributedContributor.username,
          }
        : null,
    };
  }

  private actionableWhere(
    now: Date,
    publishedProjectIds?: string[],
  ): Prisma.ContributionRequestWhereInput {
    return {
      status: ContributionRequestStatus.published,
      published_at: { not: null },
      applications_close_at: { gt: now },
      ...(publishedProjectIds
        ? { project_id: { in: publishedProjectIds } }
        : {}),
    };
  }

  private buildDiscoveryWhere(
    actionableWhere: Prisma.ContributionRequestWhereInput,
    query: ContributionRequestFeedQueryDto,
    projectTitleMatchIds: string[],
  ): Prisma.ContributionRequestWhereInput {
    const conditions: Prisma.ContributionRequestWhereInput[] = [
      actionableWhere,
    ];
    if (query.difficulty) conditions.push({ difficulty: query.difficulty });
    if (query.hasReward === true) conditions.push({ reward: { not: null } });
    if (query.hasReward === false) conditions.push({ reward: null });
    if (query.technologies?.length) {
      conditions.push({
        OR: query.technologies.map((technology) => ({
          technology_tags: { array_contains: [technology] },
        })),
      });
    }
    if (query.q) {
      conditions.push({
        OR: [
          { title: { contains: query.q, mode: 'insensitive' } },
          { description: { contains: query.q, mode: 'insensitive' } },
          ...(projectTitleMatchIds.length
            ? [{ project_id: { in: projectTitleMatchIds } }]
            : []),
        ],
      });
    }
    return { AND: conditions };
  }

  private toListItem(
    request: ContributionRequest,
    project: ContributionRequestProjectReferenceDto,
  ): PublicContributionRequestListItemDto {
    if (!request.applications_close_at) throw this.requestNotFound();
    return {
      id: request.id,
      projectId: project.id,
      projectName: project.title,
      projectSlug: project.slug,
      title: request.title,
      technologyTags: this.readStringArray(request.technology_tags),
      difficulty: request.difficulty,
      applicationsCloseAt: request.applications_close_at,
      targetCompletionDate: request.target_completion_date
        ? request.target_completion_date.toISOString().slice(0, 10)
        : null,
      reward:
        request.reward && request.reward_currency
          ? {
              amount: Number(request.reward.toString()),
              currency: request.reward_currency,
            }
          : null,
    };
  }

  private readStringArray(value: Prisma.JsonValue): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private requestNotFound(): NotFoundApplicationError {
    return new NotFoundApplicationError(
      'Contribution Request was not found',
      'CONTRIBUTION_REQUEST_NOT_FOUND',
    );
  }
}
