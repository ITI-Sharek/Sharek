import {
  ContributionRequestDifficulty,
  ContributionRequestRequirementKind,
  ContributionRequestSkillInferenceStatus,
  ContributionRequestStatus,
} from '@prisma/client';

import { ContributionRequestSkillRequirementDto } from './contribution-request-skill-requirement.dto';

export interface ContributionRequestRequirementDto {
  id: string;
  kind: ContributionRequestRequirementKind;
  position: number;
  text: string;
}

export interface ContributionRequestAttributionDto {
  proposalId: string;
  contributorId: string;
  /**
   * Named, not just identified. The public request DTO already carries these;
   * the owner-facing one did not, so the draft produced by accepting a proposal
   * credited a raw UUID -- and that draft is the artefact the owner edits and
   * publishes, which is exactly where the credit needs to survive.
   */
  contributorName: string;
  /** Null until the contributor has chosen a username. */
  contributorUsername: string | null;
}

export interface ContributionRequestDto {
  id: string;
  projectId: string;
  title: string;
  description: string;
  requiredRequirements: ContributionRequestRequirementDto[];
  preferredRequirements: ContributionRequestRequirementDto[];
  /**
   * The machine-comparable level bar (DEC-078). Empty until inference runs or
   * the owner writes one; `P0-B02` makes at least one `required` row a
   * precondition of publishing.
   */
  skillRequirements: ContributionRequestSkillRequirementDto[];
  /**
   * Why the skill list looks the way it does. Without it an owner facing an
   * empty list and a publish button that refuses has nothing connecting the
   * two: `pending` means wait, `failed` means retry or type it yourself.
   */
  skillInferenceStatus: ContributionRequestSkillInferenceStatus;
  skillInferenceRanAt: Date | null;
  technologyTags: string[];
  applicationsCloseTime: Date | null;
  targetCompletionDate: string | null;
  difficulty: ContributionRequestDifficulty | null;
  reward: string | null;
  rewardCurrency: string | null;
  status: ContributionRequestStatus;
  attribution: ContributionRequestAttributionDto | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ContributionRequestsByStatusDto = {
  [status in ContributionRequestStatus]: ContributionRequestDto[];
};

export interface OwnerProjectContributionRequestsDto {
  projectId: string;
  totalCount: number;
  byStatus: ContributionRequestsByStatusDto;
}
