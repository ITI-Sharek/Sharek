import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../shared/database/database.service';

export interface ContributionRequestTechnologyTagsDto {
  contributionRequestId: string;
  technologyTags: string[];
}

@Injectable()
export class ContributionRequestReputationFactsService {
  constructor(private readonly database: DatabaseService) {}

  async listTechnologyTags(
    contributionRequestIds: string[],
  ): Promise<ContributionRequestTechnologyTagsDto[]> {
    if (contributionRequestIds.length === 0) return [];
    const requests = await this.database.contributionRequest.findMany({
      where: { id: { in: [...new Set(contributionRequestIds)] } },
      select: { id: true, technology_tags: true },
      orderBy: { id: 'asc' },
    });
    return requests.map((request) => ({
      contributionRequestId: request.id,
      technologyTags: this.readStringArray(request.technology_tags),
    }));
  }

  private readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string');
  }
}
