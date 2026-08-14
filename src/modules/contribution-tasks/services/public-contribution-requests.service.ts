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
  ContributionRequestTechnologyFacetDto,
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
      technologyFacets: this.countTechnologyFacets(facetRows),
    };
  }

  async getById(
    requestId: string,
  ): Promise<PublicContributionRequestDetailDto> {
    const request = await this.database.contributionRequest.findFirst({
      where: { id: requestId, ...this.actionableWhere(new Date()) },
      include: {
        requirements: true,
        // `select`ed narrowly rather than `true`, so `confidence` and `source`
        // cannot reach a contributor by someone later spreading the row.
        skillRequirements: {
          select: {
            skill_name: true,
            required_level: true,
            kind: true,
            position: true,
          },
        },
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
      // Names and levels only. An applicant needs to know the bar to judge
      // whether to apply; how sure a model was about it is not their business
      // and invites arguing with the model instead of adding evidence.
      skillRequirements: orderSkillRequirements(request.skillRequirements)
        .map((skill) => ({
          skillName: skill.skill_name,
          requiredLevel: skill.required_level,
          kind: skill.kind,
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

  /**
   * Counted over every actionable Request, not over the current page: the
   * numbers describe what each filter would return, so they must not shrink as
   * the reader pages through results.
   */
  private countTechnologyFacets(
    rows: { technology_tags: Prisma.JsonValue }[],
  ): ContributionRequestTechnologyFacetDto[] {
    const counts = new Map<string, number>();
    for (const row of rows) {
      // Deduplicated per Request, so a tag repeated in one row still counts
      // once -- the number means "Requests", not "tag occurrences".
      for (const technology of new Set(this.readStringArray(row.technology_tags))) {
        counts.set(technology, (counts.get(technology) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([technology, count]) => ({ technology, count }))
      .sort((left, right) => left.technology.localeCompare(right.technology));
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

/**
 * Required rows first, then preferred, each by position — the same order the
 * prose Requirements are presented in. Not an alphabetical sort on `kind`:
 * that puts "preferred" ahead of "required" and leads a contributor with the
 * rows that cannot block them.
 */
const SKILL_KIND_ORDER: Record<ContributionRequestRequirementKind, number> = {
  [ContributionRequestRequirementKind.required]: 0,
  [ContributionRequestRequirementKind.preferred]: 1,
};

function orderSkillRequirements<
  T extends { kind: ContributionRequestRequirementKind; position: number },
>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (left, right) =>
      SKILL_KIND_ORDER[left.kind] - SKILL_KIND_ORDER[right.kind] ||
      left.position - right.position,
  );
}
