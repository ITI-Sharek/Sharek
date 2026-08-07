import { Prisma } from '@prisma/client';

import { ContributionRequestDto } from '../dto/contribution-request-response.dto';

/**
 * Mirrors the select used for the public request DTO and for proposers, so a
 * contributor is described the same way wherever they are surfaced.
 */
export const ATTRIBUTED_CONTRIBUTOR_SELECT = {
  select: { id: true, username: true, first_name: true, last_name: true },
} as const;

export const CONTRIBUTION_REQUEST_INCLUDE = {
  requirements: true,
  attributedContributor: ATTRIBUTED_CONTRIBUTOR_SELECT,
} satisfies Prisma.ContributionRequestInclude;

export type ContributionRequestWithRequirements =
  Prisma.ContributionRequestGetPayload<{
    include: typeof CONTRIBUTION_REQUEST_INCLUDE;
  }>;

export function toContributionRequestDto(
  request: ContributionRequestWithRequirements,
): ContributionRequestDto {
  const requirements = [...request.requirements].sort(
    (left, right) => left.position - right.position,
  );

  return {
    id: request.id,
    projectId: request.project_id,
    title: request.title,
    description: request.description,
    requiredRequirements: requirements
      .filter((requirement) => requirement.kind === 'required')
      .map(toRequirementDto),
    preferredRequirements: requirements
      .filter((requirement) => requirement.kind === 'preferred')
      .map(toRequirementDto),
    technologyTags: readStringArray(request.technology_tags),
    applicationsCloseTime: request.applications_close_at,
    targetCompletionDate: request.target_completion_date
      ? request.target_completion_date.toISOString().slice(0, 10)
      : null,
    difficulty: request.difficulty,
    reward: request.reward?.toFixed(2) ?? null,
    rewardCurrency: request.reward_currency,
    status: request.status,
    attribution:
      request.origin_proposal_id && request.attributedContributor
        ? {
            proposalId: request.origin_proposal_id,
            contributorId: request.attributedContributor.id,
            contributorName:
              `${request.attributedContributor.first_name} ${request.attributedContributor.last_name}`.trim(),
            contributorUsername: request.attributedContributor.username,
          }
        : null,
    publishedAt: request.published_at,
    createdAt: request.created_at,
    updatedAt: request.updated_at,
  };
}

function toRequirementDto(
  requirement: ContributionRequestWithRequirements['requirements'][number],
) {
  return {
    id: requirement.id,
    kind: requirement.kind,
    position: requirement.position,
    text: requirement.text,
  };
}

function readStringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
