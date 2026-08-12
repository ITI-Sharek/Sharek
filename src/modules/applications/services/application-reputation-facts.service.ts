import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../shared/database/database.service';

@Injectable()
export class ApplicationReputationFactsService {
  constructor(private readonly database: DatabaseService) {}

  countAssignedTasks(contributorId: string): Promise<number> {
    return this.database.assignment.count({
      where: { contributor_id: contributorId },
    });
  }

  async listAssignedContributorIds(limit = 500): Promise<string[]> {
    const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 500);
    const assignments = await this.database.assignment.findMany({
      distinct: ['contributor_id'],
      select: { contributor_id: true },
      orderBy: { contributor_id: 'asc' },
      take: boundedLimit,
    });
    return assignments.map((assignment) => assignment.contributor_id);
  }
}
