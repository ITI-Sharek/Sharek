import {
  ContributionRequestDifficulty,
  ContributionRequestRequirementKind,
} from '@prisma/client';

export interface ContributorMatchingRequestContext {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  technologyTags: string[];
  requirements: Array<{
    id: string;
    kind: ContributionRequestRequirementKind;
    position: number;
    text: string;
  }>;
}

export interface ContributorTaskRecommendationContext
  extends ContributorMatchingRequestContext {
  projectName: string;
  difficulty: ContributionRequestDifficulty | null;
  applicationsCloseAt: Date;
  targetCompletionDate: Date | null;
  reward: number | null;
  rewardCurrency: string | null;
}
