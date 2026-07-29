import { ProjectStatus } from '@prisma/client';

/**
 * Minimal Project facts the contribution-proposals module needs to authorize
 * proposal submission, owner access, and intake decisions. Exposed through the
 * exported ProjectsService so the proposals module never reads Project tables
 * directly.
 */
export interface ProposalProjectContextDto {
  id: string;
  ownerId: string;
  status: ProjectStatus;
}
