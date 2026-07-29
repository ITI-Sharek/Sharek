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
