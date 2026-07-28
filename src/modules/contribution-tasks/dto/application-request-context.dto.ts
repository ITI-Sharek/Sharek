import {
  ContributionRequestRequirementKind,
  ContributionRequestStatus,
} from '@prisma/client';

export interface ApplicationRequestRequirementContextDto {
  id: string;
  kind: ContributionRequestRequirementKind;
  position: number;
  text: string;
}

export interface ApplicationRequestContextDto {
  id: string;
  ownerId: string;
  status: ContributionRequestStatus;
  applicationsCloseAt: Date | null;
  updatedAt: Date;
  requirements: ApplicationRequestRequirementContextDto[];
}
