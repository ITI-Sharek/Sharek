import {
  ContributionRequestDifficulty,
  ContributionRequestRequirementKind,
  ContributionRequestStatus,
} from '@prisma/client';

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
