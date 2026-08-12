import { Injectable } from '@nestjs/common';
import {
  ContributionRequestRequirementKind,
  ContributionRequestStatus,
} from '@prisma/client';

import { DatabaseService } from '../../../shared/database/database.service';
import { ProjectsService } from '../../projects/projects.service';

export interface SkillGapGuidanceRequestContext {
  id: string;
  requirements: Array<{
    id: string;
    kind: ContributionRequestRequirementKind;
    position: number;
    text: string;
  }>;
}

@Injectable()
export class SkillGapGuidanceContextService {
  constructor(
    private readonly database: DatabaseService,
    private readonly projectsService: ProjectsService,
  ) {}

  async getPublishedRequest(
    requestId: string,
  ): Promise<SkillGapGuidanceRequestContext | null> {
    const request = await this.database.contributionRequest.findFirst({
      where: {
        id: requestId,
        status: ContributionRequestStatus.published,
        published_at: { not: null },
        applications_close_at: { gt: new Date() },
      },
      select: {
        id: true,
        project_id: true,
        requirements: {
          select: { id: true, kind: true, position: true, text: true },
          orderBy: [{ kind: 'asc' }, { position: 'asc' }],
        },
      },
    });
    if (!request) return null;

    const projectIsPublished =
      await this.projectsService.isContributionRequestProjectPublished(
        request.project_id,
      );
    if (!projectIsPublished) return null;

    return {
      id: request.id,
      requirements: request.requirements,
    };
  }
}
