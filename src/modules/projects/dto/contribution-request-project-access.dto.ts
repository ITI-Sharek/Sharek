import { ProjectStatus } from '@prisma/client';

export interface ContributionRequestProjectAccessDto {
  id: string;
  ownerId: string;
  status: ProjectStatus;
}
